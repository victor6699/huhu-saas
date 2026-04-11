/**
 * Check and fix admin@love.com database records.
 * The user was recreated with new UUID d93ba09e-dffd-4309-81e9-2dff3e8c82b7.
 * We need to ensure person_profiles and organization_members records exist.
 */
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://epbviowqbflsmoqomysi.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o';

const admin = createClient(URL, SERVICE_KEY);
const LOVE_USER_ID = 'd93ba09e-dffd-4309-81e9-2dff3e8c82b7';

async function main() {
  console.log('=== Checking admin@love.com (', LOVE_USER_ID, ') ===\n');

  // 1. Check person_profiles
  console.log('1. Checking person_profiles...');
  const { data: profile, error: profileErr } = await admin
    .from('person_profiles')
    .select('*')
    .eq('user_id', LOVE_USER_ID)
    .single();

  if (profileErr && profileErr.code === 'PGRST116') {
    console.log('   No profile found. Creating...');
    const { data: newProfile, error: createErr } = await admin
      .from('person_profiles')
      .insert({
        user_id: LOVE_USER_ID,
        full_name: 'Love Admin',
        email: 'admin@love.com',
      })
      .select()
      .single();
    if (createErr) {
      console.log('   CREATE FAILED:', createErr.message);
    } else {
      console.log('   CREATED:', newProfile.id);
    }
  } else if (profile) {
    console.log('   Found:', profile.id, '- full_name:', profile.full_name);
  } else {
    console.log('   Error:', profileErr?.message);
  }

  // 2. Check organization_members
  console.log('\n2. Checking organization_members...');
  const { data: membership, error: memErr } = await admin
    .from('organization_members')
    .select('*, organizations(name, org_type)')
    .eq('user_id', LOVE_USER_ID);

  if (!membership || membership.length === 0) {
    console.log('   No membership found.');

    // Check if there's an organization for love.com
    console.log('   Looking for an existing organization...');
    const { data: orgs } = await admin.from('organizations').select('id, name, org_type').limit(10);
    console.log('   Available organizations:', JSON.stringify(orgs, null, 2));

    if (orgs && orgs.length > 0) {
      // Pick the first org that looks right, or create one
      const loveOrg = orgs.find(o => o.name?.toLowerCase().includes('love'));
      if (loveOrg) {
        console.log('   Found matching org:', loveOrg.id, loveOrg.name);
        const { error: insertErr } = await admin.from('organization_members').insert({
          user_id: LOVE_USER_ID,
          organization_id: loveOrg.id,
          role_code: 'org_admin',
          status: 'active',
        });
        console.log('   Membership created:', insertErr ? 'FAIL - ' + insertErr.message : 'OK');
      } else {
        // Create a new org for love.com
        console.log('   No matching org. Creating "Love Care" organization...');
        const { data: newOrg, error: orgErr } = await admin.from('organizations').insert({
          name: 'Love Care',
          org_type: 'individual_family',
          status: 'active',
        }).select().single();
        if (orgErr) {
          console.log('   ORG CREATE FAILED:', orgErr.message);
        } else {
          console.log('   Created org:', newOrg.id);
          const { error: insertErr } = await admin.from('organization_members').insert({
            user_id: LOVE_USER_ID,
            organization_id: newOrg.id,
            role_code: 'org_admin',
            status: 'active',
          });
          console.log('   Membership created:', insertErr ? 'FAIL - ' + insertErr.message : 'OK');
        }
      }
    }
  } else {
    console.log('   Found', membership.length, 'membership(s):');
    membership.forEach(m => {
      console.log('   -', m.id, 'role:', m.role_code, 'status:', m.status, 'org:', m.organizations?.name);
    });
  }

  // 3. Also verify admin@twinc.ai
  console.log('\n=== Verifying admin@twinc.ai (b9394f2b-0109-417f-9eeb-9e795a7e2390) ===');
  const TWINC_ID = 'b9394f2b-0109-417f-9eeb-9e795a7e2390';
  const { data: twincProfile } = await admin.from('person_profiles').select('id, full_name').eq('user_id', TWINC_ID).single();
  const { data: twincMem } = await admin.from('organization_members').select('id, role_code, organization_id, status, organizations(name)').eq('user_id', TWINC_ID);
  console.log('  Profile:', twincProfile ? `${twincProfile.id} (${twincProfile.full_name})` : 'NONE');
  console.log('  Memberships:', JSON.stringify(twincMem, null, 2));

  // 4. Check if the organization exists and has correct data
  if (twincMem && twincMem.length > 0) {
    const orgId = twincMem[0].organization_id;
    console.log('\n  Checking org', orgId, '...');
    const { data: orgData, error: orgErr } = await admin.from('organizations').select('*').eq('id', orgId).single();
    if (orgErr) {
      console.log('  ORG NOT FOUND:', orgErr.message);
    } else {
      console.log('  Org:', orgData.name, '- status:', orgData.status, '- type:', orgData.org_type);
    }
  }
}

main().catch(e => console.error('SCRIPT ERROR:', e.message));
