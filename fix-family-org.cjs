const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://epbviowqbflsmoqomysi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o'
);

const FAMILY_ID = '59485099-617d-4631-9ee9-0a02dfb098d5';
const RENAI_ORG = 'a3ad449c-6da8-4d32-8e1a-61cc13f80b17';

async function main() {
  // 1. Remove family@huhu.ai from 仁愛長照機構 (she's B2C, not B2B)
  console.log('=== 1. Remove family from 仁愛 ===');
  const { error: delErr } = await sb
    .from('organization_members')
    .delete()
    .eq('user_id', FAMILY_ID)
    .eq('organization_id', RENAI_ORG);
  console.log('  ', delErr ? 'FAIL: ' + delErr.message : 'OK');

  // 2. Create "陳小美家庭" individual_family org (B2C personal subscription)
  console.log('\n=== 2. Create B2C family org ===');
  const { data: famOrg, error: orgErr } = await sb
    .from('organizations')
    .insert({
      name: '陳小美家庭',
      org_type: 'individual_family',
      status: 'active',
    })
    .select()
    .single();

  if (orgErr) {
    console.log('  FAIL:', orgErr.message);
    return;
  }
  console.log('  Created:', famOrg.id, famOrg.name);

  // 3. Add family@huhu.ai as org_admin of her own family org (戶長)
  console.log('\n=== 3. Set as 戶長 ===');
  const { error: memErr } = await sb.from('organization_members').insert({
    user_id: FAMILY_ID,
    organization_id: famOrg.id,
    role_code: 'org_admin',
    status: 'active',
  });
  console.log('  ', memErr ? 'FAIL: ' + memErr.message : 'OK (org_admin @ 陳小美家庭)');

  // 4. Update user_metadata
  console.log('\n=== 4. Update metadata ===');
  const { error: metaErr } = await sb.auth.admin.updateUserById(FAMILY_ID, {
    user_metadata: { full_name: '陳小美', nickname: '小美', role: 'org_admin' },
  });
  console.log('  ', metaErr ? 'FAIL: ' + metaErr.message : 'OK');

  // 5. Final state
  console.log('\n=== Final State ===');
  const { data: p } = await sb.from('person_profiles').select('full_name').eq('user_id', FAMILY_ID).maybeSingle();
  const { data: m } = await sb.from('organization_members').select('role_code, status, organization_id').eq('user_id', FAMILY_ID);
  console.log('  profile:', p?.full_name);
  m?.forEach(mem => console.log('  membership:', mem.role_code, '[' + mem.status + '] org=' + mem.organization_id));

  console.log('\n  All organizations:');
  const { data: orgs } = await sb.from('organizations').select('id, name, org_type, status');
  orgs?.forEach(o => console.log('    -', o.name, '(' + o.org_type + ') [' + o.status + ']'));
}

main().catch(e => console.error('SCRIPT ERROR:', e.message));
