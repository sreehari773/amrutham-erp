-- =========================================================================
-- FINAL QA DATABASE PATCH (Dynamic Execution)
-- Bypasses Postgres pre-compilation column validation using EXECUTE strings
-- to guarantee the new columns are recognized at execution time.
-- =========================================================================

DO $$ 
BEGIN

  -- 1. Inject remaining_tiffins
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'remaining_tiffins'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN remaining_tiffins INT NOT NULL DEFAULT 0;
  END IF;

  -- 2. Inject total_tiffins
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'total_tiffins'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN total_tiffins INT NOT NULL DEFAULT 30;
  END IF;

  -- 3. Inject price_per_tiffin
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'subscriptions' AND column_name = 'price_per_tiffin'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN price_per_tiffin NUMERIC(10,2) NOT NULL DEFAULT 60;
  END IF;

  -- 4. Sync up the tiffins using dynamic SQL so it doesn't crash during pre-compilation
  EXECUTE 'UPDATE subscriptions SET remaining_tiffins = total_tiffins';

END $$;

-- 5. Force the API to immediately rebuild its relationship map
NOTIFY pgrst, 'reload schema';
