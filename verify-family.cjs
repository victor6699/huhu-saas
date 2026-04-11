const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://epbviowqbflsmoqomysi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o'
);

async function main() {
  // Find family@huhu.ai user
  console.log('=== Checking family@huhu.ai ===\n');
  const { data: users } = await sb.auth.admin.listUsers();
  const familyUser = users?.users?.find(u => u.email === 'family@huhu.ai');

  if (!familyUser) {
    console.log('family@huhu.ai NOT FOUND in auth.users!');
    return;
  }

  const uid = familyUser.id;
  console.log('Auth user:', uid);
  console.log('Metadata:', JSON.stringify(familyUser.user_metadata));

  // Check person_profiles
  const { data: profile, error: pErr } = await sb
    .from('person_profiles')
    .select('id, full_name, email')
    .eq('user_id', uid)
    .single();
  console.log('\nPerson profile:', profile ? `${profile.id} (${profile.full_name})` : 'NONE');
  if (pErr && pErr.code !== 'PGRST116') console.log('  Error:', pErr.message);

  // Check organization_members
  const { data: mem } = await sb
    .from('organization_members')
    .select('id, role_code, status, organization_id')
    .eq('user_id', uid);
  console.log('Memberships:', mem?.length ? '' : 'NONE');
  mem?.forEach(m => console.log(`  - ${m.role_code} [${m.status}] org=${m.organization_id}`));

  // Test login
  console.log('\nTesting login...');
  const { data: login, error: loginErr } = await sb.auth.signInWithPassword({
    email: 'family@huhu.ai', password: 'family123',
  });
  console.log('Login:', loginErr ? 'FAIL: ' + loginErr.message : 'OK');
  if (login?.session) {
    console.log('Token exists:', !!login.session.access_token);
    console.log('Refresh token exists:', !!login.session.refresh_token);
  }

  // Check all 3 users summary
  console.log('\n=== All Users Summary ===');
  const TWINC = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';
  const LOVE  = 'd93ba09e-dffd-4309-81e9-2dff3e8c82b7';

  for (const [label, id] of [['twinc', TWINC], ['love', LOVE], ['family', uid]]) {
    const { data: p } = await sb.from('person_profiles').select('full_name').eq('user_id', id).single();
    const { data: m } = await sb.from('organization_members').select('role_code, status').eq('user_id', id);
    const role = m?.[0]?.role_code || 'none';
    console.log(`  ${label}: profile=${p?.full_name || 'NONE'}, role=${role}`);
  }
}
main().catch(e => console.error(e.message));
