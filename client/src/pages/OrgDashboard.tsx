import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, forceLogout } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type OrgInfo = {
  id: string; name: string; org_type: string; legal_name: string | null;
  tax_id: string | null; address: string | null; phone: string | null;
  email: string | null; status: string;
};
type Member = {
  id: string; user_id: string; role_code: string; title: string | null; status: string;
  person_profiles: { full_name: string; email: string | null; avatar_url: string | null } | null;
};
type CareRecipient = {
  id: string; primary_org_id: string; status: string; created_at: string;
  person_profiles: { full_name: string; nickname: string | null; phone: string | null; email: string | null } | null;
};
type Subscription = {
  id: string; status: string; billing_cycle: string; elder_count: number;
  start_date: string; end_date: string; amount: number;
  plans: { name: string; features: string } | null;
};
type Invoice = {
  id: string; invoice_no: string; issue_date: string; due_date: string;
  total: number; status: string;
};

// ── UI helpers ─────────────────────────────────────────────────────────────────
const ROLE_ZH: Record<string, string> = {
  org_admin: "機構管理員", case_manager: "個案管理員",
  caregiver: "照護員", staff: "員工", viewer: "檢視者",
};
const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800", inactive: "bg-gray-100 text-gray-600",
  suspended: "bg-red-100 text-red-800", paid: "bg-green-100 text-green-800",
  unpaid: "bg-yellow-100 text-yellow-800", overdue: "bg-red-100 text-red-800",
  trial: "bg-blue-100 text-blue-800",
};
const STATUS_ZH: Record<string, string> = {
  active: "啟用", inactive: "停用", suspended: "停用",
  paid: "已付款", unpaid: "待付款", overdue: "逾期", trial: "試用中",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_ZH[status] ?? status}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  const initial = (name || "?")[0].toUpperCase();
  const colors = ["bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-orange-500", "bg-pink-500"];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
      {initial}
    </div>
  );
}

