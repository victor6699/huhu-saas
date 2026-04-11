/**
 * Fix role assignments:
 * 1. admin@twinc.ai → superadmin (platform owner, no care org)
 * 2. admin@love.com → org_admin of 仁愛長照機構 only
 */
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://epbviowqbflsmoqomysi.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o';

const sb = createClient(URL, SERVICE_KEY);

const TWINC_ID = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';
const LOVE_ID  = 'd93ba09e-dffd-4309-81e9-2dff3e8c82b7';
const RENAI_ORG = 'a3ad449c-6da8-4d32-8e1a-61cc13f80b17';  // 仁愛長照機構
const LOVE_CARE_ORG = 'fd53c990-185e-429f-917b-75d6abc8f525'; // Love Care (to remove)

async function main() {
  // ═══════════════════════════════════════════════════════
  // 1. admin@twinc.ai → superadmin, platform-level
  // ═══════════════════════════════════════════════════════
  console.log('=== 1. Fixing admin@twinc.ai ===\n');

  // Set user_metadata.role = superadmin (fallback for routing)
  console.log('  Setting user_metadata.role = superadmin...');
  const { error: metaErr } = await sb.auth.admin.updateUserById(TWINC_ID, {
    user_metadata: { role: 'superadmin', full_name: 'Twinc Admin' },
  });
  console.log('  ', metaErr ? 'FAIL: ' + metaErr.message : 'OK');

  // Remove from 仁愛長照機構
  console.log('  Removing from 仁愛長照機構...');
  const { error: delErr } = await sb
    .from('organization_members')
    .delete()
    .eq('user_id', TWINC_ID)
    .eq('organization_id', RENAI_ORG);
  console.log('  ', delErr ? 'FAIL: ' + delErr.message : 'OK');

  // Create a platform-level org for Twinc (for StaffDashboard to work properly)
  console.log('  Creating "Twinc AI" platform org...');
  const { data: twincOrg, error: orgErr } = await sb
    .from('organizations')
    .insert({ name: 'Twinc AI', org_type: 'care_institution', status: 'active' })
    .select()
    .single();
  if (orgErr) {
    console.log('  FAIL:', orgErr.message);
  } else {
    console.log('  Created:', twincOrg.id);
    // Add admin@twinc.ai as superadmin of Twinc AI
    const { error: memErr } = await sb.from('organization_members').insert({
      user_id: TWINC_ID,
      organization_id: twincOrg.id,
      role_code: 'superadmin',
      status: 'active',
    });
    console.log('  Membership:', memErr ? 'FAIL: ' + memErr.message : 'OK (superadmin @ Twinc AI)');
  }

  // ═══════════════════════════════════════════════════════
  // 2. admin@love.com → org_admin of 仁愛 only
  // ═══════════════════════════════════════════════════════
  console.log('\n=== 2. Fixing admin@love.com ===\n');

  // Remove from "Love Care" org
  console.log('  Removing from "Love Care" org...');
  const { error: delLove } = await sb
    .from('organization_members')
    .delete()
    .eq('user_id', LOVE_ID)
    .eq('organization_id', LOVE_CARE_ORG);
  console.log('  ', delLove ? 'FAIL: ' + delLove.message : 'OK');

  // Verify 仁愛 membership exists
  const { data: renaiMem } = await sb
    .from('organization_members')
    .select('id, role_code, status')
    .eq('user_id', LOVE_ID)
    .eq('organization_id', RENAI_ORG)
    .single();

  if (renaiMem) {
    console.log('  仁愛 membership OK:', renaiMem.id, 'role:', renaiMem.role_code);
  } else {
    console.log('  仁愛 membership missing! Creating...');
    const { error: addErr } = await sb.from('organization_members').insert({
      user_id: LOVE_ID,
      organization_id: RENAI_ORG,
      role_code: 'org_admin',
      status: 'active',
    });
    console.log('  ', addErr ? 'FAIL: ' + addErr.message : 'OK (org_admin @ 仁愛)');
  }

  // Set user_metadata for love too
  console.log('  Setting user_metadata...');
  const { error: loveMeta } = await sb.auth.admin.updateUserById(LOVE_ID, {
    user_metadata: { role: 'org_admin', full_name: 'Love Admin' },
  });
  console.log('  ', loveMeta ? 'FAIL: ' + loveMeta.message : 'OK');

  // Delete the orphan "Love Care" org if empty
  console.log('\n  Cleaning up "Love Care" org...');
  const { data: remainingMem } = await sb
    .from('organization_members')
    .select('id')
    .eq('organization_id', LOVE_CARE_ORG);
  if (!remainingMem || remainingMem.length === 0) {
    const { error: delOrgErr } = await sb
      .from('organizations')
      .delete()
      .eq('id', LOVE_CARE_ORG);
    console.log('  Deleted empty "Love Care" org:', delOrgErr ? 'FAIL: ' + delOrgErr.message : 'OK');
  } else {
    console.log('  "Love Care" org still has members, keeping it.');
  }

  // ═══════════════════════════════════════════════════════
  // 3. Final state
  // ═══════════════════════════════════════════════════════
  console.log('\n=== Final State ===\n');

  const { data: allOrgs } = await sb.from('organizations').select('id, name, org_type, status');
  console.log('Organizations:');
  allOrgs?.forEach(o => console.log(`  - ${o.name} (${o.org_type}) [${o.status}]`));

  const { data: allMem } = await sb
    .from('organization_members')
    .select('user_id, role_code, status, organizations(name)')
    .in('user_id', [TWINC_ID, LOVE_ID]);
  console.log('\nMemberships:');
  allMem?.forEach(m => {
    const who = m.user_id === TWINC_ID ? 'twinc' : 'love';
    console.log(`  - ${who}: ${m.role_code} @ ${m.organizations?.name} [${m.status}]`);
  });
}

main().catch(e => console.error('SCRIPT ERROR:', e.message));
