import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const { signIn, signInWithProvider, loading: authLoading } = useAuth();
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
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #fdf6e3 0%, #e8f5e9 30%, #e3f2fd 60%, #f3e5f5 100%)" }}>
      {/* Floating ambient orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute w-72 h-72 rounded-full bg-[#A0E7E4]/30 blur-3xl -top-20 -left-20 animate-pulse" />
        <div className="absolute w-96 h-96 rounded-full bg-amber-200/20 blur-3xl bottom-0 right-0" style={{ animation: "pulse 4s ease-in-out infinite" }} />
        <div className="absolute w-48 h-48 rounded-full bg-purple-200/20 blur-3xl top-1/3 right-1/4" style={{ animation: "pulse 6s ease-in-out infinite 1s" }} />
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-3 shadow-xl shadow-[#0ABAB5]/20 rounded-2xl overflow-hidden"
            style={{ animation: "pulse 3s ease-in-out infinite" }}>
            <img src="/huhu-logo.png" alt="HuHu" className="w-20 h-20 object-contain" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0ABAB5] to-[#067370] bg-clip-text text-transparent">HuHu saas</h1>
          <p className="text-muted-foreground text-sm mt-1">智慧照護管理平台</p>
        </div>

        <div className="backdrop-blur-xl bg-white/70 dark:bg-card/80 rounded-3xl shadow-2xl shadow-black/5 border border-white/50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200/50 bg-gray-100/40 dark:bg-muted/30">
            {(["client", "staff"] as const).map((currentTab) => (
              <button
                key={currentTab}
                onClick={() => setTab(currentTab)}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  tab === currentTab
                    ? "text-[#0ABAB5] border-b-2 border-[#0ABAB5] bg-white/60"
                    : "text-muted-foreground hover:text-foreground"
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
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 dark:bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABAB5] focus:border-transparent transition-all"
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
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 dark:bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0ABAB5] focus:border-transparent transition-all"
                placeholder="請輸入密碼"
                data-testid="input-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="button-submit"
              className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[#0ABAB5] to-[#089490] hover:from-[#089490] hover:to-[#067370] shadow-lg shadow-[#0ABAB5]/25 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? "處理中..." : "🔑 登入"}
            </button>

            {/* Divider */}
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200/80" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/70 px-3 text-muted-foreground">或使用其他方式</span>
              </div>
            </div>

            {/* Google Login */}
            <button
              type="button"
              onClick={async () => {
                try { await signInWithProvider("google"); }
                catch { toast({ title: "Google 登入失敗", variant: "destructive" }); }
              }}
              disabled={loading}
              className="flex items-center justify-center gap-2.5 w-full py-3 rounded-xl text-sm font-medium transition-all border bg-white hover:bg-gray-50 border-gray-200 text-gray-700 hover:shadow-md"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>使用 Google 帳號登入</span>
            </button>

            <div className="space-y-1 pt-1">
              <p className="text-center text-xs text-muted-foreground">
                忘記密碼？請聯絡客服{" "}
                <a href="mailto:support@huhu.ai" className="text-[#0ABAB5] underline">
                  support@huhu.ai
                </a>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                個人用戶請由{" "}
                <span className="font-semibold text-[#0ABAB5]">HUHU LIFE+ App</span>{" "}
                訂閱頁面註冊，無需從此申請。
              </p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground mt-6 opacity-60">
          © 2026 HuHu saas · 智慧照護管理平台
        </p>
      </div>
    </div>
  );
}
