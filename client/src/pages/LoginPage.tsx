import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const CLIENT_TYPE_OPTIONS = {
  institution: "機構",
  social_welfare: "社會福利機構",
  individual: "個人",
} as const;

export default function LoginPage() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<"staff" | "client" | "register">("client");
  const [form, setForm] = useState({
    username: "",
    password: "",
    contactName: "",
    contactEmail: "",
    clientType: "institution",
    orgName: "",
    contactPhone: "",
    taxId: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);

  const handle = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      if (tab === "register") {
        await apiRequest("POST", "/api/client/register", form);
        toast({
          title: "申請成功",
          description: "我們會盡快審核您的申請，請留意 Email 通知。",
        });
        setTab("client");
      } else {
        const endpoint = tab === "staff" ? "/api/staff/login" : "/api/client/login";
        const me = await apiRequest("POST", endpoint, {
          username: form.username,
          password: form.password,
        });
        queryClient.setQueryData(["/api/me"], me);
        nav(tab === "staff" ? "/staff/dashboard" : "/portal/overview");
      }
    } catch (error) {
      toast({
        title: tab === "register" ? "申請失敗" : "登入失敗",
        description: error instanceof Error ? error.message : "錯誤，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABAB5] focus:border-transparent";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E0F8F7] via-white to-[#F0FEFE] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-64 h-64 bg-[#0ABAB5]/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#0ABAB5]/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-3">
            <img src="/huhu-logo.png" alt="HuHu" className="w-20 h-20 object-contain drop-shadow-lg" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">HuHu SAAS</h1>
          <p className="text-[#0ABAB5] text-sm mt-1 font-medium">智慧照護管理平台</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b">
            {(["client", "staff", "register"] as const).map((currentTab) => (
              <button
                key={currentTab}
                onClick={() => setTab(currentTab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === currentTab
                    ? "text-[#0ABAB5] border-b-2 border-[#0ABAB5] bg-[#E0F8F7]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {currentTab === "client" ? "客戶登入" : currentTab === "staff" ? "員工登入" : "客戶申請"}
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
                      {Object.entries(CLIENT_TYPE_OPTIONS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>聯絡人姓名 *</label>
                    <input required value={form.contactName} onChange={handle("contactName")} className={inputCls} placeholder="王小明" />
                  </div>
                </div>
                {form.clientType !== "individual" && (
                  <div>
                    <label className={labelCls}>機構 / 組織名稱</label>
                    <input value={form.orgName} onChange={handle("orgName")} className={inputCls} placeholder="組織名稱" />
                  </div>
                )}
                <div>
                  <label className={labelCls}>聯絡 Email *</label>
                  <input required type="email" value={form.contactEmail} onChange={handle("contactEmail")} className={inputCls} placeholder="contact@org.tw" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>聯絡電話</label>
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
                  <input value={form.address} onChange={handle("address")} className={inputCls} placeholder="地址..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>登入帳號 *</label>
                    <input required value={form.username} onChange={handle("username")} className={inputCls} placeholder="your_username" />
                  </div>
                  <div>
                    <label className={labelCls}>密碼 *</label>
                    <input required type="password" minLength={6} value={form.password} onChange={handle("password")} className={inputCls} placeholder="至少 6 碼" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className={labelCls}>{tab === "staff" ? "員工帳號" : "客戶帳號"}</label>
                  <input
                    required
                    value={form.username}
                    onChange={handle("username")}
                    className={inputCls}
                    placeholder={tab === "staff" ? "admin" : "your_username"}
                    data-testid="input-username"
                  />
                </div>
                <div>
                  <label className={labelCls}>密碼</label>
                  <input
                    required
                    type="password"
                    value={form.password}
                    onChange={handle("password")}
                    className={inputCls}
                    placeholder="請輸入密碼"
                    data-testid="input-password"
                  />
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                  {tab === "staff" ? (
                    <>
                      <p className="font-medium text-gray-600">Demo 員工帳號</p>
                      <p>管理員：<code className="bg-gray-200 px-1 rounded">admin</code> / admin123</p>
                      <p>業務：<code className="bg-gray-200 px-1 rounded">sales_chen</code> / demo123</p>
                      <p>財務：<code className="bg-gray-200 px-1 rounded">finance_lin</code> / demo123</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-600">Demo 客戶帳號（密碼皆為 demo123）</p>
                      <p>機構：<code className="bg-gray-200 px-1 rounded">cirai_org</code></p>
                      <p>社福機構：<code className="bg-gray-200 px-1 rounded">taipei_welfare</code></p>
                      <p>個人：<code className="bg-gray-200 px-1 rounded">chen_hua</code></p>
                    </>
                  )}
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full bg-[#0ABAB5] hover:bg-[#089490] text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? "處理中..." : tab === "register" ? "送出申請" : "登入"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