// ── Section: 儀表板總覽 ────────────────────────────────────────────────────────
function OverviewSection({ org, members, recipients, subscription }: {
  org: OrgInfo | undefined;
  members: Member[];
  recipients: CareRecipient[];
  subscription: Subscription | undefined;
}) {
  const activeMembers = members.filter(m => m.status === "active").length;
  const activeRecipients = recipients.filter(r => r.status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{org?.name ?? "機構後台"}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{org?.address ?? ""}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "照護員人數", value: activeMembers, icon: "👩‍⚕️", color: "bg-teal-50 border-teal-200" },
          { label: "被照護者", value: activeRecipients, icon: "🧓", color: "bg-blue-50 border-blue-200" },
          { label: "訂閱方案", value: subscription?.plans?.name ?? "—", icon: "📋", color: "bg-purple-50 border-purple-200" },
          { label: "訂閱狀態", value: <Badge status={subscription?.status ?? "inactive"} />, icon: "✅", color: "bg-green-50 border-green-200" },
        ].map((stat, i) => (
          <div key={i} className={`rounded-xl border p-4 ${stat.color}`}>
            <p className="text-2xl mb-1">{stat.icon}</p>
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {subscription && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-800 mb-3">目前訂閱</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">方案</p><p className="font-medium">{subscription.plans?.name}</p></div>
            <div><p className="text-gray-500">計費週期</p><p className="font-medium">{subscription.billing_cycle === "monthly" ? "月繳" : "年繳"}</p></div>
            <div><p className="text-gray-500">長輩名額</p><p className="font-medium">{subscription.elder_count} 人</p></div>
            <div><p className="text-gray-500">到期日</p><p className="font-medium">{subscription.end_date?.slice(0, 10)}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: 照護員管理 ────────────────────────────────────────────────────────
function MembersSection({ orgId, members, refetch }: {
  orgId: string;
  members: Member[];
  refetch: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editMemberTarget, setEditMemberTarget] = useState<Member | null>(null);
  const [memberEditForm, setMemberEditForm] = useState({ role_code: "caregiver", title: "" });
  const [form, setForm] = useState({ email: "", full_name: "", role_code: "caregiver", title: "" });

  const inviteMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", `/api/org/${orgId}/invite-member`, data),
    onSuccess: () => {
      toast({ title: "邀請已發送", description: "對方收到 Email 後可完成註冊。" });
      setShowForm(false);
      setForm({ email: "", full_name: "", role_code: "caregiver", title: "" });
      refetch();
    },
    onError: (e: any) => toast({ title: "邀請失敗", description: e?.message, variant: "destructive" }),
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof memberEditForm }) =>
      apiRequest("PATCH", `/api/org/${orgId}/members/${id}`, data),
    onSuccess: () => { toast({ title: "已更新成員資料" }); setEditMemberTarget(null); refetch(); },
    onError: (e: any) => toast({ title: "更新失敗", description: e?.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => apiRequest("DELETE", `/api/org/${orgId}/members/${memberId}`),
    onSuccess: () => { toast({ title: "已移除成員" }); refetch(); },
    onError: (e: any) => toast({ title: "移除失敗", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">照護員管理</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-[#0ABAB5] hover:bg-[#089490] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + 邀請照護員
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">邀請新照護員</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">姓名</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">角色</label>
              <select value={form.role_code} onChange={e => setForm(p => ({ ...p, role_code: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none">
                <option value="caregiver">照護員</option>
                <option value="case_manager">個案管理員</option>
                <option value="org_admin">機構管理員</option>
                <option value="viewer">檢視者</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">職稱（選填）</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => inviteMutation.mutate(form)} disabled={!form.email || inviteMutation.isPending}
              className="bg-[#0ABAB5] hover:bg-[#089490] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
              {inviteMutation.isPending ? "發送中..." : "發送邀請"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["姓名", "Email", "角色", "職稱", "狀態", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">尚無照護員</td></tr>
            ) : members.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={m.person_profiles?.full_name || "?"} />
                    <span className="font-medium text-gray-900">{m.person_profiles?.full_name || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{m.person_profiles?.email || "—"}</td>
                <td className="px-4 py-3"><span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{ROLE_ZH[m.role_code] ?? m.role_code}</span></td>
                <td className="px-4 py-3 text-gray-500">{m.title || "—"}</td>
                <td className="px-4 py-3"><Badge status={m.status} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditMemberTarget(m); setMemberEditForm({ role_code: m.role_code, title: m.title || "" }); }}
                      className="text-xs text-[#0ABAB5] hover:text-[#089490] font-medium">✏️ 編輯</button>
                    {m.role_code !== "org_admin" && (
                      <button onClick={() => { if (confirm("確定移除此成員？")) removeMutation.mutate(m.id); }}
                        className="text-xs text-red-500 hover:text-red-700">移除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Member Modal */}
      {editMemberTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-lg mb-4">編輯照護員資料</h3>
            <p className="text-sm text-gray-500 mb-4">{editMemberTarget.person_profiles?.full_name}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">角色</label>
                <select value={memberEditForm.role_code} onChange={e => setMemberEditForm(p => ({ ...p, role_code: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none">
                  <option value="caregiver">照護員</option>
                  <option value="case_manager">個案管理員</option>
                  <option value="org_admin">機構管理員</option>
                  <option value="viewer">檢視者</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">職稱</label>
                <input value={memberEditForm.title}
                  onChange={e => setMemberEditForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => updateMemberMutation.mutate({ id: editMemberTarget.id, data: memberEditForm })}
                disabled={updateMemberMutation.isPending}
                className="flex-1 bg-[#0ABAB5] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#089490] disabled:opacity-50">
                {updateMemberMutation.isPending ? "儲存中..." : "儲存"}
              </button>
              <button onClick={() => setEditMemberTarget(null)}
                className="flex-1 border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section: 被照護者管理 ──────────────────────────────────────────────────────
function RecipientsSection({ orgId, recipients, refetch }: {
  orgId: string;
  recipients: CareRecipient[];
  refetch: () => void;
}) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<CareRecipient | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", nickname: "" });
  const [editForm, setEditForm] = useState({ full_name: "", nickname: "", phone: "", email: "" });

  const addMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", `/api/org/${orgId}/recipients`, data),
    onSuccess: () => {
      toast({ title: "已新增被照護者" });
      setShowForm(false);
      setForm({ full_name: "", phone: "", email: "", nickname: "" });
      refetch();
    },
    onError: (e: any) => toast({ title: "新增失敗", description: e?.message, variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof editForm }) =>
      apiRequest("PATCH", `/api/org/${orgId}/recipients/${id}`, data),
    onSuccess: () => { toast({ title: "資料已更新" }); setEditTarget(null); refetch(); },
    onError: (e: any) => toast({ title: "更新失敗", description: e?.message, variant: "destructive" }),
  });

  const openEdit = (r: CareRecipient) => {
    setEditTarget(r);
    setEditForm({
      full_name: r.person_profiles?.full_name || "",
      nickname: r.person_profiles?.nickname || "",
      phone: r.person_profiles?.phone || "",
      email: r.person_profiles?.email || "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">被照護者管理</h2>
        <button onClick={() => setShowForm(v => !v)}
          className="bg-[#0ABAB5] hover:bg-[#089490] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          + 新增被照護者
        </button>
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">新增被照護者</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: "姓名 *", key: "full_name", type: "text" },
              { label: "暱稱", key: "nickname", type: "text" },
              { label: "電話", key: "phone", type: "tel" },
              { label: "Email", key: "email", type: "email" },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input type={type} value={(form as any)[key]}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => addMutation.mutate(form)} disabled={!form.full_name || addMutation.isPending}
              className="bg-[#0ABAB5] hover:bg-[#089490] text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50 transition-colors">
              {addMutation.isPending ? "新增中..." : "新增"}
            </button>
            <button onClick={() => setShowForm(false)}
              className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">取消</button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-lg mb-4">編輯被照護者資料</h3>
            <div className="space-y-3">
              {[
                { label: "姓名", key: "full_name" },
                { label: "暱稱", key: "nickname" },
                { label: "電話", key: "phone" },
                { label: "Email", key: "email" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input value={(editForm as any)[key]}
                    onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => editMutation.mutate({ id: editTarget.id, data: editForm })}
                disabled={editMutation.isPending}
                className="flex-1 bg-[#0ABAB5] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#089490] disabled:opacity-50">
                {editMutation.isPending ? "儲存中..." : "儲存"}
              </button>
              <button onClick={() => setEditTarget(null)}
                className="flex-1 border py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["姓名", "暱稱", "電話", "Email", "狀態", "加入日期", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recipients.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">尚無被照護者資料</td></tr>
            ) : recipients.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.person_profiles?.full_name || "?"} />
                    <span className="font-medium text-gray-900">{r.person_profiles?.full_name || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{r.person_profiles?.nickname || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{r.person_profiles?.phone || "—"}</td>
                <td className="px-4 py-3 text-gray-500">{r.person_profiles?.email || "—"}</td>
                <td className="px-4 py-3"><Badge status={r.status} /></td>
                <td className="px-4 py-3 text-gray-500">{r.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => openEdit(r)}
                    className="text-xs text-[#0ABAB5] hover:text-[#089490] font-medium">✏️ 編輯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: 帳單 ──────────────────────────────────────────────────────────────
function BillingSection({ invoices }: { invoices: Invoice[] }) {
  const unpaid = invoices.filter(i => i.status === "unpaid" || i.status === "overdue");
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">帳單記錄</h2>
      {unpaid.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <span className="text-yellow-600 text-lg">⚠️</span>
          <p className="text-sm text-yellow-800">有 <b>{unpaid.length}</b> 筆待付款帳單，總計 NT$ {unpaid.reduce((s, i) => s + i.total, 0).toLocaleString("zh-TW")}</p>
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {["發票號碼", "開立日", "到期日", "金額", "狀態"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {invoices.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">尚無帳單記錄</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700">{inv.invoice_no}</td>
                <td className="px-4 py-3 text-gray-600">{inv.issue_date?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-gray-600">{inv.due_date?.slice(0, 10)}</td>
                <td className="px-4 py-3 font-medium">NT$ {inv.total.toLocaleString("zh-TW")}</td>
                <td className="px-4 py-3"><Badge status={inv.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Section: 機構設定 ──────────────────────────────────────────────────────────
function SettingsSection({ org, orgId, refetch }: { org: OrgInfo | undefined; orgId: string; refetch: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: org?.name ?? "", address: org?.address ?? "",
    phone: org?.phone ?? "", email: org?.email ?? "",
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PATCH", `/api/organizations/${orgId}`, data),
    onSuccess: () => { toast({ title: "已更新機構資訊" }); refetch(); },
    onError: (e: any) => toast({ title: "更新失敗", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="text-xl font-bold text-gray-900">機構設定</h2>
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        {[
          { label: "機構名稱", key: "name" },
          { label: "地址", key: "address" },
          { label: "聯絡電話", key: "phone" },
          { label: "聯絡 Email", key: "email" },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input value={(form as any)[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#0ABAB5] focus:outline-none" />
          </div>
        ))}
        <button onClick={() => updateMutation.mutate(form)} disabled={updateMutation.isPending}
          className="bg-[#0ABAB5] hover:bg-[#089490] text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-50 transition-colors">
          {updateMutation.isPending ? "儲存中..." : "儲存變更"}
        </button>
      </div>
    </div>
  );
}

// ── Main OrgDashboard ─────────────────────────────────────────────────────────
export default function OrgDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const orgId = user?.organizationId ?? "";

  const [section, setSection] = useState<"overview" | "members" | "recipients" | "billing" | "settings">("overview");

  const { data: org, refetch: refetchOrg } = useQuery<OrgInfo>({
    queryKey: [`/api/org/${orgId}/info`],
    enabled: !!orgId,
  });
  const { data: members = [], refetch: refetchMembers } = useQuery<Member[]>({
    queryKey: [`/api/org/${orgId}/members`],
    enabled: !!orgId,
  });
  const { data: recipients = [], refetch: refetchRecipients } = useQuery<CareRecipient[]>({
    queryKey: [`/api/org/${orgId}/recipients`],
    enabled: !!orgId,
  });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({
    queryKey: [`/api/org/${orgId}/subscriptions`],
    enabled: !!orgId,
  });
  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: [`/api/org/${orgId}/invoices`],
    enabled: !!orgId,
  });

  const activeSub = subscriptions.find(s => s.status === "active" || s.status === "trial");

  const navItems = [
    { key: "overview", label: "總覽", icon: "🏠" },
    { key: "members", label: "照護員", icon: "👩‍⚕️" },
    { key: "recipients", label: "被照護者", icon: "🧓" },
    { key: "billing", label: "帳單", icon: "📄", badge: invoices.filter(i => i.status === "unpaid" || i.status === "overdue").length || undefined },
    { key: "settings", label: "機構設定", icon: "⚙️" },
  ] as const;

  if (!orgId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-4xl mb-4">🏢</p>
          <p className="text-gray-600 font-medium">尚未加入任何機構</p>
          <p className="text-sm text-gray-400 mt-2">請聯絡 HuHu 客服完成機構設定</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0d3d3d] text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-[#0ABAB5]/30">
          <div className="flex items-center gap-2">
            <img src="/huhu-logo.png" alt="HuHu" className="w-8 h-8 object-contain rounded-lg"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <div>
              <p className="text-sm font-bold text-white">HuHu AI</p>
              <p className="text-xs text-[#7DDDD9]">機構管理後台</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[#0ABAB5]/20">
          <p className="text-xs text-[#7DDDD9] truncate">{org?.name ?? "載入中..."}</p>
          <p className="text-xs text-[#7DDDD9]/60 mt-0.5">{ROLE_ZH[user?.roleCode ?? ""] ?? user?.roleCode}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setSection(item.key as any)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                section === item.key
                  ? "bg-[#0ABAB5] text-white"
                  : "text-[#7DDDD9] hover:bg-white/10"
              }`}>
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{item.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-[#0ABAB5]/20">
          <button onClick={forceLogout}
            className="w-full text-left text-xs text-[#7DDDD9]/70 hover:text-white px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">
            登出
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          {section === "overview" && (
            <OverviewSection org={org} members={members} recipients={recipients} subscription={activeSub} />
          )}
          {section === "members" && (
            <MembersSection orgId={orgId} members={members} refetch={refetchMembers} />
          )}
          {section === "recipients" && (
            <RecipientsSection orgId={orgId} recipients={recipients} refetch={refetchRecipients} />
          )}
          {section === "billing" && (
            <BillingSection invoices={invoices} />
          )}
          {section === "settings" && (
            <SettingsSection org={org} orgId={orgId} refetch={refetchOrg} />
          )}
        </div>
      </main>
    </div>
  );
}
