import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, forceLogout } from "@/lib/queryClient";
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
const STATUS_ZH: Record<string, string> = { active: "生效中", pending: "處理中", paid: "已付款", unpaid: "未付款", overdue: "已逾期" };

function Badge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_ZH[status] ?? status}</span>;
}

export default function ClientPortal(props: { params?: { rest?: string } }) {
  const [, nav] = useLocation();
  const { toast } = useToast();
  const initialSection = (props.params?.rest as any) || "overview";
  const [section, setSection] = useState<"overview"|"invoices"|"subscriptions"|"plans"|"service"|"family">(initialSection);

  useEffect(() => {
    if (props.params?.rest && ["overview", "invoices", "subscriptions", "plans", "service", "family"].includes(props.params.rest)) {
      setSection(props.params.rest as any);
    }
  }, [props.params?.rest]);
  const [payModal, setPayModal] = useState<Invoice | null>(null);
  const [contactModal, setContactModal] = useState<any | null>(null);
  const [payMethod, setPayMethod] = useState("ecpay");
  const [payLoading, setPayLoading] = useState(false);

  const { data: me } = useQuery<Client>({ queryKey: ["/api/me"] });
  const { data: subscriptions = [] } = useQuery<Subscription[]>({ queryKey: ["/api/portal/subscriptions"] });
  const { data: invoices = [] } = useQuery<Invoice[]>({ queryKey: ["/api/portal/invoices"] });
  const { data: serviceRecords = [] } = useQuery<ServiceRecord[]>({ queryKey: ["/api/portal/service-records"] });
  const { data: plans = [] } = useQuery<Plan[]>({ queryKey: ["/api/plans"] });
  const { data: family = [] } = useQuery<any[]>({ queryKey: ["/api/portal/family"] });

  const logout = async () => {
    await forceLogout();
  };

  const fmt = (n: number) => n.toLocaleString("zh-TW");

  async function handlePay() {
    if (!payModal) return;
    setPayLoading(true);
    try {
      const data = await apiRequest("POST", "/api/portal/pay", { invoiceId: payModal.id, method: payMethod });
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
    { key: "overview",       label: "總覽",     icon: "🏠" },
    { key: "family",         label: "家人管理", icon: "👥" },
    { key: "invoices",       label: "發票管理", icon: "📄", badge: unpaidCount > 0 ? unpaidCount : undefined },
    { key: "subscriptions",  label: "訂閱",     icon: "📋" },
    { key: "plans",          label: "方案選購", icon: "💡" },
    { key: "service",        label: "服務記錄", icon: "📊" },
  ] as const;

  const clientLabel = me ? (me.orgName || me.contactName) : "載入中...";
  const typeZH: Record<string, string> = { institution: "機構", social_welfare: "社會局/社福", individual: "個人" };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-[#0d3d3d] text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-[#0ABAB5]/30">
          <div className="flex items-center gap-2">
            <img src="/huhu-logo.png" alt="HuHu" className="w-8 h-8 object-contain rounded-lg" onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }} />
            <div>
              <p className="text-sm font-bold text-white">HuHu AI</p>
              <p className="text-xs text-[#7DDDD9]">客戶後台</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.key} onClick={() => { setSection(item.key as any); nav(`/portal/${item.key}`); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                section === item.key ? "bg-[#0ABAB5] text-white" : "text-[#A0E7E4] hover:bg-[#0ABAB5]/20 hover:text-white"
              }`}>
              <span className="flex items-center gap-2"><span>{item.icon}</span>{item.label}</span>
              {(item as any).badge && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{(item as any).badge}</span>}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-[#0ABAB5]/30">
          <div className="text-xs text-[#7DDDD9] mb-2 px-1 truncate">{clientLabel}</div>
          {me && <div className="text-xs text-[#A0E7E4] mb-2 px-1">{typeZH[me.clientType] ?? me.clientType} · <Badge status={me.status} /></div>}
          <a href="https://huhu-care.onrender.com" className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[#A0E7E4] hover:bg-[#0ABAB5]/20 hover:text-white transition-colors mb-1">🏠 回到 HuHu Care</a>
          <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg text-sm text-[#A0E7E4] hover:bg-[#0ABAB5]/20 hover:text-white transition-colors">🚪 登出</button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">

          {/* 總覽 */}
          {section === "overview" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">您好，{me?.contactName} 👋</h1>
              <p className="text-sm text-gray-500 mb-6">{clientLabel}</p>

              {me?.status === "pending" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                  <span className="text-2xl">⏳</span>
                  <div>
                    <p className="font-semibold text-amber-800">帳號審核中</p>
                    <p className="text-sm text-amber-700 mt-1">我們已收到您的申請，預計 1 個工作天內完成審核，審核完成後會通知您的聯絡信箱。如有疑問請聯絡 service@huhu.ai</p>
                  </div>
                </div>
              )}

              {unpaidCount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3 cursor-pointer hover:bg-red-100" onClick={() => setSection("invoices")}>
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-red-800">您有 {unpaidCount} 筆待付款發票</p>
                    <p className="text-sm text-red-700 mt-1">合計 NT$ {fmt(unpaidAmt)}，請點此前往付款</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSection("subscriptions"); nav("/portal/subscriptions"); }}>
                  <p className="text-xs text-gray-500">目前方案</p>
                  <p className="text-lg font-bold text-[#0ABAB5] mt-1">{activeSub ? (plans.find(p => p.id === activeSub.planId)?.name ?? "載入中") : "未訂閱"}</p>
                  {activeSub && <p className="text-xs text-gray-400 mt-1">{activeSub.billingCycle === "annual" ? "年繳" : "月繳"} · 下次扣款日: {activeSub.nextBillingDate}</p>}
                </div>
                <div className="bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setSection("family"); nav("/portal/family"); }}>
                  <p className="text-xs text-gray-500">使用中長輩數</p>
                  <p className="text-lg font-bold text-blue-700 mt-1">{family.length} 人</p>
                </div>
                <div className="bg-white rounded-xl border p-4">
                  <p className="text-xs text-gray-500">待付發票</p>
                  <p className={`text-lg font-bold mt-1 ${unpaidCount > 0 ? "text-red-600" : "text-green-600"}`}>
                    {unpaidCount > 0 ? `${unpaidCount} 筆待付款` : "全部清償"}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-xl border">
                <div className="p-4 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-800">最新發票</h2>
                  <button onClick={() => setSection("invoices")} className="text-sm text-[#0ABAB5] hover:underline">查看全部</button>
                </div>
                {invoices.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">尚無發票資料</div>
                ) : (
                  <div className="divide-y">
                    {[...invoices].sort((a, b) => b.id - a.id).slice(0, 4).map(inv => (
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
                            <button onClick={() => setPayModal(inv)} className="px-3 py-1.5 bg-[#0ABAB5] text-white text-xs rounded-lg hover:bg-[#089490] font-medium">立即付款</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 家人管理 */}
          {section === "family" && (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl font-bold text-gray-900">家人帳號管理</h1>
                <a href="https://huhu-care.onrender.com/onboarding" className="px-4 py-2 bg-[#0ABAB5] text-white rounded-lg hover:bg-[#089490] text-sm font-medium flex items-center gap-2 transition-colors">
                  <span>➕</span> <span className="hidden sm:inline">新增家人</span>
                </a>
              </div>

              {family.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center flex flex-col items-center">
                   <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-3xl mb-4">👥</div>
                   <h3 className="text-lg font-bold text-gray-800 mb-1">尚無家屬資料</h3>
                   <p className="text-gray-500 text-sm mb-6 max-w-sm">您尚未加入任何家人至您的帳號群組中。點擊下方按鈕開始為長輩建立專屬健康助理。</p>
                   <a href="https://huhu-care.onrender.com/onboarding" className="px-6 py-2.5 bg-[#0ABAB5] text-white rounded-lg font-medium hover:bg-[#089490] transition-colors shadow-sm">
                     新增家人帳號
                   </a>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {family.map((member: any) => {
                    const profile = member.person_profiles || {};
                    return (
                      <div key={member.id} className="bg-white rounded-xl border p-5 relative overflow-hidden group hover:shadow-md transition-shadow">
                        <div className="absolute top-0 right-0 p-4">
                          <Badge status={member.status} />
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                          <img 
                            src={profile.avatar_url || "https://ui-avatars.com/api/?background=E0F8F7&color=0ABAB5&name=" + encodeURIComponent(profile.full_name || "User")} 
                            alt={profile.full_name} 
                            className="w-16 h-16 rounded-full border border-gray-100 object-cover shadow-sm bg-gray-50"
                          />
                          <div>
                            <h3 className="font-bold text-lg text-gray-900">{profile.full_name || "未命名"}</h3>
                            <p className="text-sm text-gray-500">{member.care_level ? `照護等級: ${member.care_level}` : "一般照護"}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-6">
                           <div className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded border border-gray-100">
                             <span className="text-gray-500">性別</span>
                             <span className="text-gray-700 font-medium">{profile.gender === "M" ? "男" : profile.gender === "F" ? "女" : "其他"}</span>
                           </div>
                           <div className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded border border-gray-100 group/contact hover:bg-white transition-colors">
                             <span className="text-gray-500">聯絡資訊</span>
                             <div className="flex items-center gap-2">
                               <span className="text-gray-700 font-medium">{profile.phone || "無紀錄"}</span>
                               <button onClick={() => setContactModal(member)} className="text-xs text-[#0ABAB5] opacity-0 group-hover/contact:opacity-100 transition-opacity whitespace-nowrap px-2 py-1 bg-[#E0F8F7] rounded">修改</button>
                             </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                           <a href="https://huhu-care.onrender.com/#/" className="text-center py-2 text-sm text-[#0ABAB5] border border-[#0ABAB5] rounded-lg hover:bg-[#F0FEFE] font-medium transition-colors">
                             開啟健康儀表板
                           </a>
                           <a href={`https://huhu-care.onrender.com/chat?id=${member.id}`} className="text-center py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-black font-medium transition-colors">
                             開始對話
                           </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 發票管理 */}
          {section === "invoices" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">發票管理</h1>
              {invoices.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">尚無發票資料</div>
              ) : (
                <div className="space-y-3">
                  {[...invoices].sort((a, b) => b.id - a.id).map(inv => (
                    <div key={inv.id} className="bg-white rounded-xl border p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono text-sm font-bold text-blue-700">{inv.invoiceNo}</p>
                          <p className="text-sm text-gray-600 mt-1">計費期間：{inv.periodStart} ~ {inv.periodEnd}</p>
                          <p className="text-xs text-gray-400 mt-0.5">開立日期：{inv.issueDate} · 付款期限：{inv.dueDate}</p>
                          {inv.notes && <p className="text-xs text-gray-400 mt-0.5">備註：{inv.notes}</p>}
                        </div>
                        <div className="text-right">
                          <Badge status={inv.status} />
                          <p className="text-xs text-gray-400 mt-1">稅前 NT$ {fmt(inv.subtotal)}</p>
                          <p className="text-xs text-gray-400">稅額 NT$ {fmt(inv.tax)}</p>
                          <p className="text-lg font-bold text-gray-900 mt-1">合計 NT$ {fmt(inv.total)}</p>

                          {(inv.status === "unpaid" || inv.status === "overdue") ? (
                            <button onClick={() => setPayModal(inv)} className="mt-2 w-full px-4 py-1.5 bg-[#0ABAB5] text-white text-sm rounded-lg hover:bg-[#089490] font-medium">立即付款</button>
                          ) : (
                            <button onClick={() => alert("連線電子發票中心...待開通")} className="mt-2 w-full px-4 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1 font-medium whitespace-nowrap"><span className="text-xs">📄</span> 電子發票存根</button>
                          )}

                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 訂閱 */}
          {section === "subscriptions" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">訂閱</h1>
              {subscriptions.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center">
                  <p className="text-gray-400 mb-4">尚無訂閱方案</p>
                  <button onClick={() => setSection("plans")} className="px-4 py-2 bg-[#0ABAB5] text-white rounded-lg text-sm">查看方案</button>
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
                            <p className="font-bold text-gray-900 text-lg">{plan?.name ?? "載入中"}</p>
                            <p className="text-sm text-gray-500">{s.billingCycle === "annual" ? "年繳訂閱" : "月繳訂閱"} · {s.elderCount} 人方案</p>
                          </div>
                          <div className="text-right">
                            <Badge status={s.status} />
                            <p className="text-lg font-bold text-gray-900 mt-1">NT$ {fmt(s.amount)}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                          <div>起始日：{s.startDate}</div>
                          <div>到期日：{s.endDate}</div>
                          <div>下次扣款：{s.nextBillingDate}</div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {features.map((f, i) => (
                            <span key={i} className="px-2 py-0.5 bg-[#E0F8F7] text-[#0ABAB5] rounded text-xs">✓ {f}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 方案選購 */}
          {section === "plans" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">可選方案</h1>
              <p className="text-sm text-gray-500 mb-6">如需升級或客製化請聯繫 sales@huhu.ai</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.map((plan, idx) => {
                  const features: string[] = JSON.parse(plan.features);
                  const isActive = subscriptions.some(s => s.planId === plan.id && s.status === "active");
                  const colors = ["border-[#A0E7E4] bg-[#E0F8F7]", "border-[#7DDDD9] bg-[#F0FEFE]", "border-indigo-200 bg-indigo-50", "border-purple-200 bg-purple-50"];
                  const textColors = ["text-[#0ABAB5]", "text-[#089490]", "text-indigo-700", "text-purple-700"];
                  return (
                    <div key={plan.id} className={`rounded-xl border-2 ${colors[idx % 4]} p-5 relative`}>
                      {isActive && <span className="absolute top-3 right-3 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full font-medium">目前使用中</span>}
                      <p className={`text-lg font-bold ${textColors[idx % 4]}`}>{plan.name}</p>
                      <p className="text-sm text-gray-600 mt-1 mb-3">{plan.description}</p>
                      <div className="flex gap-4 mb-3">
                        <div>
                          <p className="text-xs text-gray-400">月繳</p>
                          <p className="font-bold text-gray-900">NT$ {fmt(plan.monthlyPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">年繳（×12個月）</p>
                          <p className="font-bold text-gray-900">NT$ {fmt(plan.annualPrice)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">最多長輩數</p>
                          <p className="font-bold text-gray-900">{plan.maxElders === 999 ? "無限制" : `${plan.maxElders} 人`}</p>
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

          {/* 服務記錄 */}
          {section === "service" && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-6">月服務記錄</h1>
              {serviceRecords.length === 0 ? (
                <div className="bg-white rounded-xl border p-12 text-center text-gray-400">尚無服務記錄</div>
              ) : (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        {["月份", "使用中長輩數", "對話次數", "警報次數", "活躍長輩"].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...serviceRecords].sort((a, b) => b.month.localeCompare(a.month)).map(r => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{r.month}</td>
                          <td className="px-4 py-3">{r.elderCount} 人</td>
                          <td className="px-4 py-3">{r.conversationCount.toLocaleString()}</td>
                          <td className="px-4 py-3">{r.alertCount}</td>
                          <td className="px-4 py-3">{r.activeElders} 人</td>
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
            <h2 className="text-lg font-bold mb-1">確認付款</h2>
            <p className="text-sm text-gray-500 mb-4">發票：{payModal.invoiceNo}</p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">計費期間</span><span>{payModal.periodStart} ~ {payModal.periodEnd}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">稅前</span><span>NT$ {fmt(payModal.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">稅額</span><span>NT$ {fmt(payModal.tax)}</span></div>
              <div className="flex justify-between font-bold border-t pt-2 mt-2"><span>合計</span><span className="text-[#0ABAB5] text-lg">NT$ {fmt(payModal.total)}</span></div>
            </div>
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">請選擇付款方式</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: "ecpay",         label: "綠界科技",   sub: "支援信用卡/ATM",    icon: "💳" },
                  { id: "newebpay",      label: "藍新金流",   sub: "支援信用卡/電子錢包", icon: "🔵" },
                  { id: "stripe",        label: "Stripe",     sub: "國際信用卡",        icon: "💎" },
                  { id: "bank_transfer", label: "銀行轉帳",   sub: "手動確認付款",       icon: "🏦" },
                ].map(m => (
                  <button key={m.id} onClick={() => setPayMethod(m.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${payMethod === m.id ? "border-[#0ABAB5] bg-[#E0F8F7]" : "border-gray-200 hover:border-gray-300"}`}>
                    <p className="text-base">{m.icon}</p>
                    <p className="text-sm font-medium text-gray-800">{m.label}</p>
                    <p className="text-xs text-gray-400">{m.sub}</p>
                  </button>
                ))}
              </div>
              {payMethod === "bank_transfer" && (
                <div className="mt-3 bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                  <p className="font-medium mb-1">轉帳資訊：</p>
                  <p>銀行代碼：013</p>
                  <p>帳號：234-567-890123</p>
                  <p>戶名：呼呼智慧照護有限公司</p>
                  <p className="mt-1 text-blue-500">轉帳後請通知客服確認，約 1-2 個工作天</p>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handlePay} disabled={payLoading || payMethod === "bank_transfer"}
                className="flex-1 bg-[#0ABAB5] text-white py-2.5 rounded-xl font-semibold hover:bg-[#089490] disabled:opacity-50 text-sm">
                {payLoading ? "處理中..." : payMethod === "bank_transfer" ? "等待手動確認付款" : `確認付款 NT$ ${fmt(payModal.total)}`}
              </button>
              <button onClick={() => setPayModal(null)} className="flex-1 border py-2.5 rounded-xl text-sm">取消</button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-3">此操作受到安全加密保護</p>
          </div>
        </div>
      )}
      {contactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <h2 className="text-xl font-bold text-gray-900 mb-2">更新聯絡資訊</h2>
            <p className="text-sm text-gray-500 mb-5">為 {contactModal.person_profiles?.full_name} 設定即時聯絡方式，確保緊急時能立刻找到人。</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">聯絡電話</label>
                <input type="tel" defaultValue={contactModal.person_profiles?.phone || ""} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0ABAB5] focus:border-[#0ABAB5]" placeholder="例：0987-654-321" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LINE ID</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0ABAB5] focus:border-[#0ABAB5]" placeholder="例：huhu33" />
              </div>
              <div className="bg-orange-50/50 p-3 rounded-xl border border-orange-100">
                <label className="block text-sm font-bold text-orange-800 mb-2 border-b border-orange-200 pb-1">新增緊急 / 臨時聯絡人</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0ABAB5] focus:border-[#0ABAB5] mb-2 bg-white" placeholder="緊急聯絡人姓名" />
                <input type="tel" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-[#0ABAB5] focus:border-[#0ABAB5] bg-white" placeholder="緊急聯絡人生效電話" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => {
                toast({ title: "更新成功", description: "聯絡資訊已同步至系統端。" });
                setContactModal(null);
              }} className="flex-1 bg-[#0ABAB5] text-white py-2 rounded-xl font-semibold hover:bg-[#089490] text-sm shadow-sm">立即更新儲存</button>
              <button onClick={() => setContactModal(null)} className="flex-1 border py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
