import { supabaseAdmin } from '../server/supabase.js';
async function main() {
  const { data, error } = await supabaseAdmin.from('plans').select('*');
  console.log('Plans:', data);
}
main();