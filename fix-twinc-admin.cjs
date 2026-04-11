/**
 * Diagnose and fix admin@twinc.ai membership issue.
 * Memberships query returned null — need to figure out why.
 */
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://epbviowqbflsmoqomysi.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o';

const admin = createClient(URL, SERVICE_KEY);
const TWINC_ID = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';

async function main() {
  console.log('=== Diagnosing admin@twinc.ai ===\n');

  // 1. Check organization_members WITHOUT join (to rule out join error)
  console.log('1. Querying organization_members (no join)...');
  const { data: rawMem, error: rawErr } = await admin
    .from('organization_members')
    .select('*')
    .eq('user_id', TWINC_ID);
  console.log('   data:', JSON.stringify(rawMem, null, 2));
  console.log('   error:', rawErr ? JSON.stringify(rawErr) : 'none');

  // 2. Check ALL organization_members (see what's in the table)
  console.log('\n2. All organization_members (first 20)...');
  const { data: allMem, error: allErr } = await admin
    .from('organization_members')
    .select('id, user_id, organization_id, role_code, status')
    .limit(20);
  console.log('   count:', allMem?.length || 0);
  if (allMem) allMem.forEach(m => {
    console.log(`   - ${m.id} | user=${m.user_id} | org=${m.organization_id} | role=${m.role_code} | status=${m.status}`);
  });
  if (allErr) console.log('   error:', allErr.message);

  // 3. List all organizations
  console.log('\n3. All organizations...');
  const { data: orgs } = await admin.from('organizations').select('id, name, org_type, status');
  if (orgs) orgs.forEach(o => console.log(`   - ${o.id} | ${o.name} | ${o.org_type} | ${o.status}`));

  // 4. If no membership exists for admin@twinc.ai, create one
  if (!rawMem || rawMem.length === 0) {
    console.log('\n4. No membership found for admin@twinc.ai. Creating...');
    // Use 仁愛長照機構 as the org, or create a new HuHu staff org
    let staffOrgId;
    const existingOrg = orgs?.find(o => o.name?.includes('仁愛'));
    if (existingOrg) {
      staffOrgId = existingOrg.id;
      console.log('   Using existing org:', existingOrg.name, existingOrg.id);
    } else {
      // Create HuHu Staff org
      const { data: newOrg, error: orgErr } = await admin.from('organizations').insert({
        name: 'HuHu AI',
        org_type: 'care_institution',
        status: 'active',
      }).select().single();
      if (orgErr) {
        console.log('   ORG CREATE FAILED:', orgErr.message);
        return;
      }
      staffOrgId = newOrg.id;
      console.log('   Created new org:', newOrg.id);
    }

    const { error: insertErr } = await admin.from('organization_members').insert({
      user_id: TWINC_ID,
      organization_id: staffOrgId,
      role_code: 'admin',
      status: 'active',
    });
    console.log('   Membership created:', insertErr ? 'FAIL - ' + insertErr.message : 'OK');
  } else {
    console.log('\n4. Membership exists, no fix needed.');
  }

  // 5. Verify final state
  console.log('\n5. Final verification...');
  const { data: finalMem } = await admin
    .from('organization_members')
    .select('id, user_id, organization_id, role_code, status')
    .eq('user_id', TWINC_ID);
  console.log('   admin@twinc.ai memberships:', JSON.stringify(finalMem, null, 2));
}

main().catch(e => console.error('SCRIPT ERROR:', e.message));
