import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("⚠️  SUPABASE_URL is not set.");
}

// Service role client — bypasses RLS, for server-side operations only
// Use this for admin operations, data migrations, and background tasks
export const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceKey || supabaseAnonKey || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Anon client — respects RLS, for user-facing operations
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || '',
);
