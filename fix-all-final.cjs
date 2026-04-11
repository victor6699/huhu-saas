const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://epbviowqbflsmoqomysi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o'
);

const FAMILY_ID = '59485099-617d-4631-9ee9-0a02dfb098d5';
const LOVE_ID   = 'd93ba09e-dffd-4309-81e9-2dff3e8c82b7';
const TWINC_ID  = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';
const RENAI_ORG = 'a3ad449c-6da8-4d32-8e1a-61cc13f80b17'; // 仁愛長照機構

async function main() {
  // ═══════════════════════════════════════════════
  // 1. Fix family@huhu.ai password
  // ═══════════════════════════════════════════════
  console.log('=== 1. Fix family@huhu.ai password ===');
  const { error: pwErr } = await sb.auth.admin.updateUserById(FAMILY_ID, {
    password: 'family123',
  });
  console.log('  Password reset:', pwErr ? 'FAIL: ' + pwErr.message : 'OK');

  // Test login
  const { error: loginErr } = await sb.auth.signInWithPassword({
    email: 'family@huhu.ai', password: 'family123',
  });
  console.log('  Login test:', loginErr ? 'FAIL: ' + loginErr.message : 'OK');

  // ═══════════════════════════════════════════════
  // 2. Add family@huhu.ai to 仁愛長照機構 as client
  // ═══════════════════════════════════════════════
  console.log('\n=== 2. Add family@huhu.ai to 仁愛 ===');
  const { data: existingMem } = await sb
    .from('organization_members')
    .select('id, role_code')
    .eq('user_id', FAMILY_ID)
    .eq('organization_id', RENAI_ORG)
    .single();

  if (existingMem) {
    console.log('  Already a member:', existingMem.role_code);
  } else {
    const { error: memErr } = await sb.from('organization_members').insert({
      user_id: FAMILY_ID,
      organization_id: RENAI_ORG,
      role_code: 'family',
      status: 'active',
    });
    console.log('  Membership created:', memErr ? 'FAIL: ' + memErr.message : 'OK (family @ 仁愛)');
  }

  // ═══════════════════════════════════════════════
  // 3. Fix admin@love.com duplicate profiles
  // ═══════════════════════════════════════════════
  console.log('\n=== 3. Fix admin@love.com profiles ===');
  const { data: loveProfiles } = await sb
    .from('person_profiles')
    .select('id, full_name, user_id, email')
    .eq('user_id', LOVE_ID);
  console.log('  Found', loveProfiles?.length || 0, 'profiles:');
  loveProfiles?.forEach(p => console.log('    -', p.id, p.full_name, p.email));

  if (!loveProfiles || loveProfiles.length === 0) {
    console.log('  Creating profile...');
    const { data: newP, error: pErr } = await sb.from('person_profiles').insert({
      user_id: LOVE_ID,
      full_name: '仁愛管理員',
      email: 'admin@love.com',
    }).select().single();
    console.log('  ', pErr ? 'FAIL: ' + pErr.message : 'Created: ' + newP.id);
  } else if (loveProfiles.length > 1) {
    // Keep the first, delete the rest
    console.log('  Keeping:', loveProfiles[0].id);
    for (let i = 1; i < loveProfiles.length; i++) {
      const { error: delErr } = await sb.from('person_profiles').delete().eq('id', loveProfiles[i].id);
      console.log('  Deleted duplicate', loveProfiles[i].id, ':', delErr ? 'FAIL' : 'OK');
    }
  } else {
    console.log('  Single profile OK');
  }

  // ═══════════════════════════════════════════════
  // 4. Final verification - all 3 users
  // ═══════════════════════════════════════════════
  console.log('\n=== Final Verification ===\n');
  for (const [label, email, uid] of [
    ['admin@twinc.ai', 'admin@twinc.ai', TWINC_ID],
    ['admin@love.com', 'admin@love.com', LOVE_ID],
    ['family@huhu.ai', 'family@huhu.ai', FAMILY_ID],
  ]) {
    const { data: p } = await sb.from('person_profiles').select('full_name').eq('user_id', uid).maybeSingle();
    const { data: m } = await sb.from('organization_members').select('role_code, status, organization_id').eq('user_id', uid);
    const { data: u } = await sb.auth.admin.getUserById(uid);
    const metaRole = u?.user?.user_metadata?.role || '-';

    console.log(`${label}:`);
    console.log(`  profile: ${p?.full_name || 'NONE'}`);
    console.log(`  metadata.role: ${metaRole}`);
    if (m && m.length > 0) {
      m.forEach(mem => console.log(`  membership: ${mem.role_code} [${mem.status}] org=${mem.organization_id}`));
    } else {
      console.log('  membership: NONE');
    }
    console.log('');
  }
}

main().catch(e => console.error('SCRIPT ERROR:', e.message));
