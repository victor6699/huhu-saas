import { useEffect, useState } from "react";

// @ts-ignore
const TPDirect = window.TPDirect;

interface TapPayFormProps {
  onSubmit: (prime: string) => void;
  loading: boolean;
  buttonText?: string;
}

export function TapPayForm({ onSubmit, loading, buttonText = "確認付款" }: TapPayFormProps) {
  const [isReady, setIsReady] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => {
    // Check if TPDirect is available from the script tag in index.html
    // @ts-ignore
    const TPD = window.TPDirect;
    if (!TPD) {
      console.error("TapPay SDK not loaded");
      return;
    }

    try {
      TPD.setupSDK(
        parseInt(import.meta.env.VITE_TAPPAY_APP_ID || "168511", 10), 
        import.meta.env.VITE_TAPPAY_APP_KEY || "", 
        import.meta.env.VITE_TAPPAY_ENV || "sandbox"
      );
      setSdkLoaded(true);

      TPD.card.setup({
          fields: {
              number: {
                  element: '#card-number',
                  placeholder: '**** **** **** ****'
              },
              expirationDate: {
                  element: '#card-expiration-date',
                  placeholder: 'MM / YY'
              },
              ccv: {
                  element: '#card-ccv',
                  placeholder: 'CVV'
              }
          },
          styles: {
              'input': { 'color': '#374151', 'font-family': 'sans-serif' },
              'input.ccv': { 'font-size': '14px' },
              'input.expiration-date': { 'font-size': '14px' },
              'input.card-number': { 'font-size': '14px' },
              '.valid': { 'color': '#059669' }, // emerald-600
              '.invalid': { 'color': '#DC2626' }, // red-600
          },
          isMaskCreditCardNumber: true,
          maskCreditCardNumberRange: {
              beginIndex: 6,
              cursorIndex: 1
          }
      });

      TPD.card.onUpdate(function (update: any) {
        if (update.canGetPrime) {
          setIsReady(true);
        } else {
          setIsReady(false);
        }
      });
    } catch (err) {
      console.error("TPDirect setup error:", err);
    }
  }, []);

  const handleSubmit = () => {
    // @ts-ignore
    const TPD = window.TPDirect;
    if (!TPD) return;

    const tappayStatus = TPD.card.getTappayFieldsStatus()
    if (tappayStatus.canGetPrime === false) {
      alert("請填寫正確且完整的信用卡資訊！");
      return;
    }

    TPD.card.getPrime((result: any) => {
      if (result.status !== 0) {
        alert("信用卡授權失敗: " + result.msg);
        return;
      }
      // Send prime back to parent
      onSubmit(result.card.prime);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        {!sdkLoaded && <div className="text-sm text-red-500 mb-2">TapPay SDK 尚未準備好，請重新整理頁面。</div>}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1.5">信用卡卡號</label>
          <div className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all" id="card-number"></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">有效期限</label>
            <div className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all" id="card-expiration-date"></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">背面安全碼</label>
            <div className="h-10 border border-gray-300 rounded-lg px-3 flex items-center bg-gray-50 focus-within:ring-2 focus-within:ring-[#0ABAB5] focus-within:border-transparent transition-all" id="card-ccv"></div>
          </div>
        </div>
      </div>
      <button 
        onClick={handleSubmit} 
        disabled={!isReady || loading}
        className="w-full bg-[#0ABAB5] text-white py-2.5 rounded-xl font-bold tracking-wide hover:bg-[#089490] disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-md transition-all active:scale-[0.98]"
      >
        {loading ? "授權中，請稍候..." : buttonText}
      </button>
      <div className="flex items-center justify-center gap-1.5 opacity-60 mt-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        <p className="text-[10px] text-gray-500 font-medium">受到 TapPay PCI DSS 國際級資安認證加密保護</p>
      </div>
    </div>
  )
}
