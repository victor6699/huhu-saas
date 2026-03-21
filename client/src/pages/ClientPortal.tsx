import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Client = { id: number; clientType: string; orgName: string | null; contactName: string; contactEmail: string; status: string };
type Plan = { id: number; name: string; description: string; monthlyPrice: number; annualPrice: number; maxElders: number; features: string };
type Subscription = { id: number; planId: number; billingCycle: string; status: string; elderCount: number; startDate: string; endDate: string; nextBillingDate: string; amount: number };
type Invoice = { id: number; invoiceNo: string; issueDate: string; dueDate: string; periodStart: string; periodEnd: string; subtotal: number; tax: number; total: number; status: string; notes: string | null };
type ServiceRecord = { id: number; month: string; elderCount: number; conversationCount: number; alertCount: number; activeElders: number };

const STATUS_BADGE: Record<string, string> = {
  active: "bg-green-100 text-green-800", pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800", unpaid: "bg-yellow-100 text-yellow-800",
  overdue: "bg-red-100 text-red-800",
};
const STATUS_ZH: Record<string, string> = { active: "啟用中", pending: "待審核", paid: "已付款", unpaid: "待付款", overdue: "逾期" };

function Badge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_ZH[status] ?? status}</span>;
}

export default function ClientPortal() {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const [section, setSection] = useState<"overview"|"invoices"|"subscriptions"|"plans"|"service">("overview");
  const [payModal, setPayModal] = useState<Invoice | null>(null);
  const [payMethod, setPayMethod] = useState("ecpay");
  const [payLoading, setPayLoading] = useState(false);

  const { data: me } = useQuery<Client>({ queryKey: ["/api/me"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/portal/subscriptions"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/portal/invoices"] });
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({ queryKey: ["/api/portal/service-records"] });
  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["/api/plans"] });

  const logout = async () => {
    await apiRequest("POST", "/api/logout");
    queryClient.clear();
    nav("/");
  };

  const fmt = (n: number) => n.toLocaleString("zh-TW");

  async function handlePay() {
    if (!payModal) return;
    setPayLoading(true);
    try {
      const res = await apiRequest("POST", "/api/portal/pay", { invoiceId: payModal.id, method: payMethod });
      const data = await res.json();
      toast({ title: "付款成功", description: `交易編號：${data.transactionId}` });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/invoices"] });
      setPayModal(null);
    } catch (e: any) {
      const msg = await e?.response?.json().catch(() => ({ message: "付款失敗" }));
      toast({ title: "付款失敗", description: msg?.message, variant: "destructive" });
    } finally { setPayLoading(false); }
  }

  const unpaidCount = invoices.filter(i => i.status === "unpaid" || i.status === "overdue").length;
  const unpaidAmt = invoices.filter(i => i.status === "unpaid" || i.status === "overdue").reduce((s, i) => s + i.total, 0);
  const activeSub = subscriptions.find(s => s.status === "active");

  const navItems = [
    { key: "overview", label: "總覽", icon: "🏠" },
    { key: "invoices", label: "帳單查詢", icon: "🧾", badge: unpaidCount > 0 ? unpaidCount : undefined },
    { key: "subscriptions", label: "我的訂閱", icon: "📋" },
    { key: "plans", label: "方案介紹", icon: "✨" },
    { key: "service", label: "使用紀錄", icon: "📈" },
  ] as const;

  const clientLabel = me ? (me.orgName || me.contactName) : "載入中...";
  const typeZH: Record<string, string> = { institution: "機構", social_welfare: "社會局/社福", individual: "個人" };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-teal-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-teal-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-teal-400 rounded-lg flex items-center justify-center text-sm font-bold">H</div>
            <div>
              <p className="text-sm font-bold text-white">HuHu AI</p>
              <p className="text-xs text-teal-200">客戶服務平台</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.key} onClick={() => setSection(item.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${section === item.key ? "bg-teal-600 text-white" : "text-teal-100 hover:bg-teal-800 hover:text-white"}`}>
              <span className="flex items-center gap-2"><span>{item.icon}</span>{item.label}</span>
              {(item as any).badge && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{(item as any).badge}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-teal-700">
          <div className="text-xs text-teal-200 mb-2 px-1 truncate">{clientLabel}</div>
          {me && <div className="text-xs text-teal-300 mb-2 px-1">{typeZH[me.clientType] ?? me.clientType} · <Badge status={me.status} /></div>}
          <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-teal-200 hover:bg-teal-800 hover:text-white transition-colors">🚪 登出</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">

          {/* ── Overview ── */}
          {section === "overview" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">您好，{me?.contactName} 👋</h1>
              <p className="text-sm text-gray-500 mb-6">{clientLabel}</p>

              {/* Status banners */}
              {me?.status === "pending" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <span className="text-2xl">⏳</span>
                  <div>
                    <p className="font-semibold text-amber-800">帳號審核中</p>
                    <p className="text-sm text-amber-700 mt-1">您的帳號正在審核，通常1個工作日內完成。開通後即可開始使用所有服務。如有疑問請聯絡客服：service@huhu.ai</p>
                  </div>
                </div>
              )}

              {unpaidCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3 cursor-pointer hover:bg-red-100" onClick={() => setSection("invoices")}>
                  <span className="text-2xl">🔔</span>
                  <div>
                    <p className="font-semibold text-red-800">您有 {unpaidCount} 張待付款帳單</p>
                    <p className="text-sm text-red-700 mt-1">未付金額合計：NT$ {fmt(unpaidAmt)}，請點此前往付款</p>
                  </div>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">目前方案</p>
                  <p className="text-lg font-bold text-teal-700 mt-1">{activeSub ? (plans.find(p=>p.id===activeSub.planId)?.name ?? "方案載入中") : "尚未訂閱"}</p>
                  {activeSub && <p className="text-xs text-gray-400 mt-1">{activeSub.billingCycle==="annual"?"年繳":"月繳"} · 到期 {activeSub.endDate}</p>}
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">服務長輩數</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{activeSub?.elderCount ?? 0} 位</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">帳單狀態</p>
                  <p className={`text-lg font-bold mt-1 ${unpaidCount > 0 ? "text-red-600" : "text-green-600"}`}>{unpaidCount > 0 ? `${unpaidCount} 張待繳` : "全部付清"}</p>
                </div>
              </div>

              {/* Recent invoices */}
              <div className="bg-white rounded-xl border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">最近帳單</h2>
                  <button onClick={() => setSection("invoices")} className="text-sm text-teal-600 hover:underline">查看全部</button>
                </div>
                {invoices.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">尚無帳單紀錄</div>
                ) : (
                  <div className="divide-y">
                    {[...invoices].sort((a,b)=>b.id-a.id).slice(0,4).map(inv => (
                      <div key={inv.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{inv.invoiceNo}</p>
                          <p className="text-xs text-gray-500">{inv.periodStart} ~ {inv.periodEnd}</p>
                        </div>
                        <div className="text-right flex items-center gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">NT$ {fmt(inv.total)}</p>
                            <Badge status={inv.status} />
                          </div>
                          {(inv.status === "unpaid" || inv.status === "overdue") && (
                            <button onClick={() => setPayModal(inv)} className="px-3 py-1.5 bg-teal-600 text-white text-xs rounded-lg hover:bg-teal-700 font-medium">立即付款</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Invoices ── */}
          {section === "invoices" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">帳單查詢</h1>
              {invoices.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">尚無帳單紀錄</div>
              ) : (
                <div className="space-y-3">
                  {[...invoices].sort((a,b)=>b.id-a.id).map(inv => (
                    <div key={inv.id} className="bg-white rounded-xl border p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm font-bold text-blue-700">{inv.invoiceNo}</p>
                          <p className="text-sm text-gray-600 mt-1">服務期間：{inv.periodStart} ~ {inv.periodEnd}</p>
                          <p className="text-xs text-gray-400 mt-0.5">發票日：{inv.issueDate} · 付款截止：{inv.dueDate}</p>
                          {inv.notes && <p className="text-xs text-gray-400 mt-0.5">備註：{inv.notes}</p>}
                        </div>
                        <div className="text-right">
                          <Badge status={inv.status} />
                          <p className="text-xs text-gray-400 mt-1">小計 NT$ {fmt(inv.subtotal)}</p>
                          <p className="text-xs text-gray-400">稅額 NT$ {fmt(inv.tax)}</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">合計 NT$ {fmt(inv.total)}</p>
                          {(inv.status === "unpaid" || inv.status === "overdue") && (
                            <button onClick={() => setPayModal(inv)} className="mt-2 px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700 font-medium">立即付款</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Subscriptions ── */}
          {section === "subscriptions" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">我的訂閱</h1>
              {subscriptions.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center">
                  <p className="text-gray-400 mb-4">尚未訂閱任何方案</p>
                  <button onClick={() => setSection("plans")} className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm">查看方案</button>
                </div>
              ) : (
                <div className="space-y-4">
                  {subscriptions.map(s => {
                    const plan = plans.find(p => p.id === s.planId);
                    const features: string[] = plan ? JSON.parse(plan.features) : [];
                    return (
                      <div key={s.id} className="bg-white rounded-xl border p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-bold text-gray-900 text-lg">{plan?.name ?? "方案載入中"}</p>
                            <p className="text-sm text-gray-500">{s.billingCycle === "annual" ? "年繳方案" : "月繳方案"} · {s.elderCount} 位長輩</p>
                          </div>
                          <div className="text-right">
                            <Badge status={s.status} />
                            <p className="text-lg font-bold text-gray-900 mt-1">NT$ {fmt(s.amount)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                          <div>開始日期：{s.startDate}</div>
                          <div>到期日期：{s.endDate}</div>
                          <div>下次計費：{s.nextBillingDate}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {features.map((f, i) => (
                            <span key={i} className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs">✓ {f}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Plans ── */}
          {section === "plans" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">服務方案</h1>
              <p className="text-sm text-gray-500 mb-6">如需升級或更換方案，請聯絡業務：sales@huhu.ai</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan, idx) => {
                  const features: string[] = JSON.parse(plan.features);
                  const isActive = subscriptions.some(s => s.planId === plan.id && s.status === "active");
                  const colors = ["border-blue-200 bg-blue-50", "border-teal-200 bg-teal-50", "border-indigo-200 bg-indigo-50", "border-purple-200 bg-purple-50"];
                  const textColors = ["text-blue-700", "text-teal-700", "text-indigo-700", "text-purple-700"];
                  return (
                    <div key={plan.id} className={`rounded-xl border-2 ${colors[idx]} p-5 relative`}>
                      {isActive && <span className="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">目前使用中</span>}
                      <p className={`text-lg font-bold ${textColors[idx]}`}>{plan.name}</p>
                      <p className="text-sm text-gray-600 mt-1 mb-3">{plan.description}</p>
                      <div className="flex gap-4 mb-3">
                        <div>
                          <p className="text-xs text-gray-400">月繳</p>
                          <p className="font-bold text-gray-900">NT$ {fmt(plan.monthlyPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">年繳（省2個月）</p>
                          <p className="font-bold text-gray-900">NT$ {fmt(plan.annualPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">最多長輩數</p>
                          <p className="font-bold text-gray-900">{plan.maxElders === 999 ? "無上限" : `${plan.maxElders} 位`}</p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {features.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <span className="text-green-500">✓</span>{f}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Service Records ── */}
          {section === "service" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">服務使用紀錄</h1>
              {serviceRecords.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">尚無使用紀錄</div>
              ) : (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["月份","服務長輩數","對話次數","警報數","活躍長輩"].map(h=>(
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...serviceRecords].sort((a,b)=>b.month.localeCompare(a.month)).map(r=>(
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{r.month}</td>
                          <td className="px-4 py-3">{r.elderCount} 位</td>
                          <td className="px-4 py-3">{r.conversationCount.toLocaleString()}</td>
                          <td className="px-4 py-3">{r.alertCount}</td>
                          <td className="px-4 py-3">{r.activeElders} 位</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold mb-1">線上付款</h2>
            <p className="text-sm text-gray-500 mb-4">帳單：{payModal.invoiceNo}</p>
            {/* Invoice summary */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">服務期間</span><span>{payModal.periodStart} ~ {payModal.periodEnd}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">小計</span><span>NT$ {fmt(payModal.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">稅額</span><span>NT$ {fmt(payModal.tax)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>合計</span><span className="text-teal-700 text-lg">NT$ {fmt(payModal.total)}</span></div>
            </div>
            {/* Payment method */}
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">選擇付款方式</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "ecpay", label: "綠界科技", sub: "信用卡/ATM", icon: "🟢" },
                  { id: "newebpay", label: "藍新金流", sub: "信用卡/行動支付", icon: "🔵" },
                  { id: "stripe", label: "Stripe", sub: "國際信用卡", icon: "💳" },
                  { id: "bank_transfer", label: "銀行匯款", sub: "企業匯款", icon: "🏦" },
                ].map(m => (
                  <button key={m.id} onClick={() => setPayMethod(m.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${payMethod === m.id ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="text-base">{m.icon}</p>
                    <p className="text-sm font-medium text-gray-800">{m.label}</p>
                    <p className="text-xs text-gray-400">{m.sub}</p>
                  </button>
                ))}
              </div>
              {payMethod === "bank_transfer" && (
                <div className="mt-3 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  <p className="font-medium mb-1">匯款資訊：</p>
                  <p>銀行：國泰世華（013）</p>
                  <p>帳號：1234-567-890123</p>
                  <p>戶名：禾禾智能股份有限公司</p>
                  <p className="mt-1 text-blue-500">匯款後請截圖回報客服，我們將手動確認</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handlePay} disabled={payLoading || payMethod === "bank_transfer"}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-xl font-semibold hover:bg-teal-700 disabled:opacity-50 text-sm">
                {payLoading ? "處理中..." : payMethod === "bank_transfer" ? "請依上方資訊匯款" : `確認付款 NT$ ${fmt(payModal.total)}`}
              </button>
              <button onClick={() => setPayModal(null)} className="flex-1 border py-2.5 rounded-xl text-sm">取消</button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">此為模擬付款環境，不會實際扣款</p>
          </div>
        </div>
      )}
    </div>
  );
}
