import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"staff" | "client" | "register">("client");
  const [form, setForm] = useState({ username: "", password: "", contactName: "", contactEmail: "", clientType: "institution", orgName: "", contactPhone: "", taxId: "", address: "" });
  const [loading, setLoading] = useState(false);

  const handle = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (tab === "register") {
        await apiRequest("POST", "/api/client/register", form);
        toast({ title: "註冊成功", description: "等待客服審核開通，通常1個工作日內完成" });
        setTab("client");
      } else {
        const endpoint = tab === "staff" ? "/api/staff/login" : "/api/client/login";
        const data = await apiRequest("POST", endpoint, { username: form.username, password: form.password });
        const me = await data.json();
        queryClient.setQueryData(["/api/me"], me);
        nav(tab === "staff" ? "/staff/dashboard" : "/portal/overview");
      }
    } catch (err: any) {
      const msg = await err?.response?.json().catch(() => ({ message: "登入失敗" }));
      toast({ title: "錯誤", description: msg?.message || "請稍後重試", variant: "destructive" });
    } finally { setLoading(false); }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-blue-400/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur mb-4">
            <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
              <circle cx="20" cy="20" r="18" fill="#3B82F6" opacity="0.3"/>
              <circle cx="20" cy="20" r="12" fill="#3B82F6" opacity="0.5"/>
              <path d="M14 20 Q17 15 20 20 Q23 25 26 20" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
              <circle cx="20" cy="12" r="2.5" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">HuHu AI</h1>
          <p className="text-blue-200 text-sm mt-1">智能陪伴服務 · 商務管理平台</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            {(["client","staff","register"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50" : "text-gray-500 hover:text-gray-700"}`}>
                {t === "client" ? "客戶登入" : t === "staff" ? "員工登入" : "新客戶註冊"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="p-6 space-y-4">
            {tab === "register" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>客戶類型</label>
                    <select value={form.clientType} onChange={handle("clientType")} className={inputCls}>
                      <option value="institution">機構</option>
                      <option value="social_welfare">社會局/社福</option>
                      <option value="individual">個人</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>聯絡人姓名 *</label>
                    <input required value={form.contactName} onChange={handle("contactName")} className={inputCls} placeholder="王院長" />
                  </div>
                </div>
                {form.clientType !== "individual" && (
                  <div>
                    <label className={labelCls}>機構/單位名稱</label>
                    <input value={form.orgName} onChange={handle("orgName")} className={inputCls} placeholder="慈愛老人養護中心" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>聯絡 Email *</label>
                  <input required type="email" value={form.contactEmail} onChange={handle("contactEmail")} className={inputCls} placeholder="contact@org.tw" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>電話</label>
                    <input value={form.contactPhone} onChange={handle("contactPhone")} className={inputCls} placeholder="02-1234-5678" />
                  </div>
                  {form.clientType !== "individual" && (
                    <div>
                      <label className={labelCls}>統一編號</label>
                      <input value={form.taxId} onChange={handle("taxId")} className={inputCls} placeholder="12345678" />
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelCls}>地址</label>
                  <input value={form.address} onChange={handle("address")} className={inputCls} placeholder="台北市..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>帳號 *</label>
                    <input required value={form.username} onChange={handle("username")} className={inputCls} placeholder="your_username" />
                  </div>
                  <div>
                    <label className={labelCls}>密碼 *</label>
                    <input required type="password" value={form.password} onChange={handle("password")} className={inputCls} placeholder="至少8位" minLength={6} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelCls}>{tab === "staff" ? "員工帳號" : "客戶帳號"}</label>
                  <input required value={form.username} onChange={handle("username")} className={inputCls} placeholder={tab === "staff" ? "admin" : "your_username"} data-testid="input-username" />
                </div>
                <div>
                  <label className={labelCls}>密碼</label>
                  <input required type="password" value={form.password} onChange={handle("password")} className={inputCls} placeholder="••••••••" data-testid="input-password" />
                </div>
                {/* Demo accounts hint */}
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                  {tab === "staff" ? (
                    <>
                      <p className="font-medium text-gray-600">Demo 員工帳號：</p>
                      <p>超級管理員：<code className="bg-gray-200 px-1 rounded">admin</code> / admin123</p>
                      <p>業務：<code className="bg-gray-200 px-1 rounded">sales_chen</code> / demo123</p>
                      <p>財務：<code className="bg-gray-200 px-1 rounded">finance_lin</code> / demo123</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-600">Demo 客戶帳號（密碼均為 demo123）：</p>
                      <p>機構：<code className="bg-gray-200 px-1 rounded">cirai_org</code></p>
                      <p>社會局：<code className="bg-gray-200 px-1 rounded">taipei_welfare</code></p>
                      <p>個人：<code className="bg-gray-200 px-1 rounded">chen_hua</code></p>
                    </>
                  )}
                </div>
              </>
            )}
            <button type="submit" disabled={loading} data-testid="button-submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60">
              {loading ? "處理中..." : tab === "register" ? "申請開通" : "登入"}
            </button>
          </form>
        </div>
        <p className="text-center text-blue-300 text-xs mt-6">© 2026 HuHu AI · <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="underline">Created with Perplexity Computer</a></p>
      </div>
    </div>
  );
}
