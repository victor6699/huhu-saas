import { useEffect, useState, useRef } from "react";

interface TapPayFormProps {
  onSubmit: (prime: string) => void;
  loading: boolean;
  buttonText?: string;
}

const APP_ID   = parseInt(import.meta.env.VITE_TAPPAY_APP_ID   || "168511", 10);
const APP_KEY  = import.meta.env.VITE_TAPPAY_APP_KEY            || "app_8SzB1FIS9nBRfGnveqGRYLrcq1lE8CwcUD5qlQPeq7EuCkzyHAbp16mTxXwt";
const ENV_MODE = (import.meta.env.VITE_TAPPAY_ENV               || "sandbox") as "sandbox" | "production";
const SDK_URL  = "https://js.tappaysdk.com/tpdirect/v5.14.0";
const TIMEOUT_MS = 8000;

type LoadStatus = "idle" | "loading" | "ready" | "error";

// ── Inject SDK script with timeout ──────────────────────────────────────────
function injectSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).TPDirect) { resolve(); return; }

    const existing = document.getElementById("tappay-sdk-script") as HTMLScriptElement | null;
    if (existing) {
      // Already injecting — wait for it
      const poll = setInterval(() => {
        if ((window as any).TPDirect) { clearInterval(poll); resolve(); }
      }, 100);
      setTimeout(() => { clearInterval(poll); reject(new Error("SDK timeout")); }, TIMEOUT_MS);
      return;
    }

    const timer = setTimeout(() => reject(new Error("SDK 載入超時，請確認網路連線是否正常")), TIMEOUT_MS);

    const s = document.createElement("script");
    s.id  = "tappay-sdk-script";
    s.src = SDK_URL;
    s.onload  = () => { clearTimeout(timer); resolve(); };
    s.onerror = () => { clearTimeout(timer); reject(new Error(`TapPay SDK 無法載入（${SDK_URL}）`)); };
    document.head.appendChild(s);
  });
}

export function TapPayForm({ onSubmit, loading, buttonText = "確認付款" }: TapPayFormProps) {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [isReady, setIsReady] = useState(false);
  const [error, setError]  = useState<string | null>(null);
  const tryCount = useRef(0);

  const init = () => {
    tryCount.current += 1;
    setStatus("loading");
    setError(null);
    setIsReady(false);

    injectSDK()
      .then(() => {
        const TPD = (window as any).TPDirect;
        if (!TPD) throw new Error("TPDirect 物件不存在");

        // ── Step 1: setupSDK ────────────────────────────────
        try {
          TPD.setupSDK(APP_ID, APP_KEY, ENV_MODE);
          console.log("[TapPay] setupSDK OK", { APP_ID, ENV_MODE });
        } catch (e: any) {
          throw new Error("setupSDK 失敗: " + (e?.message || String(e)));
        }

        // ── Step 2: card.setup ──────────────────────────────
        try {
          TPD.card.setup({
            fields: {
              number:         { element: "#card-number",          placeholder: "**** **** **** ****" },
              expirationDate: { element: "#card-expiration-date", placeholder: "MM / YY" },
              ccv:            { element: "#card-ccv",             placeholder: "CVV" },
            },
            styles: {
              "input":    { color: "#374151", "font-family": "sans-serif", "font-size": "14px" },
              ".valid":   { color: "#059669" },
              ".invalid": { color: "#DC2626" },
            },
            isMaskCreditCardNumber: true,
            maskCreditCardNumberRange: { beginIndex: 6, cursorIndex: 1 },
          });
        } catch (e: any) {
          throw new Error("card.setup 失敗: " + (e?.message || String(e)));
        }

        // ── Step 3: listen ──────────────────────────────────
        TPD.card.onUpdate((update: any) => setIsReady(!!update.canGetPrime));

        setStatus("ready");
      })
      .catch((err: Error) => {
        console.error("[TapPay] init error:", err);
        setError(err.message || "初始化失敗，請重新整理頁面");
        setStatus("error");
      });
  };

  // Auto-init once on mount
  useEffect(() => { if (tryCount.current === 0) init(); }, []); // eslint-disable-line

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    const TPD = (window as any).TPDirect;
    if (!TPD) return;
    if (!TPD.card.getTappayFieldsStatus().canGetPrime) {
      alert("請填寫正確且完整的信用卡資訊！"); return;
    }
    TPD.card.getPrime((result: any) => {
      if (result.status !== 0) { alert("信用卡授權失敗: " + result.msg); return; }
      onSubmit(result.card.prime);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="space-y-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">

        {/* Error */}
        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-3 text-sm text-red-700">
            <p className="font-semibold mb-1">⚠️ 付款模組載入失敗</p>
            <p className="text-xs text-red-600 mb-2">{error}</p>
            <button
              onClick={init}
              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              🔄 重新載入
            </button>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div className="flex items-center gap-2.5 text-sm text-gray-500 py-1">
            <svg className="animate-spin w-4 h-4 text-[#0ABAB5] flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            <span>TapPay 安全模組載入中...</span>
          </div>
        )}

        {/* Card fields — always rendered so DOM elements exist before card.setup() */}
        <div style={{ display: status === "error" ? "none" : "block" }}>
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">信用卡卡號</label>
            <div id="card-number"
              className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">有效期限</label>
              <div id="card-expiration-date"
                className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">背面安全碼</label>
              <div id="card-ccv"
                className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] transition-all"
              />
            </div>
          </div>
        </div>

        {/* Test card hint */}
        {status === "ready" && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
            🧪 <strong>沙盒測試卡</strong>：4242 4242 4242 4242 ｜任意未來日期 ｜任意 3 碼
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isReady || loading || status !== "ready"}
        className="w-full bg-[#0ABAB5] text-white py-3 rounded-xl font-bold tracking-wide hover:bg-[#089490] disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md transition-all active:scale-[0.98]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            授權中，請稍候...
          </span>
        ) : buttonText}
      </button>

      <div className="flex items-center justify-center gap-1.5 opacity-50">
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <p className="text-[10px] text-gray-500 font-medium">受到 TapPay PCI DSS 國際級資安認證加密保護</p>
      </div>
    </div>
  );
}
