const fs = require('fs');
try {
  let sql = fs.readFileSync('schema.sql', 'utf8');

  // Prepend Drop Cascades so it builds cleanly
  const drops = `
-- =======================================================
-- MASTER DEPLOYMENT SCRIPT (AUTO-GENERATED FIX)
-- Automatically wipes corrupted schemas and deploys the
-- pristine, fully-featured structure with permissions.
-- =======================================================
DROP VIEW IF EXISTS public.subscriptions_with_latest_invoice CASCADE;
DROP TABLE IF EXISTS deliveries CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS weekly_menus CASCADE;
DROP TABLE IF EXISTS invoice_sequence CASCADE;

`;
  sql = drops + sql;

  // Fix the duplicate CREATE TABLE subscriptions ( syntax error that was in schema.sql!
  sql = sql.replace(/CREATE TABLE subscriptions \(\r?\nCREATE TABLE subscriptions \(/g, "CREATE TABLE subscriptions (");


  // 1. Inject missing columns into the subscriptions table.
  sql = sql.replace(
    /total_tiffins\s+INT NOT NULL CHECK \(total_tiffins > 0\),/,
    `total_tiffins     INT NOT NULL CHECK (total_tiffins > 0) DEFAULT 30,
  remaining_tiffins INT NOT NULL DEFAULT 0,
  price_per_tiffin  NUMERIC(10,2) NOT NULL DEFAULT 60,
  meal_preference   TEXT NOT NULL DEFAULT 'Mixed',
  exclude_saturdays BOOLEAN NOT NULL DEFAULT false,`
  );

  // 2. Change restrictive Enum to TEXT
  sql = sql.replace(
    /status\s+subscription_status NOT NULL DEFAULT 'Active',/,
    `status            TEXT NOT NULL DEFAULT 'Active',`
  );

  // 3. Fix the View missing created_at column
  sql = sql.replace(
    /s\.pause_end,\n\s*i\.invoice_number,/g,
    `s.pause_end,\n    s.created_at,\n    i.invoice_number,`
  );

  // 4. Overhaul all strict RPC cases to be case-insensitive to ensure total compatibility
  sql = sql.replace(/status = 'Active'/g, `status::text ILIKE 'active'`);
  sql = sql.replace(/status = 'Completed'/g, `status::text ILIKE 'completed'`);
  sql = sql.replace(/status = 'Grace'/g, `status::text ILIKE 'grace'`);
  sql = sql.replace(/status = 'Cancelled'/g, `status::text ILIKE 'cancelled'`);
  sql = sql.replace(/status = CASE WHEN s\.remaining_tiffins - 1 = 0 THEN 'Expired'::subscription_status ELSE s\.status END/g, `status = CASE WHEN s.remaining_tiffins - 1 = 0 THEN 'Expired' ELSE s.status END`);
  sql = sql.replace(/status = CASE WHEN remaining_tiffins - 1 = 0 THEN 'Expired'::subscription_status ELSE status END/g, `status = CASE WHEN remaining_tiffins - 1 = 0 THEN 'Expired' ELSE status END`);

  // Ensure cache is forcefully reloaded mapping at the end
  sql += "\n\nNOTIFY pgrst, 'reload schema';\n";

  fs.writeFileSync('MASTER_DEPLOYMENT.sql', sql);
  console.log('SUCCESS: Written to MASTER_DEPLOYMENT.sql');
} catch (err) {
  console.error(err);
}
