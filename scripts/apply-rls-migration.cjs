/**
 * Execute the RLS migration against the Supabase database via direct pg connection.
 * Uses port 6543 (session mode pooler) which works from local machines.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_URL = 'postgresql://postgres.epbviowqbflsmoqomysi:dXb8mKqhFd0SQVxU@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';

const sqlFile = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'migrations', '20260429_enable_rls_all_tables.sql'),
  'utf8'
);

async function run() {
  const client = new Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('🔐 Executing RLS migration...\n');

    // Execute the entire SQL file as one transaction
    await client.query('BEGIN');
    await client.query(sqlFile);
    await client.query('COMMIT');

    console.log('✅ RLS migration completed successfully!');
    console.log('   All tables now have RLS enabled.');
    console.log('   Authenticated users can only access their own data.');
    console.log('   Anon key is fully locked out (except plans table).');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err.message);
    if (err.message.includes('already exists')) {
      console.log('\n⚠️  Some policies already exist. This is safe to re-run.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
