import { supabaseAdmin } from '../server/supabase.js';

async function main() {
  const plans = [
    {
      name: '基本方案',
      description: '適合剛開始使用的家庭',
      monthly_price: 288,
      annual_price: 2988,
      max_elders: 1,
      features: JSON.stringify(['支援 1 位長輩', '基礎健康紀錄', 'AI 語音對話']),
      is_active: true
    },
    {
      name: '進階方案',
      description: '適合需要多位長輩的家庭',
      monthly_price: 588,
      annual_price: 5988,
      max_elders: 3,
      features: JSON.stringify(['支援 3 位長輩', '進階健康紀錄與分析', 'AI 語音對話', '家屬緊急通知']),
      is_active: true
    }
  ];

  // delete all first
  await supabaseAdmin.from('plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  
  const { data, error } = await supabaseAdmin.from('plans').insert(plans);
  console.log('Insert:', data, 'Error:', error);
}

main().catch(console.error);