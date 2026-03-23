import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Staff = { id: number; displayName: string; role: string; username: string; email: string; isActive: boolean };
type Client = { id: number; clientType: string; orgName: string | null; contactName: string; contactEmail: string; contactPhone: string | null; taxId: string | null; status: string; notes: string | null; assignedTo: number | null; createdAt: string; activatedAt: string | null };
type Plan = { id: number; name: string; monthlyPrice: number; annualPrice: number; maxElders: number; features: string };
type Subscription = { id: number; clientId: number; planId: number; billingCycle: string; status: string; elderCount: number; startDate: string; endDate: string; nextBillingDate: string; amount: number };
type Invoice = { id: number; invoiceNo: string; clientId: number; issueDate: string; dueDate: string; periodStart: string; periodEnd: string; subtotal: number; tax: number; total: number; status: string; notes: string | null };
type Payment = { id: number; invoiceId: number; clientId: number; amount: number; method: string; status: string; transactionId: string | null; paidAt: string | null; notes: string | null };
type ServiceRecord = { id: number; clientId: number; month: string; elderCount: number; conversationCount: number; alertCount: number; activeElders: number };
type Stats = { activeClients: number; pendingClients: number; activeSubscriptions: number; unpaidInvoices: number; unpaidAmount: number; paidAmount: number; mrr: number };

const INITIAL_CLIENT_FORM = {
  username: "",
  password: "",
  orgName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  taxId: "",
  address: "",
  clientType: "institution",
};

const INITIAL_STAFF_FORM = {
  username: "",
  password: "",
  displayName: "",
  role: "sales",
  email: "",
};

