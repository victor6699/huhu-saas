import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, BarChart, Bar, Legend } from 'recharts';

type WeeklyMetric = {
  id: string;
  week_start: string;
  message_count: number;
  total_chars: number;
  vocabulary_diversity: number;
  avg_emotion_score: number;
  degradation_level: string;
  degradation_reasons: string[];
};

type PHQ2Screening = {
  id: string;
  screening_date: string;
  score: number;
  risk_level: string;
};

export function HealthDashboardModal({ recipientId, name, onClose }: { recipientId: string; name: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ weeklyMetrics: WeeklyMetric[]; phq2Screenings: PHQ2Screening[] }>({ queryKey: [`/api/portal/health/${recipientId}`] });

  // 格式化資料
  const metricsData = (data?.weeklyMetrics || []).map((m: WeeklyMetric) => ({
    ...m,
    date: new Date(m.week_start).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
    emotion: Number(m.avg_emotion_score),
    diversity: Number(m.vocabulary_diversity) * 100, // 轉化為更好看的顯示數值
  }));

  const phq2Data = (data?.phq2Screenings || []).map((p: PHQ2Screening) => ({
    ...p,
    date: new Date(p.screening_date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
    score: Number(p.score),
  }));

  // 取得最新一週的退化狀態
  const latestMetric = data?.weeklyMetrics?.[data.weeklyMetrics.length - 1];
  const isAlert = latestMetric?.degradation_level !== 'normal' && latestMetric?.degradation_level != null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl p-8 max-w-5xl w-full h-[90vh] overflow-y-auto shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
        >
          ✕
        </button>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-[#0ABAB5] to-[#7DDDD9] rounded-2xl flex items-center justify-center text-white text-3xl shadow-lg">
            ❤️
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{name} 的健康趨勢儀表板</h2>
            <p className="text-gray-500 text-sm mt-1">AI 伴護長時間觀測的語言活躍度與情緒風險指標</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0ABAB5]"></div>
          </div>
        ) : (
          <div className="space-y-8">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">長照認知退化警示</p>
                {isAlert ? (
                  <div className="mt-2 text-red-600 font-bold text-lg flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span> 偵測到活動力下降
                  </div>
                ) : (
                  <div className="mt-2 text-green-600 font-bold text-lg flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500"></span> 狀況平穩健康
                  </div>
                )}
                {isAlert && latestMetric?.degradation_reasons?.length > 0 && (
                  <ul className="mt-3 text-xs text-red-800 space-y-1 bg-red-50 p-2 rounded-lg">
                    {latestMetric.degradation_reasons.map((r: string, i: number) => <li key={i}>• {r}</li>)}
                  </ul>
                )}
              </div>

              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">語言認知活躍度 (最新)</p>
                <div className="mt-2 font-bold text-2xl text-blue-600">
                  {latestMetric?.vocabulary_diversity ? (Number(latestMetric.vocabulary_diversity) * 100).toFixed(1) : '-'} <span className="text-sm font-normal text-gray-400">分</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">評估使用字詞的豐富度，高分代表思維清晰</p>
              </div>

              <div className="bg-white border rounded-2xl p-5 shadow-sm">
                <p className="text-gray-500 text-sm font-medium">PHQ-2 憂鬱篩檢 (最新)</p>
                <div className="mt-2 font-bold text-2xl text-orange-600">
                  {phq2Data[phq2Data.length - 1]?.score ?? '-' } <span className="text-sm font-normal text-gray-400">/ 6 分</span>
                </div>
                {phq2Data[phq2Data.length - 1]?.score >= 3 && (
                  <p className="text-xs text-red-500 mt-2 font-bold">⚠️ 需注意長輩情緒狀態，大於等於 3 分</p>
                )}
                {phq2Data[phq2Data.length - 1]?.score < 3 && (
                  <p className="text-xs text-gray-400 mt-2">低於 3 分，顯示情緒壓力低</p>
                )}
              </div>
            </div>

            {/* Charts Section */}
            {metricsData.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Chart 1: 語言活躍度趨勢 */}
                <div className="bg-white border rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-blue-500">🧠</span> 語言活躍度趨勢 (詞彙豐富度)
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={metricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorDiversity" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} stroke="#9CA3AF" />
                        <YAxis tick={{fontSize: 12}} stroke="#9CA3AF" />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="diversity" name="活躍度分數" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorDiversity)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: 每週互動字數 */}
                <div className="bg-white border rounded-2xl p-6 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-[#0ABAB5]">💬</span> 每週互動字數
                  </h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} stroke="#9CA3AF" />
                        <YAxis tick={{fontSize: 12}} stroke="#9CA3AF" />
                        <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="total_chars" name="輸入字數" fill="#0ABAB5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 3: PHQ-2 憂鬱篩檢歷史 */}
                <div className="bg-white border rounded-2xl p-6 shadow-sm lg:col-span-2">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <span className="text-orange-500">📊</span> PHQ-2 憂鬱篩檢分數跟蹤
                  </h3>
                  {phq2Data.length > 0 ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={phq2Data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="date" tick={{fontSize: 12}} tickMargin={10} stroke="#9CA3AF" />
                          <YAxis domain={[0, 6]} ticks={[0, 1, 2, 3, 4, 5, 6]} tick={{fontSize: 12}} stroke="#9CA3AF" />
                          <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          {/* 警戒線 */}
                          <Line type="stepAfter" dataKey="score" name="PHQ-2 分數" stroke="#f97316" strokeWidth={3} dot={{ r: 6, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                      <p className="text-gray-400 text-sm">累積資料未滿週期，尚無法呈現篩檢趨勢</p>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-2xl border-dashed border-2 border-gray-200">
                <span className="text-4xl mb-3">🌱</span>
                <p className="text-gray-500 font-medium">目前仍在收集基礎資料，AI 伴護需累積滿一週才能顯示完整趨勢圖</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
