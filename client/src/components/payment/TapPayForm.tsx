import { useEffect, useState, useRef } from "react";

interface TapPayFormProps {
  onSubmit: (prime: string) => void;
  loading: boolean;
  buttonText?: string;
}

// TapPay Sandbox App ID and Key (hardcoded as fallback for testing)
const APP_ID   = parseInt(import.meta.env.VITE_TAPPAY_APP_ID   || "168511", 10);
const APP_KEY  = import.meta.env.VITE_TAPPAY_APP_KEY            || "app_8SzB1FIS9nBRfGnveqGRYLrcq1lE8CwcUD5qlQPeq7EuCkzyHAbp16mTxXwt";
const ENV_MODE = import.meta.env.VITE_TAPPAY_ENV                 || "sandbox";

export function TapPayForm({ onSubmit, loading, buttonText = "確認付款" }: TapPayFormProps) {
  const [isReady, setIsReady] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;

    const tryInit = () => {
      // @ts-ignore
      const TPD = window.TPDirect;
      if (!TPD) {
        setSdkError("TapPay SDK 腳本尚未載入，請重新整理頁面。");
        return;
      }

      try {
        TPD.setupSDK(APP_ID, APP_KEY, ENV_MODE);
        console.log("[TapPay] setupSDK OK — appId:", APP_ID, "env:", ENV_MODE);
        setSdkLoaded(true);
        setSdkError(null);
      } catch (err: any) {
        console.error("[TapPay] setupSDK error:", err);
        setSdkError("SDK 初始化失敗: " + (err?.message || String(err)));
        return;
      }

      try {
        TPD.card.setup({
          fields: {
            number:         { element: '#card-number',          placeholder: '**** **** **** ****' },
            expirationDate: { element: '#card-expiration-date', placeholder: 'MM / YY'            },
            ccv:            { element: '#card-ccv',             placeholder: 'CVV'                },
          },
          styles: {
            'input':                   { color: '#374151', 'font-family': 'sans-serif', 'font-size': '14px' },
            '.valid':                  { color: '#059669' },
            '.invalid':                { color: '#DC2626' },
          },
          isMaskCreditCardNumber: true,
          maskCreditCardNumberRange: { beginIndex: 6, cursorIndex: 1 },
        });

        TPD.card.onUpdate((update: any) => {
          setIsReady(!!update.canGetPrime);
        });

        initialized.current = true;
      } catch (err: any) {
        console.error("[TapPay] card.setup error:", err);
        setSdkError("卡片欄位初始化失敗，請重新整理頁面。");
      }
    };

    // If SDK not yet available, wait 1s for script to load
    // @ts-ignore
    if (window.TPDirect) {
      tryInit();
    } else {
      const timer = setTimeout(tryInit, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleSubmit = () => {
    // @ts-ignore
    const TPD = window.TPDirect;
    if (!TPD) return;

    const status = TPD.card.getTappayFieldsStatus();
    if (!status.canGetPrime) {
      alert("請填寫正確且完整的信用卡資訊！");
      return;
    }

    TPD.card.getPrime((result: any) => {
      if (result.status !== 0) {
        alert("信用卡授權失敗: " + result.msg);
        return;
      }
      onSubmit(result.card.prime);
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        {sdkError && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠️ {sdkError}
          </div>
        )}
        {!sdkLoaded && !sdkError && (
          <div className="text-sm text-gray-400 mb-2 flex items-center gap-1.5">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            TapPay 安全模組載入中...
          </div>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">信用卡卡號</label>
          <div
            className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all"
            id="card-number"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">有效期限</label>
            <div
              className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all"
              id="card-expiration-date"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">背面安全碼</label>
            <div
              className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all"
              id="card-ccv"
            />
          </div>
        </div>

        {sdkLoaded && (
          <p className="text-xs text-gray-400">
            🧪 <strong>測試用卡號</strong>：4242 4242 4242 4242 ｜有效期限：任意未來日期 ｜CVV：任意3碼
          </p>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isReady || loading}
        className="w-full bg-[#0ABAB5] text-white py-2.5 rounded-xl font-bold tracking-wide hover:bg-[#089490] disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md transition-all active:scale-[0.98]"
      >
        {loading ? "授權中，請稍候..." : buttonText}
      </button>

      <div className="flex items-center justify-center gap-1.5 opacity-60 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <p className="text-[10px] text-gray-500 font-medium">受到 TapPay PCI DSS 國際級資安認證加密保護</p>
      </div>
    </div>
  );
}
