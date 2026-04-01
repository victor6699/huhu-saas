import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { signIn, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<"staff" | "client">("client");
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handle = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await signIn(form.email, form.password);
      toast({ title: "登入成功", description: "歡迎回來！" });
    } catch (error) {
      toast({
        title: "登入失敗",
        description: error instanceof Error ? error.message : "帳號或密碼錯誤，請確認後重試",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABAB5] focus:border-transparent";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E0F8F7] via-white to-[#F0FEFE]">
        <div className="text-[#0ABAB5] text-lg font-medium animate-pulse">載入中...</div>
      </div>
    );
  }

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
            {(["client", "staff"] as const).map((currentTab) => (
              <button
                key={currentTab}
                onClick={() => setTab(currentTab)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  tab === currentTab
                    ? "text-[#0ABAB5] border-b-2 border-[#0ABAB5] bg-[#E0F8F7]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {currentTab === "client" ? "機構 / 單位登入" : "員工登入"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="p-6 space-y-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={handle("email")}
                className={inputCls}
                placeholder="your@email.com"
                data-testid="input-email"
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

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full bg-[#0ABAB5] hover:bg-[#089490] text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-60"
            >
              {loading ? "處理中..." : "登入"}
            </button>

            <div className="space-y-1 pt-1">
              <p className="text-center text-xs text-gray-400">
                忘記密碼？請聯絡客服{" "}
                <a href="mailto:support@huhu.ai" className="text-[#0ABAB5] underline">
                  support@huhu.ai
                </a>
              </p>
              <p className="text-center text-xs text-gray-400">
                個人用戶請由{" "}
                <span className="font-semibold text-[#0ABAB5]">HUHU Care App</span>{" "}
                訂閱頁面註冊，無需從此申請。
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
