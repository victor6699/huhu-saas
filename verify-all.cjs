const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://epbviowqbflsmoqomysi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o'
);

async function main() {
  const TWINC = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';
  const LOVE  = 'd93ba09e-dffd-4309-81e9-2dff3e8c82b7';

  // admin@twinc.ai
  const { data: t1 } = await sb.from('person_profiles').select('id, full_name').eq('user_id', TWINC).single();
  const { data: t2 } = await sb.from('organization_members').select('role_code, status, organization_id').eq('user_id', TWINC);
  const { data: t3 } = await sb.auth.admin.getUserById(TWINC);
  console.log('admin@twinc.ai:');
  console.log('  profile:', t1 ? t1.full_name : 'NONE');
  console.log('  membership:', t2?.length ? t2.map(m => m.role_code + ' [' + m.status + ']').join(', ') : 'NONE');
  console.log('  metadata.role:', t3?.user?.user_metadata?.role || 'NONE');

  // admin@love.com
  const { data: l1 } = await sb.from('person_profiles').select('id, full_name').eq('user_id', LOVE).single();
  const { data: l2 } = await sb.from('organization_members').select('role_code, status, organization_id').eq('user_id', LOVE);
  const { data: l3 } = await sb.auth.admin.getUserById(LOVE);
  console.log('\nadmin@love.com:');
  console.log('  profile:', l1 ? l1.full_name : 'NONE');
  console.log('  membership:', l2?.length ? l2.map(m => m.role_code + ' [' + m.status + ']').join(', ') : 'NONE');
  console.log('  metadata.role:', l3?.user?.user_metadata?.role || 'NONE');
}
main().catch(e => console.error(e.message));
