import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, forceLogout } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ── Types (Supabase returns snake_case column names) ──────────────────────────
type Me = {
  id: string;
  email: string;
  profile: { full_name: string; nickname?: string } | null;
  memberships: { organization_id: string; role_code: string; organizations: { name: string; org_type: string } | null }[];
};
type StaffMember = {
  id: string;
  user_id: string;
  role_code: string;
  title: string | null;
  person_profiles: { full_name: string; email: string | null; avatar_url: string | null } | null;
};
type Organization = {
  id: string;
  org_type: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
};
type Plan = {
  id: string;
  name: string;
  monthly_price: number;
  annual_price: number;
  max_elders: number;
  features: string;
};
type Subscription = {
  id: string;
  organization_id: string;
  plan_id: string;
  billing_cycle: string;
  status: string;
  elder_count: number;
  start_date: string;
  end_date: string;
  next_billing_date: string;
  amount: number;
  organizations?: { name: string };
  plans?: { name: string };
};
type Invoice = {
  id: string;
  invoice_no: string;
  organization_id: string;
  subscription_id: string | null;
  issue_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
  notes: string | null;
  organizations?: { name: string };
  created_at: string;
};
type Payment = {
  id: string;
  invoice_id: string;
  organization_id: string;
  amount: number;
  method: string;
  status: string;
  transaction_id: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};
type ServiceRecord = {
  id: string;
  organization_id: string;
  month: string;
  elder_count: number;
  conversation_count: number;
  alert_count: number;
  active_elders: number;
};

// ── Form initial states ────────────────────────────────────────────────────────
const INITIAL_ORG_FORM = {
  orgType: "care_institution" as "individual_family" | "care_institution" | "gov_welfare_bureau",
  name: "",
  legalName: "",
  taxId: "",
  address: "",
  phone: "",
  email: "",
};

const INITIAL_STAFF_FORM = {
  email: "",
  password: "",
  displayName: "",
  role: "sales",
};

// ── UI helpers ─────────────────────────────────────────────────────────────────
const ORG_TYPE_LABEL: Record<string, string> = {
  care_institution: "機構",
  gov_welfare_bureau: "社會局/社福",
  individual_family: "個人",
};
const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800",
  suspended: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-600",
  paid: "bg-green-100 text-green-800", unpaid: "bg-yellow-100 text-yellow-800",
  overdue: "bg-red-100 text-red-800", success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800", refunded: "bg-purple-100 text-purple-800",
  trial: "bg-blue-100 text-blue-800",
};
const STATUS_ZH: Record<string, string> = {
  active: "啟用", pending: "待審核", suspended: "停用", cancelled: "已取消",
  paid: "已付款", unpaid: "待付款", overdue: "逾期", success: "成功",
  failed: "失敗", refunded: "退款", trial: "試用",
};
const METHOD_ZH: Record<string, string> = {
  newebpay: "藍新金流", ecpay: "綠界科技", stripe: "Stripe",
  bank_transfer: "銀行匯款", manual: "手動記錄",
};

function Badge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_ZH[status] ?? status}</span>;
}

