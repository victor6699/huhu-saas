import { useState, useMemo, useRef } from "react";
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
type CrmUser = {
  id: string;
  email: string;
  fullName: string;
  nickname: string;
  phone: string;
  avatarUrl: string;
  role: string;
  userType: string;
  tags: string[];
  notes: string;
  personProfileId: string | null;
  memberships: { organization_id: string; role_code: string; org_name?: string; org_type?: string; status: string }[];
  elderRecord: { id: string; person_profile_id: string; primary_org_id: string; status: string } | null;
  careRelationships: { asFamily: number; asElder: number };
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  source: string;
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
const USER_TYPE_LABEL: Record<string, string> = {
  elder: "長輩", family: "家人", caregiver: "照護員", staff: "員工",
  user: "使用者", unknown: "未分類",
};
const USER_TYPE_BADGE: Record<string, string> = {
  elder: "bg-purple-100 text-purple-800", family: "bg-blue-100 text-blue-800",
  caregiver: "bg-green-100 text-green-800", staff: "bg-amber-100 text-amber-800",
  user: "bg-gray-100 text-gray-600", unknown: "bg-gray-100 text-gray-400",
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
  const [section, setSection] = useState<"overview"|"users"|"clients"|"subscriptions"|"invoices"|"payments"|"service"|"staff">("overview");

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
  // ── Edit state ──────────────────────────────────────────────
  const [editOrgTarget, setEditOrgTarget] = useState<Organization | null>(null);
  const [editOrgForm, setEditOrgForm] = useState({ name: "", email: "", phone: "", address: "", tax_id: "" });
  const [editStaffTarget, setEditStaffTarget] = useState<StaffMember | null>(null);
  const [editStaffForm, setEditStaffForm] = useState({ role_code: "sales", title: "" });
  // CRM state
  const [userTypeFilter, setUserTypeFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // ── Queries ────────────────────────────────────────────────
  const { data: me } = useQuery<Me>({ queryKey: ["/api/me"] });
  const { data: staffList = [] } = useQuery<StaffMember[]>({ queryKey: ["/api/staff/members"] });
  const { data: organizations = [] } = useQuery<Organization[]>({ queryKey: ["/api/organizations"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/subscriptions"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"] });
  const { data: payments = [] } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({ queryKey: ["/api/service-records"] });
  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["/api/plans"] });
  const { data: crmUsers = [], isLoading: crmLoading } = useQuery<CrmUser[]>({ queryKey: ["/api/crm/users"] });

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
    const totalUsers = crmUsers.length;
    const newUsersThisWeek = crmUsers.filter(u => {
      const d = new Date(u.createdAt);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }).length;
    return { activeClients, pendingClients, activeSubscriptions, unpaidInvoices, unpaidAmount, paidAmount, mrr, totalUsers, newUsersThisWeek };
  }, [organizations, subscriptions, invoices, payments, crmUsers]);

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
  const updateOrgMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editOrgForm }) =>
      apiRequest("PATCH", `/api/organizations/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/organizations"] }); setEditOrgTarget(null); toast({ title: "機構資料已更新" }); },
    onError: (e: any) => toast({ title: "更新失敗", description: e?.message, variant: "destructive" }),
  });
  const updateStaffMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editStaffForm }) =>
      apiRequest("PATCH", `/api/staff/members/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/staff/members"] }); setEditStaffTarget(null); toast({ title: "員工資料已更新" }); },
    onError: (e: any) => toast({ title: "更新失敗", description: e?.message, variant: "destructive" }),
  });
  const batchImportMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/crm/batch-import", body),
    onSuccess: (data: any) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/crm/users"] });
      toast({ title: `匯入完成：${data.created} 筆成功，${data.skipped} 筆略過，${data.errors} 筆失敗` });
    },
    onError: (error: Error) => {
      toast({ title: "匯入失敗", description: error.message, variant: "destructive" });
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
    { key: "users", label: "使用者 CRM", icon: "👤" },
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
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <Stat label="累計已收款" value={`NT$ ${fmt(stats.paidAmount)}`} color="green" />
                <Stat label="進行中訂閱" value={stats.activeSubscriptions} sub="份" color="blue" />
                <Stat label="總使用者" value={stats.totalUsers} sub="人" color="blue" />
                <Stat label="本週新增" value={stats.newUsersThisWeek} sub="人" color="green" />
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

          {/* ── Users CRM ── */}
          {section === "users" && (() => {
            const filtered = crmUsers.filter(u => {
              if (userTypeFilter !== "all" && u.userType !== userTypeFilter) return false;
              if (userSearch) {
                const q = userSearch.toLowerCase();
                return (u.email?.toLowerCase().includes(q) || u.fullName?.toLowerCase().includes(q) || u.phone?.includes(q));
              }
              return true;
            });
            const typeCounts: Record<string, number> = {};
            crmUsers.forEach(u => { typeCounts[u.userType] = (typeCounts[u.userType] || 0) + 1; });

            const normalizeRows = (json: any[]) => json.map((row: any) => ({
              email: row.email || row.Email || row.EMAIL || row["電子郵件"] || "",
              fullName: row.fullName || row.full_name || row.name || row.Name || row["姓名"] || row["名稱"] || "",
              phone: row.phone || row.Phone || row["電話"] || "",
              password: row.password || row.Password || row["密碼"] || "",
              role: row.role || row.Role || row["角色"] || "user",
              orgName: row.orgName || row.org_name || row.organization || row["機構"] || "",
              orgType: row.orgType || row.org_type || row["機構類型"] || "individual_family",
            }));

            const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = "";

              // CSV handling (no library needed)
              if (file.name.endsWith(".csv")) {
                const text = await file.text();
                const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
                if (lines.length < 2) { toast({ title: "CSV 檔案至少需要標題行+一筆資料", variant: "destructive" }); return; }
                const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
                const json = lines.slice(1).map(line => {
                  const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
                  const obj: any = {};
                  headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
                  return obj;
                });
                setImportRows(normalizeRows(json));
                setImportResult(null);
                setShowImportModal(true);
                return;
              }

              // Excel handling (dynamic import)
              try {
                const XLSX = await import("xlsx");
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const data = new Uint8Array(ev.target?.result as ArrayBuffer);
                    const wb = XLSX.read(data, { type: "array" });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(ws) as any[];
                    setImportRows(normalizeRows(json));
                    setImportResult(null);
                    setShowImportModal(true);
                  } catch { toast({ title: "無法解析 Excel 檔案", variant: "destructive" }); }
                };
                reader.readAsArrayBuffer(file);
              } catch {
                toast({ title: "Excel 解析庫未安裝，請改用 CSV 格式", variant: "destructive" });
              }
            };

            return (
              <div>
                {/* Header + Actions */}
                <div className="flex items-center justify-between mb-4">
                  <h1 className="text-xl font-bold text-gray-900">使用者 CRM</h1>
                  <div className="flex gap-2">
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">📥 匯入 Excel/CSV</button>
                    <button onClick={() => { setPasteMode(true); setShowImportModal(true); setImportResult(null); setImportRows([]); }} className="px-4 py-2 border border-green-600 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50">📋 貼上資料</button>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
                  <button onClick={() => setUserTypeFilter("all")} className={`rounded-xl border p-3 text-center transition-colors ${userTypeFilter === "all" ? "bg-blue-50 border-blue-300" : "bg-white hover:bg-gray-50"}`}>
                    <p className="text-lg font-bold text-blue-600">{crmUsers.length}</p>
                    <p className="text-xs text-gray-500">全部</p>
                  </button>
                  {Object.entries(USER_TYPE_LABEL).map(([key, label]) => (
                    <button key={key} onClick={() => setUserTypeFilter(key)} className={`rounded-xl border p-3 text-center transition-colors ${userTypeFilter === key ? "bg-blue-50 border-blue-300" : "bg-white hover:bg-gray-50"}`}>
                      <p className="text-lg font-bold">{typeCounts[key] || 0}</p>
                      <p className="text-xs text-gray-500">{label}</p>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="mb-4">
                  <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="搜尋 Email、姓名、電話..." className="w-full md:w-80 border rounded-lg px-3 py-2 text-sm" />
                </div>

                {/* User Table */}
                {crmLoading ? (
                  <div className="bg-white rounded-xl border p-12 text-center text-gray-400">載入中...</div>
                ) : (
                  <div className="bg-white rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          {["姓名","Email","電話","類型","來源","機構/組織","照護關係","註冊日期","最後登入"].map(h => (
                            <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900">{u.fullName || "-"}</div>
                              {u.nickname && <div className="text-xs text-gray-400">{u.nickname}</div>}
                            </td>
                            <td className="px-3 py-3 text-gray-600 text-xs">{u.email}</td>
                            <td className="px-3 py-3 text-gray-600">{u.phone || "-"}</td>
                            <td className="px-3 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${USER_TYPE_BADGE[u.userType] || "bg-gray-100 text-gray-600"}`}>
                                {USER_TYPE_LABEL[u.userType] || u.userType}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-500">{u.source}</td>
                            <td className="px-3 py-3 text-xs text-gray-600">
                              {u.memberships.length > 0
                                ? u.memberships.map((m, i) => (
                                    <div key={i}>{m.org_name || "?"} <span className="text-gray-400">({m.role_code})</span></div>
                                  ))
                                : <span className="text-gray-400">-</span>
                              }
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-600">
                              {u.careRelationships.asFamily > 0 && <div>家人關係 x{u.careRelationships.asFamily}</div>}
                              {u.careRelationships.asElder > 0 && <div>被照護 x{u.careRelationships.asElder}</div>}
                              {u.careRelationships.asFamily === 0 && u.careRelationships.asElder === 0 && <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-500">{u.createdAt?.slice(0, 10)}</td>
                            <td className="px-3 py-3 text-xs text-gray-500">{u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString("zh-TW") : "從未"}</td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">無符合條件的使用者</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Batch Import Modal */}
                {showImportModal && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-3xl p-6 max-h-[80vh] overflow-y-auto">
                      <h2 className="text-lg font-bold mb-2">批次匯入使用者</h2>
                      <p className="text-sm text-gray-500 mb-4">
                        {importRows.length > 0 ? `已解析 ${importRows.length} 筆資料，確認後將建立帳號。` : pasteMode ? "請貼上 CSV 格式的資料（第一行為標題）" : ""}
                      </p>

                      {/* Paste mode textarea */}
                      {pasteMode && importRows.length === 0 && !importResult && (
                        <div className="mb-4">
                          <textarea
                            value={pasteText}
                            onChange={e => setPasteText(e.target.value)}
                            placeholder={"email,姓名,電話,角色,密碼\njohn@example.com,王大明,0912345678,user,Password1!\njane@example.com,陳小美,0923456789,family,"}
                            className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-40"
                          />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => {
                              const lines = pasteText.split("\n").map(l => l.trim()).filter(Boolean);
                              if (lines.length < 2) { toast({ title: "至少需要標題行+一筆資料" }); return; }
                              const sep = lines[0].includes("\t") ? "\t" : ",";
                              const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ""));
                              const json = lines.slice(1).map(line => {
                                const vals = line.split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
                                const obj: any = {};
                                headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
                                return obj;
                              });
                              setImportRows(normalizeRows(json));
                            }} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">解析資料</button>
                            <button onClick={() => { setPasteMode(false); setShowImportModal(false); setPasteText(""); }} className="px-4 py-2 border rounded-lg text-sm">取消</button>
                          </div>
                        </div>
                      )}

                      {importResult ? (
                        <div className="mb-4">
                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold text-green-700">{importResult.created}</p>
                              <p className="text-xs text-green-600">成功建立</p>
                            </div>
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold text-yellow-700">{importResult.skipped}</p>
                              <p className="text-xs text-yellow-600">已存在略過</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                              <p className="text-2xl font-bold text-red-700">{importResult.errors}</p>
                              <p className="text-xs text-red-600">失敗</p>
                            </div>
                          </div>
                          {importResult.results?.filter((r: any) => r.status === "error").length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm mb-3">
                              <p className="font-medium text-red-700 mb-1">錯誤明細：</p>
                              {importResult.results.filter((r: any) => r.status === "error").map((r: any, i: number) => (
                                <p key={i} className="text-red-600">{r.email}: {r.message}</p>
                              ))}
                            </div>
                          )}
                          <button onClick={() => { setShowImportModal(false); setImportRows([]); setImportResult(null); setPasteMode(false); setPasteText(""); }} className="w-full bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">關閉</button>
                        </div>
                      ) : (
                        <>
                          <div className="bg-white rounded-xl border overflow-x-auto mb-4">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  {["#","Email","姓名","電話","角色","密碼","機構","機構類型"].map(h => (
                                    <th key={h} className="px-2 py-2 text-left font-medium text-gray-500">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {importRows.slice(0, 50).map((r, i) => (
                                  <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                                    <td className="px-2 py-1.5 font-medium">{r.email || <span className="text-red-400">缺少</span>}</td>
                                    <td className="px-2 py-1.5">{r.fullName}</td>
                                    <td className="px-2 py-1.5">{r.phone}</td>
                                    <td className="px-2 py-1.5">{r.role}</td>
                                    <td className="px-2 py-1.5 text-gray-400">{r.password ? "***" : "(自動產生)"}</td>
                                    <td className="px-2 py-1.5">{r.orgName}</td>
                                    <td className="px-2 py-1.5">{r.orgType}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {importRows.length > 50 && <p className="px-3 py-2 text-xs text-gray-400">... 還有 {importRows.length - 50} 筆</p>}
                          </div>
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700 mb-4">
                            Excel 欄位對應：email/Email/電子郵件, name/姓名, phone/電話, password/密碼, role/角色 (user/family/caregiver), orgName/機構, orgType/機構類型
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => batchImportMutation.mutate({ rows: importRows })}
                              disabled={batchImportMutation.isPending}
                              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                            >
                              {batchImportMutation.isPending ? "匯入中..." : `確認匯入 ${importRows.length} 筆`}
                            </button>
                            <button onClick={() => { setShowImportModal(false); setImportRows([]); setPasteMode(false); setPasteText(""); }} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

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
                        <td className="px-4 py-3 flex gap-1 flex-wrap">
                          <button onClick={() => { setEditOrgTarget(c); setEditOrgForm({ name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", tax_id: c.tax_id ?? "" }); }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">✏️ 編輯</button>
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

              {/* Edit Org Modal */}
              {editOrgTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-md p-6">
                    <h2 className="text-lg font-bold mb-4">編輯機構資料</h2>
                    <div className="space-y-3">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">機構名稱</label>
                        <input value={editOrgForm.name} onChange={e => setEditOrgForm(f => ({...f, name: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                        <input value={editOrgForm.email} onChange={e => setEditOrgForm(f => ({...f, email: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                      <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">電話</label>
                          <input value={editOrgForm.phone} onChange={e => setEditOrgForm(f => ({...f, phone: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                        <div><label className="block text-xs font-medium text-gray-700 mb-1">統編</label>
                          <input value={editOrgForm.tax_id} onChange={e => setEditOrgForm(f => ({...f, tax_id: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                      </div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">地址</label>
                        <input value={editOrgForm.address} onChange={e => setEditOrgForm(f => ({...f, address: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => updateOrgMutation.mutate({ id: editOrgTarget.id, data: editOrgForm })} disabled={updateOrgMutation.isPending}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {updateOrgMutation.isPending ? "儲存中..." : "儲存"}</button>
                      <button onClick={() => setEditOrgTarget(null)} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}

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
                      {["姓名","Email","角色","狀態","操作"].map(h=>(
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
                        <td className="px-4 py-3">
                          <button onClick={() => { setEditStaffTarget(s); setEditStaffForm({ role_code: s.role_code, title: s.title ?? "" }); }}
                            className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">✏️ 編輯</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Edit Staff Modal */}
              {editStaffTarget && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                    <h2 className="text-lg font-bold mb-4">編輯員工資料</h2>
                    <p className="text-sm text-gray-500 mb-3">{editStaffTarget.person_profiles?.full_name} ({editStaffTarget.person_profiles?.email})</p>
                    <div className="space-y-3">
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">角色</label>
                        <select value={editStaffForm.role_code} onChange={e => setEditStaffForm(f => ({...f, role_code: e.target.value}))} className="w-full border rounded px-2 py-1.5 text-sm">
                          <option value="superadmin">超級管理員</option>
                          <option value="sales">業務</option>
                          <option value="finance">財務</option>
                          <option value="support">客服</option>
                        </select></div>
                      <div><label className="block text-xs font-medium text-gray-700 mb-1">職稱（選填）</label>
                        <input value={editStaffForm.title} onChange={e => setEditStaffForm(f => ({...f, title: e.target.value}))} placeholder="例：資深業務主任" className="w-full border rounded px-2 py-1.5 text-sm"/></div>
                    </div>
                    <div className="flex gap-2 mt-5">
                      <button onClick={() => updateStaffMutation.mutate({ id: editStaffTarget.id, data: editStaffForm })} disabled={updateStaffMutation.isPending}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                        {updateStaffMutation.isPending ? "儲存中..." : "儲存"}</button>
                      <button onClick={() => setEditStaffTarget(null)} className="flex-1 border py-2 rounded-lg text-sm">取消</button>
                    </div>
                  </div>
                </div>
              )}

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
