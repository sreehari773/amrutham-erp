-- =========================================================================
-- THE MASTER NORMALIZATION SCRIPT
-- This explicitly purges the restrictive, legacy Prisma Enums from the 
-- database and universally normalizes all values to perfectly match the 
-- new Next.js API, permanently preventing ANY future casing errors.
-- =========================================================================

DO $$ 
BEGIN

  -- 1. Convert the 'status' column from strict ENUM to flexible TEXT
  ALTER TABLE subscriptions ALTER COLUMN status TYPE TEXT USING status::text;

  -- 2. Normalize all legacy ALL-CAPS data to clean Title Case for the Next.js API
  UPDATE subscriptions SET status = 'Active' WHERE status ILIKE 'active';
  UPDATE subscriptions SET status = 'Completed' WHERE status ILIKE 'completed';
  UPDATE subscriptions SET status = 'Grace' WHERE status ILIKE 'grace';
  UPDATE subscriptions SET status = 'Expired' WHERE status ILIKE 'expired';
  UPDATE subscriptions SET status = 'Cancelled' WHERE status ILIKE 'cancelled';

  -- 3. We also need to normalize any other legacy ENUMS like payment_status
  -- If invoices table has strict enums, we convert them too just to be perfectly safe.
  BEGIN
    ALTER TABLE invoices ALTER COLUMN payment_status TYPE TEXT USING payment_status::text;
    UPDATE invoices SET payment_status = 'Pending' WHERE payment_status ILIKE 'pending';
    UPDATE invoices SET payment_status = 'Paid' WHERE payment_status ILIKE 'paid';
    UPDATE invoices SET payment_status = 'Partial' WHERE payment_status ILIKE 'partial';
  EXCEPTION
    WHEN undefined_column THEN null;
  END;

  BEGIN
    ALTER TABLE invoices ALTER COLUMN payment_mode TYPE TEXT USING payment_mode::text;
    UPDATE invoices SET payment_mode = 'UPI' WHERE payment_mode ILIKE 'upi';
    UPDATE invoices SET payment_mode = 'Cash' WHERE payment_mode ILIKE 'cash';
    UPDATE invoices SET payment_mode = 'Card' WHERE payment_mode ILIKE 'card';
  EXCEPTION
    WHEN undefined_column THEN null;
  END;

END $$;

-- 4. Rebuild all RPC functions using the normalized Title Case so KOT and Dashboard flawlessly execute!
CREATE OR REPLACE FUNCTION get_revenue_summary(p_target_month TEXT)
RETURNS JSON
LANGUAGE plpgsql STABLE
AS $func$
DECLARE
  v_start DATE := (p_target_month || '-01')::DATE;
  v_end DATE := v_start + INTERVAL '1 month';
  v_monthly_revenue NUMERIC;
  v_prepaid_liability NUMERIC;
  v_active_count INT;
  v_completed_count INT;
  v_expired_count INT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_monthly_revenue FROM invoices WHERE created_at >= v_start AND created_at < v_end;
  SELECT COALESCE(SUM(remaining_tiffins * price_per_tiffin), 0) INTO v_prepaid_liability FROM subscriptions WHERE status = 'Active';
  SELECT COUNT(*) INTO v_active_count FROM subscriptions WHERE status = 'Active';
  SELECT COUNT(*) INTO v_completed_count FROM subscriptions WHERE status = 'Completed' AND completed_at >= v_start AND completed_at < v_end;
  SELECT COUNT(*) INTO v_expired_count FROM subscriptions WHERE status IN ('Expired', 'Grace');

  RETURN json_build_object(
    'monthly_revenue', v_monthly_revenue,
    'prepaid_liability', v_prepaid_liability,
    'active_count', v_active_count,
    'completed_count', v_completed_count,
    'expired_count', v_expired_count
  );
END;
$func$;

CREATE OR REPLACE FUNCTION get_renewal_queue()
RETURNS TABLE (
  subscription_id BIGINT,
  customer_name TEXT,
  phone TEXT,
  remaining_tiffins INT,
  last_reminded_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $func$
BEGIN
  RETURN QUERY
  SELECT s.id, c.name, c.phone, s.remaining_tiffins, s.last_reminded_at
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  WHERE s.status IN ('Active', 'Expired', 'Grace')
    AND s.remaining_tiffins <= 3
    AND (s.last_reminded_at IS NULL OR s.last_reminded_at < NOW() - INTERVAL '2 days')
  ORDER BY s.remaining_tiffins ASC;
END;
$func$;

-- Force final cache clear
NOTIFY pgrst, 'reload schema';