function Stat({ label, value, sub, color = "blue" }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = { blue: "text-blue-600", green: "text-green-600", amber: "text-amber-600", red: "text-red-600" };
  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

export default function StaffDashboard() {
  const { toast } = useToast();
  const [section, setSection] = useState<"overview"|"clients"|"subscriptions"|"invoices"|"payments"|"service"|"staff">("overview");

  // Form state (all IDs are strings / UUIDs)
  const [newInvForm, setNewInvForm] = useState({ organizationId: "", subscriptionId: "", periodStart: "", periodEnd: "", issueDate: "", dueDate: "", subtotal: "", tax: "5", notes: "" });
  const [newPayForm, setNewPayForm] = useState({ invoiceId: "", organizationId: "", amount: "", method: "bank_transfer", notes: "" });
  const [showPayModal, setShowPayModal] = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [newOrgForm, setNewOrgForm] = useState(INITIAL_ORG_FORM);
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubForm, setNewSubForm] = useState({ organizationId: "", planId: "", billingCycle: "monthly", elderCount: "1", amount: "", startDate: "", endDate: "" });
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState(INITIAL_STAFF_FORM);

  // ── Queries ────────────────────────────────────────────────
  const { data: me } = useQuery<Me>({ queryKey: ["/api/me"] });
  const { data: staffList = [] } = useQuery<StaffMember[]>({ queryKey: ["/api/staff/members"] });
  const { data: organizations = [] } = useQuery<Organization[]>({ queryKey: ["/api/organizations"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/subscriptions"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: payments = [] } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["/api/plans"] });

  // ── Computed stats (no separate stats endpoint needed) ─────
  const stats = useMemo(() => {
    const activeClients = organizations.filter(o => o.status === "active").length;
    const pendingClients = organizations.filter(o => o.status === "pending").length;
    const activeSubscriptions = subscriptions.filter(s => s.status === "active").length;
    const unpaidInvs = invoices.filter(i => i.status === "unpaid" || i.status === "overdue");
    const unpaidInvoices = unpaidInvs.length;
    const unpaidAmount = unpaidInvs.reduce((sum, i) => sum + Number(i.total), 0);
    const paidAmount = payments.filter(p => p.status === "success").reduce((sum, p) => sum + Number(p.amount), 0);
    const mrr = subscriptions
      .filter(s => s.status === "active")
      .reduce((sum, s) => sum + (s.billing_cycle === "annual" ? Number(s.amount) / 12 : Number(s.amount)), 0);
    return { activeClients, pendingClients, activeSubscriptions, unpaidInvoices, unpaidAmount, paidAmount, mrr };
  }, [organizations, subscriptions, invoices, payments]);

  // ── Mutations ──────────────────────────────────────────────
  const activateMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/organizations/${id}`, { status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/organizations"] }); toast({ title: "已開通客戶" }); },
  });
  const suspendMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/organizations/${id}`, { status: "suspended" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/organizations"] }); toast({ title: "已停用客戶" }); },
  });
  const createInvMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/invoices", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/invoices"] }); setShowInvModal(false); toast({ title: "帳單已建立" }); },
  });
  const createPayMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/payments", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setShowPayModal(false);
      toast({ title: "付款紀錄已新增，帳單標記為已付款" });
    },
  });
  const createClientMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/organizations", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      setNewOrgForm(INITIAL_ORG_FORM);
      setShowClientModal(false);
      toast({ title: "客戶已新增" });
    },
    onError: (error: Error) => {
      toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    },
  });
  const createSubMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/subscriptions", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] }); setShowSubModal(false); toast({ title: "訂閱已新增" }); },
  });
  const createStaffMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/staff/members", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/members"] });
      setNewStaffForm(INITIAL_STAFF_FORM);
      setShowStaffModal(false);
      toast({ title: "員工已新增" });
    },
    onError: (error: Error) => {
      toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    },
  });
  const logout = async () => { await forceLogout(); };

  // ── Helpers ────────────────────────────────────────────────
  const orgName = (id: string) => {
    const o = organizations.find(o => o.id === id);
    return o ? o.name : `機構#${id.slice(0, 8)}`;
  };
  const planName = (id: string) => plans.find(p => p.id === id)?.name ?? `方案#${id.slice(0, 8)}`;
  const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");

  // Current user display
  const myName = me?.profile?.full_name || me?.email || "";
  const myRole = me?.memberships?.[0]?.role_code || "";
  const roleLabel = myRole === "superadmin" ? "超級管理員" : myRole === "sales" ? "業務" : myRole === "finance" ? "財務" : myRole || "員工";

  const navItems = [
    { key: "overview", label: "總覽", icon: "📊" },
    { key: "clients", label: "客戶管理", icon: "🏢" },
    { key: "subscriptions", label: "訂閱管理", icon: "📋" },
    { key: "invoices", label: "帳單管理", icon: "🧾" },
    { key: "payments", label: "金流紀錄", icon: "💳" },
    { key: "service", label: "服務紀錄", icon: "📈" },
    { key: "staff", label: "員工管理", icon: "👥" },
  ] as const;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-blue-950 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-blue-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-sm font-bold">H</div>
            <div>
              <p className="text-sm font-bold text-white">HuHu AI</p>
              <p className="text-xs text-blue-300">員工後台</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setSection(item.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${section === item.key ? "bg-blue-600 text-white" : "text-blue-200 hover:bg-blue-800 hover:text-white"}`}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-blue-800">
          <div className="text-xs text-blue-300 mb-2 px-1">{myName} · {roleLabel}</div>
          <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-blue-800 hover:text-white transition-colors">🚪 登出</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">

          {/* ── Overview ── */}
          {section === "overview" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">營運總覽</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat label="啟用客戶" value={stats.activeClients} sub="家" color="blue" />
                <Stat label="待審核" value={stats.pendingClients} sub="家" color="amber" />
                <Stat label="月均收入 (MRR)" value={`NT$ ${fmt(stats.mrr)}`} color="green" />
                <Stat label="待收帳款" value={`NT$ ${fmt(stats.unpaidAmount)}`} sub={`${stats.unpaidInvoices} 張帳單`} color="red" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Stat label="累計已收款" value={`NT$ ${fmt(stats.paidAmount)}`} color="green" />
                <Stat label="進行中訂閱" value={stats.activeSubscriptions} sub="份" color="blue" />
              </div>
              {/* Recent invoices */}
              <div className="bg-white rounded-xl border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">最新帳單</h2>
                  <button onClick={() => setSection("invoices")} className="text-sm text-blue-600 hover:underline">查看全部</button>
                </div>
                <div className="divide-y">
                  {[...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map(inv => (
                    <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inv.invoice_no}</p>
                        <p className="text-xs text-gray-500">{orgName(inv.organization_id)} · 到期 {inv.due_date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">NT$ {fmt(inv.total)}</p>
                        <Badge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Clients ── */}
          {section === "clients" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">客戶管理</h1>
                <button onClick={() => setShowClientModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增客戶</button>
              </div>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["客戶名稱","類型","Email","電話","狀態","建立日期","操作"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {organizations.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-4 py-3 text-gray-600">{ORG_TYPE_LABEL[c.org_type] ?? c.org_type}</td>
                        <td className="px-4 py-3 text-gray-600">{c.email}</td>
                        <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                        <td className="px-4 py-3"><Badge status={c.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{c.created_at?.slice(0,10)}</td>
                        <td className="px-4 py-3 flex gap-1">
                          {c.status === "pending" && (
                            <button onClick={() => activateMutation.mutate(c.id)} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">✓ 開通</button>
                          )}
                          {c.status === "active" && (
                            <button onClick={() => suspendMutation.mutate(c.id)} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">停用</button>
                          )}
                          {c.status === "suspended" && (
                            <button onClick={() => activateMutation.mutate(c.id)} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">重啟</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* New Org Modal */}
              {showClientModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">新增客戶</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">類型</label>
                        <select value={newOrgForm.orgType} onChange={e=>setNewOrgForm(f=>({...f,orgType:e.target.value as any}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="care_institution">機構</option>
                          <option value="gov_welfare_bureau">社會局/社福</option>
                          <option value="individual_family">個人</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">機構名稱</label>
                          <input value={newOrgForm.name} onChange={e=>setNewOrgForm(f=>({...f,name:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">法定名稱</label>
                          <input value={newOrgForm.legalName} onChange={e=>setNewOrgForm(f=>({...f,legalName:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                        <input value={newOrgForm.email} onChange={e=>setNewOrgForm(f=>({...f,email:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">電話</label>
                          <input value={newOrgForm.phone} onChange={e=>setNewOrgForm(f=>({...f,phone:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">統編</label>
                          <input value={newOrgForm.taxId} onChange={e=>setNewOrgForm(f=>({...f,taxId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">地址</label>
                        <input value={newOrgForm.address} onChange={e=>setNewOrgForm(f=>({...f,address:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => createClientMutation.mutate({ orgType: newOrgForm.orgType, name: newOrgForm.name, legalName: newOrgForm.legalName || null, taxId: newOrgForm.taxId || null, address: newOrgForm.address || null, phone: newOrgForm.phone || null, email: newOrgForm.email || null })} disabled={createClientMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">建立</button>
                      <button onClick={()=>{ setNewOrgForm(INITIAL_ORG_FORM); setShowClientModal(false); }} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Subscriptions ── */}
          {section === "subscriptions" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">訂閱管理</h1>
                <button onClick={() => setShowSubModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增訂閱</button>
              </div>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["客戶","方案","計費週期","長輩數","金額","狀態","到期日","下次計費"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {subscriptions.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{s.organizations?.name ?? orgName(s.organization_id)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.plans?.name ?? planName(s.plan_id)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.billing_cycle === "annual" ? "年繳" : "月繳"}</td>
                        <td className="px-4 py-3 text-gray-600">{s.elder_count} 位</td>
                        <td className="px-4 py-3 font-medium">NT$ {fmt(s.amount)}</td>
                        <td className="px-4 py-3"><Badge status={s.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{s.end_date}</td>
                        <td className="px-4 py-3 text-gray-500">{s.next_billing_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* New Sub Modal */}
              {showSubModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">新增訂閱</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">客戶</label>
                        <select value={newSubForm.organizationId} onChange={e=>setNewSubForm(f=>({...f,organizationId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇客戶</option>
                          {organizations.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">方案</label>
                        <select value={newSubForm.planId} onChange={e=>setNewSubForm(f=>({...f,planId:e.target.value,amount:plans.find(p=>p.id===e.target.value)?.monthly_price.toString()||""}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇方案</option>
                          {plans.map(p=><option key={p.id} value={p.id}>{p.name} (NT${p.monthly_price}/月)</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">計費週期</label>
                          <select value={newSubForm.billingCycle} onChange={e=>setNewSubForm(f=>({...f,billingCycle:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="monthly">月繳 / 首月</option>
                            <option value="annual">年繳</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">總金額 (NT$)</label>
                          <input type="number" value={newSubForm.amount} onChange={e=>setNewSubForm(f=>({...f,amount:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">長輩數</label>
                          <input type="number" value={newSubForm.elderCount} onChange={e=>setNewSubForm(f=>({...f,elderCount:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">開始日期</label>
                          <input type="date" value={newSubForm.startDate} onChange={e=>setNewSubForm(f=>({...f,startDate:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">結束日期</label>
                          <input type="date" value={newSubForm.endDate} onChange={e=>setNewSubForm(f=>({...f,endDate:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => {
                        createSubMutation.mutate({ organizationId: newSubForm.organizationId, planId: newSubForm.planId, billingCycle: newSubForm.billingCycle, elderCount: Number(newSubForm.elderCount), amount: Number(newSubForm.amount), startDate: newSubForm.startDate, endDate: newSubForm.endDate, nextBillingDate: newSubForm.endDate, status: "active" });
                      }} disabled={createSubMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">建立</button>
                      <button onClick={()=>setShowSubModal(false)} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Invoices ── */}
          {section === "invoices" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">帳單管理</h1>
                <button onClick={() => setShowInvModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增帳單</button>
              </div>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["帳單編號","客戶","發票日","到期日","小計","稅","合計","狀態","備註"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...invoices].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-blue-700">{inv.invoice_no}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{inv.organizations?.name ?? orgName(inv.organization_id)}</td>
                        <td className="px-4 py-3 text-gray-500">{inv.issue_date}</td>
                        <td className="px-4 py-3 text-gray-500">{inv.due_date}</td>
                        <td className="px-4 py-3">NT$ {fmt(inv.subtotal)}</td>
                        <td className="px-4 py-3 text-gray-500">NT$ {fmt(inv.tax)}</td>
                        <td className="px-4 py-3 font-semibold">NT$ {fmt(inv.total)}</td>
                        <td className="px-4 py-3"><Badge status={inv.status} /></td>
                        <td className="px-4 py-3 text-gray-500 max-w-[120px] truncate">{inv.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* New Invoice Modal */}
              {showInvModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-lg p-6">
                    <h2 className="text-lg font-bold mb-4">新增帳單</h2>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">客戶</label>
                          <select value={newInvForm.organizationId} onChange={e=>setNewInvForm(f=>({...f,organizationId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">選擇客戶</option>
                            {organizations.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">訂閱</label>
                          <select value={newInvForm.subscriptionId} onChange={e=>setNewInvForm(f=>({...f,subscriptionId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">選擇訂閱（可選）</option>
                            {subscriptions.filter(s=>newInvForm.organizationId?s.organization_id===newInvForm.organizationId:true).map(s=><option key={s.id} value={s.id}>{s.plans?.name ?? planName(s.plan_id)} - {s.billing_cycle==="annual"?"年繳":"月繳"}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">服務期間開始</label>
                          <input type="date" value={newInvForm.periodStart} onChange={e=>setNewInvForm(f=>({...f,periodStart:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">服務期間結束</label>
                          <input type="date" value={newInvForm.periodEnd} onChange={e=>setNewInvForm(f=>({...f,periodEnd:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">發票日期</label>
                          <input type="date" value={newInvForm.issueDate} onChange={e=>setNewInvForm(f=>({...f,issueDate:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">付款截止</label>
                          <input type="date" value={newInvForm.dueDate} onChange={e=>setNewInvForm(f=>({...f,dueDate:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">小計 (NT$)</label>
                          <input type="number" value={newInvForm.subtotal} onChange={e=>setNewInvForm(f=>({...f,subtotal:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="10000"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">稅額 (NT$)</label>
                          <input type="number" value={newInvForm.tax} onChange={e=>setNewInvForm(f=>({...f,tax:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="500"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">備註</label>
                        <input value={newInvForm.notes} onChange={e=>setNewInvForm(f=>({...f,notes:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="備註說明"/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => {
                        const sub = Number(newInvForm.subtotal); const tax = Number(newInvForm.tax);
                        createInvMutation.mutate({ organizationId: newInvForm.organizationId, subscriptionId: newInvForm.subscriptionId || null, periodStart: newInvForm.periodStart, periodEnd: newInvForm.periodEnd, issueDate: newInvForm.issueDate, dueDate: newInvForm.dueDate, subtotal: sub, tax, total: sub + tax, status: "unpaid", notes: newInvForm.notes || null });
                      }} disabled={createInvMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">建立帳單</button>
                      <button onClick={()=>setShowInvModal(false)} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payments ── */}
          {section === "payments" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">金流紀錄</h1>
                <button onClick={() => setShowPayModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增付款</button>
              </div>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["帳單","客戶","金額","付款方式","狀態","交易編號","付款時間","備註"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...payments].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(p => {
                      const inv = invoices.find(i => i.id === p.invoice_id);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-blue-700 font-mono text-xs">{inv?.invoice_no ?? `INV#${p.invoice_id.slice(0,8)}`}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{orgName(p.organization_id)}</td>
                          <td className="px-4 py-3 font-semibold">NT$ {fmt(p.amount)}</td>
                          <td className="px-4 py-3 text-gray-600">{METHOD_ZH[p.method] ?? p.method}</td>
                          <td className="px-4 py-3"><Badge status={p.status} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.transaction_id}</td>
                          <td className="px-4 py-3 text-gray-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString("zh-TW") : "-"}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-[100px] truncate">{p.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* New Payment Modal */}
              {showPayModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">新增付款紀錄</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">對應帳單</label>
                        <select value={newPayForm.invoiceId} onChange={e=>{
                          const inv = invoices.find(i => i.id === e.target.value);
                          setNewPayForm(f=>({...f, invoiceId: e.target.value, organizationId: inv?.organization_id ?? "", amount: inv ? String(inv.total) : "" }));
                        }} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇帳單</option>
                          {invoices.filter(i=>i.status!=="paid").map(i=><option key={i.id} value={i.id}>{i.invoice_no} — {i.organizations?.name ?? orgName(i.organization_id)} — NT${fmt(i.total)}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">金額 (NT$)</label>
                          <input type="number" value={newPayForm.amount} onChange={e=>setNewPayForm(f=>({...f,amount:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">付款方式</label>
                          <select value={newPayForm.method} onChange={e=>setNewPayForm(f=>({...f,method:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="bank_transfer">銀行匯款</option>
                            <option value="newebpay">藍新金流</option>
                            <option value="ecpay">綠界科技</option>
                            <option value="stripe">Stripe</option>
                            <option value="manual">手動記錄</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">備註</label>
                        <input value={newPayForm.notes} onChange={e=>setNewPayForm(f=>({...f,notes:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="匯款確認、備注..."/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => {
                        createPayMutation.mutate({ invoiceId: newPayForm.invoiceId, organizationId: newPayForm.organizationId, amount: Number(newPayForm.amount), method: newPayForm.method, status: "success", paidAt: new Date().toISOString(), notes: newPayForm.notes || null });
                      }} disabled={createPayMutation.isPending} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700">標記已付款</button>
                      <button onClick={()=>setShowPayModal(false)} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Service Records ── */}
          {section === "service" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">服務使用紀錄</h1>
              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["客戶","月份","長輩數","對話次數","警報數","活躍長輩"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...serviceRecords].sort((a,b)=>b.month.localeCompare(a.month)).map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{orgName(r.organization_id)}</td>
                        <td className="px-4 py-3 text-gray-600">{r.month}</td>
                        <td className="px-4 py-3">{r.elder_count} 位</td>
                        <td className="px-4 py-3">{r.conversation_count.toLocaleString()}</td>
                        <td className="px-4 py-3">{r.alert_count}</td>
                        <td className="px-4 py-3">{r.active_elders} 位</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Staff ── */}
          {section === "staff" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">員工管理</h1>
                <button onClick={() => setShowStaffModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">+ 新增員工</button>
              </div>
              <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["姓名","Email","角色","狀態"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {staffList.map(s=>(
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{s.person_profiles?.full_name ?? "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{s.person_profiles?.email ?? "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{s.role_code === "superadmin" ? "超級管理員" : s.role_code === "sales" ? "業務" : s.role_code === "finance" ? "財務" : "客服"}</td>
                        <td className="px-4 py-3"><Badge status="active"/></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* New Staff Modal */}
              {showStaffModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">新增員工</h2>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">姓名</label>
                          <input value={newStaffForm.displayName} onChange={e=>setNewStaffForm(f=>({...f,displayName:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">角色</label>
                          <select value={newStaffForm.role} onChange={e=>setNewStaffForm(f=>({...f,role:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="superadmin">超級管理員</option>
                            <option value="sales">業務</option>
                            <option value="finance">財務</option>
                            <option value="support">客服</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Email（登入帳號）</label>
                        <input value={newStaffForm.email} onChange={e=>setNewStaffForm(f=>({...f,email:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">初始密碼（可留空自動產生）</label>
                        <input type="password" value={newStaffForm.password} onChange={e=>setNewStaffForm(f=>({...f,password:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => createStaffMutation.mutate(newStaffForm)} disabled={createStaffMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">建立</button>
                      <button onClick={()=>{ setNewStaffForm(INITIAL_STAFF_FORM); setShowStaffModal(false); }} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