const TYPE_LABEL: Record<string, string> = { institution: "機構", social_welfare: "社會局/社福", individual: "個人" };
const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800",
  suspended: "bg-red-100 text-red-800", cancelled: "bg-gray-100 text-gray-600",
  paid: "bg-green-100 text-green-800", unpaid: "bg-yellow-100 text-yellow-800",
  overdue: "bg-red-100 text-red-800", success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800", refunded: "bg-purple-100 text-purple-800",
};
const STATUS_ZH: Record<string, string> = {
  active: "啟用", pending: "待審核", suspended: "停用", cancelled: "已取消",
  paid: "已付款", unpaid: "待付款", overdue: "逾期", success: "成功",
  failed: "失敗", refunded: "退款",
};
const METHOD_ZH: Record<string, string> = { newebpay: "藍新金流", ecpay: "綠界科技", stripe: "Stripe", bank_transfer: "銀行匯款", manual: "手動記錄" };

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
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [section, setSection] = useState<"overview"|"clients"|"subscriptions"|"invoices"|"payments"|"service"|"staff">("overview");
  const [newInvForm, setNewInvForm] = useState({ clientId: "", subscriptionId: "", periodStart: "", periodEnd: "", issueDate: "", dueDate: "", subtotal: "", tax: "5", notes: "" });
  const [newPayForm, setNewPayForm] = useState({ invoiceId: "", clientId: "", amount: "", method: "bank_transfer", notes: "" });
  const [showPayModal, setShowPayModal] = useState(false);
  const [showInvModal, setShowInvModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false);
  const [newClientForm, setNewClientForm] = useState(INITIAL_CLIENT_FORM);
  const [showSubModal, setShowSubModal] = useState(false);
  const [newSubForm, setNewSubForm] = useState({ clientId: "", planId: "", billingCycle: "monthly", elderCount: "1", amount: "", startDate: "", endDate: "" });
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [newStaffForm, setNewStaffForm] = useState(INITIAL_STAFF_FORM);

  const { data: me } = useQuery<Staff>({ queryKey: ["/api/me"] });
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff/members"] });
  const { data: stats } = useQuery<Stats>({ queryKey: ["/api/staff/stats"] });
  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/staff/clients"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/staff/subscriptions"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/staff/invoices"] });
  const { data: payments = [] } = useQuery<Payment[]>({ queryKey: ["/api/staff/payments"] });
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({ queryKey: ["/api/staff/service-records"] });
  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["/api/plans"] });

  useEffect(() => {
    // redirect if not staff
  }, [me]);

  const activateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/staff/clients/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/clients"] }); queryClient.invalidateQueries({ queryKey: ["/api/staff/stats"] }); toast({ title: "已開通客戶" }); },
  });
  const suspendMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/staff/clients/${id}/suspend`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/clients"] }); queryClient.invalidateQueries({ queryKey: ["/api/staff/stats"] }); toast({ title: "已停用客戶" }); },
  });
  const createInvMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/staff/invoices", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/invoices"] }); setShowInvModal(false); toast({ title: "帳單已建立" }); },
  });
  const createPayMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/staff/payments", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/payments"] }); queryClient.invalidateQueries({ queryKey: ["/api/staff/invoices"] }); setShowPayModal(false); toast({ title: "付款紀錄已新增，帳單標記為已付款" }); },
  });
  const createClientMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/staff/clients", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff/stats"] });
      setNewClientForm(INITIAL_CLIENT_FORM);
      setShowClientModal(false);
      toast({ title: "客戶已新增" });
    },
    onError: (error: Error) => {
      toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    },
  });
  const createSubMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/staff/subscriptions", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/subscriptions"] }); setShowSubModal(false); toast({ title: "訂閱已新增" }); },
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
  const logout = async () => {
    await apiRequest("POST", "/api/logout");
    queryClient.clear();
    nav("/");
  };

  const clientName = (id: number) => {
    const c = clients.find(c => c.id === id);
    return c ? (c.orgName || c.contactName) : `客戶#${id}`;
  };
  const planName = (id: number) => plans.find(p => p.id === id)?.name ?? `方案#${id}`;
  const fmt = (n: number) => n.toLocaleString("zh-TW");

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
          <div className="text-xs text-blue-300 mb-2 px-1">{me?.displayName} · {me?.role === "superadmin" ? "超級管理員" : me?.role === "sales" ? "業務" : me?.role === "finance" ? "財務" : me?.role}</div>
          <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-blue-300 hover:bg-blue-800 hover:text-white transition-colors">🚪 登出</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">

          {/* ── Overview ── */}
          {section === "overview" && stats && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">營運總覽</h1>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat label="啟用客戶" value={stats.activeClients} sub="家" color="blue" />
                <Stat label="待審核" value={stats.pendingClients} sub="家" color="amber" />
                <Stat label="月均收入 (MRR)" value={`NT$ ${fmt(Math.round(stats.mrr))}`} color="green" />
                <Stat label="待收帳款" value={`NT$ ${fmt(Math.round(stats.unpaidAmount))}`} sub={`${stats.unpaidInvoices} 張帳單`} color="red" />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Stat label="累計已收款" value={`NT$ ${fmt(Math.round(stats.paidAmount))}`} color="green" />
                <Stat label="進行中訂閱" value={stats.activeSubscriptions} sub="份" color="blue" />
              </div>
              {/* Recent invoices */}
              <div className="bg-white rounded-xl border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">最新帳單</h2>
                  <button onClick={() => setSection("invoices")} className="text-sm text-blue-600 hover:underline">查看全部</button>
                </div>
                <div className="divide-y">
                  {[...invoices].sort((a,b)=>b.id-a.id).slice(0,5).map(inv => (
                    <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inv.invoiceNo}</p>
                        <p className="text-xs text-gray-500">{clientName(inv.clientId)} · 到期 {inv.dueDate}</p>
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
                      {["客戶名稱","類型","聯絡人","Email","狀態","建立日期","操作"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {clients.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{c.orgName || c.contactName}</td>
                        <td className="px-4 py-3 text-gray-600">{TYPE_LABEL[c.clientType]}</td>
                        <td className="px-4 py-3 text-gray-600">{c.contactName}</td>
                        <td className="px-4 py-3 text-gray-600">{c.contactEmail}</td>
                        <td className="px-4 py-3"><Badge status={c.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{c.createdAt?.slice(0,10)}</td>
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

              {/* New Client Modal */}
              {showClientModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">新增客戶</h2>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">類型</label>
                        <select value={newClientForm.clientType} onChange={e=>setNewClientForm(f=>({...f,clientType:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="institution">機構</option>
                          <option value="social_welfare">社會局/社福</option>
                          <option value="individual">個人</option>
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">機構名稱</label>
                          <input value={newClientForm.orgName} onChange={e=>setNewClientForm(f=>({...f,orgName:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">聯絡人</label>
                          <input value={newClientForm.contactName} onChange={e=>setNewClientForm(f=>({...f,contactName:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">登入帳號</label>
                          <input value={newClientForm.username} onChange={e=>setNewClientForm(f=>({...f,username:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">登入密碼</label>
                          <input type="password" value={newClientForm.password} onChange={e=>setNewClientForm(f=>({...f,password:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                        <input value={newClientForm.contactEmail} onChange={e=>setNewClientForm(f=>({...f,contactEmail:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">電話</label>
                          <input value={newClientForm.contactPhone} onChange={e=>setNewClientForm(f=>({...f,contactPhone:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">統編</label>
                          <input value={newClientForm.taxId} onChange={e=>setNewClientForm(f=>({...f,taxId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">地址</label>
                        <input value={newClientForm.address} onChange={e=>setNewClientForm(f=>({...f,address:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => createClientMutation.mutate(newClientForm)} disabled={createClientMutation.isPending} className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">建立</button>
                      <button onClick={()=>{ setNewClientForm(INITIAL_CLIENT_FORM); setShowClientModal(false); }} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
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
                        <td className="px-4 py-3 font-medium text-gray-900">{clientName(s.clientId)}</td>
                        <td className="px-4 py-3 text-gray-600">{planName(s.planId)}</td>
                        <td className="px-4 py-3 text-gray-600">{s.billingCycle === "annual" ? "年繳" : "月繳"}</td>
                        <td className="px-4 py-3 text-gray-600">{s.elderCount} 位</td>
                        <td className="px-4 py-3 font-medium">NT$ {fmt(s.amount)}</td>
                        <td className="px-4 py-3"><Badge status={s.status} /></td>
                        <td className="px-4 py-3 text-gray-500">{s.endDate}</td>
                        <td className="px-4 py-3 text-gray-500">{s.nextBillingDate}</td>
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
                        <select value={newSubForm.clientId} onChange={e=>setNewSubForm(f=>({...f,clientId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇客戶</option>
                          {clients.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{c.orgName||c.contactName}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">方案</label>
                        <select value={newSubForm.planId} onChange={e=>setNewSubForm(f=>({...f,planId:e.target.value,amount:plans.find(p=>p.id===Number(e.target.value))?.monthlyPrice.toString()||""}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇方案</option>
                          {plans.map(p=><option key={p.id} value={p.id}>{p.name} (NT${p.monthlyPrice}/月)</option>)}
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
                        createSubMutation.mutate({ ...newSubForm, clientId: Number(newSubForm.clientId), planId: Number(newSubForm.planId), amount: Number(newSubForm.amount), elderCount: Number(newSubForm.elderCount), nextBillingDate: newSubForm.endDate, status: "active" });
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
                    {[...invoices].sort((a,b)=>b.id-a.id).map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-medium text-blue-700">{inv.invoiceNo}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{clientName(inv.clientId)}</td>
                        <td className="px-4 py-3 text-gray-500">{inv.issueDate}</td>
                        <td className="px-4 py-3 text-gray-500">{inv.dueDate}</td>
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
                          <select value={newInvForm.clientId} onChange={e=>setNewInvForm(f=>({...f,clientId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">選擇客戶</option>
                            {clients.filter(c=>c.status==="active").map(c=><option key={c.id} value={c.id}>{c.orgName||c.contactName}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">訂閱</label>
                          <select value={newInvForm.subscriptionId} onChange={e=>setNewInvForm(f=>({...f,subscriptionId:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">選擇訂閱（可選）</option>
                            {subscriptions.filter(s=>newInvForm.clientId?s.clientId===Number(newInvForm.clientId):true).map(s=><option key={s.id} value={s.id}>{planName(s.planId)} - {s.billingCycle==="annual"?"年繳":"月繳"}</option>)}
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
                        createInvMutation.mutate({ clientId: Number(newInvForm.clientId), subscriptionId: newInvForm.subscriptionId?Number(newInvForm.subscriptionId):null, periodStart: newInvForm.periodStart, periodEnd: newInvForm.periodEnd, issueDate: newInvForm.issueDate, dueDate: newInvForm.dueDate, subtotal: sub, tax, total: sub+tax, status: "unpaid", notes: newInvForm.notes||null });
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
                      {["付款ID","帳單","客戶","金額","付款方式","狀態","交易編號","付款時間","備註"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {[...payments].sort((a,b)=>b.id-a.id).map(p => {
                      const inv = invoices.find(i=>i.id===p.invoiceId);
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{p.id}</td>
                          <td className="px-4 py-3 text-blue-700 font-mono text-xs">{inv?.invoiceNo ?? `INV#${p.invoiceId}`}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{clientName(p.clientId)}</td>
                          <td className="px-4 py-3 font-semibold">NT$ {fmt(p.amount)}</td>
                          <td className="px-4 py-3 text-gray-600">{METHOD_ZH[p.method] ?? p.method}</td>
                          <td className="px-4 py-3"><Badge status={p.status} /></td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.transactionId}</td>
                          <td className="px-4 py-3 text-gray-500">{p.paidAt ? new Date(p.paidAt).toLocaleDateString("zh-TW") : "-"}</td>
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
                          const inv=invoices.find(i=>i.id===Number(e.target.value));
                          setNewPayForm(f=>({...f,invoiceId:e.target.value,clientId:inv?String(inv.clientId):"",amount:inv?String(inv.total):""}));
                        }} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="">選擇帳單</option>
                          {invoices.filter(i=>i.status!=="paid").map(i=><option key={i.id} value={i.id}>{i.invoiceNo} — {clientName(i.clientId)} — NT${fmt(i.total)}</option>)}
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
                        createPayMutation.mutate({ invoiceId: Number(newPayForm.invoiceId), clientId: Number(newPayForm.clientId), amount: Number(newPayForm.amount), method: newPayForm.method, status: "success", paidAt: new Date().toISOString(), notes: newPayForm.notes||null });
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
                        <td className="px-4 py-3 font-medium text-gray-900">{clientName(r.clientId)}</td>
                        <td className="px-4 py-3 text-gray-600">{r.month}</td>
                        <td className="px-4 py-3">{r.elderCount} 位</td>
                        <td className="px-4 py-3">{r.conversationCount.toLocaleString()}</td>
                        <td className="px-4 py-3">{r.alertCount}</td>
                        <td className="px-4 py-3">{r.activeElders} 位</td>
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
                      {["姓名","帳號","角色","Email","狀態"].map(h=>(
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {staffList.map(s=>(
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{s.displayName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{s.username}</td>
                        <td className="px-4 py-3 text-gray-600">{s.role==="superadmin"?"超級管理員":s.role==="sales"?"業務":s.role==="finance"?"財務":"客服"}</td>
                        <td className="px-4 py-3 text-gray-600">{s.email}</td>
                        <td className="px-4 py-3"><Badge status={s.isActive?"active":"suspended"}/></td>
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">登入帳號</label>
                          <input value={newStaffForm.username} onChange={e=>setNewStaffForm(f=>({...f,username:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">登入密碼</label>
                          <input type="password" value={newStaffForm.password} onChange={e=>setNewStaffForm(f=>({...f,password:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                        <input value={newStaffForm.email} onChange={e=>setNewStaffForm(f=>({...f,email:e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/>
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
