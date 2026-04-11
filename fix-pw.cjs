const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://epbviowqbflsmoqomysi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwYnZpb3dxYmZsc21vcW9teXNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDgwODA4OCwiZXhwIjoyMDkwMzg0MDg4fQ.vcx3lzigq1fTAhx6uFtugEWDGb9apFbcYUY0yt13G6o'
);

async function main() {
  const FAMILY_ID = '59485099-617d-4631-9ee9-0a02dfb098d5';

  console.log('Resetting family@huhu.ai password to Family2026! ...');
  const { error } = await sb.auth.admin.updateUserById(FAMILY_ID, {
    password: 'Family2026!',
  });
  console.log(error ? 'FAIL: ' + error.message : 'OK');

  // Test
  const { error: e2 } = await sb.auth.signInWithPassword({
    email: 'family@huhu.ai', password: 'Family2026!',
  });
  console.log('Login test:', e2 ? 'FAIL: ' + e2.message : 'OK');
}
main();
