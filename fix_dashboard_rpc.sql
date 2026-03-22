-- Restoration Script for missing Dashboard RPCs
-- This script safely re-adds the revenue summary and renewal queue analytics functions.

-- 1. get_revenue_summary
CREATE OR REPLACE FUNCTION get_revenue_summary(p_target_month TEXT)
RETURNS JSON
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_start DATE;
  v_end DATE;
  v_monthly_revenue NUMERIC;
  v_prepaid_liability NUMERIC;
  v_active_count INT;
  v_completed_count INT;
  v_expired_count INT;
BEGIN
  v_start := (p_target_month || '-01')::DATE;
  v_end := (v_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_monthly_revenue
  FROM invoices
  WHERE created_at >= v_start AND created_at < v_end;

  SELECT COALESCE(SUM(remaining_tiffins * price_per_tiffin), 0) INTO v_prepaid_liability
  FROM subscriptions WHERE status = 'Active';

  SELECT COUNT(*) INTO v_active_count
  FROM subscriptions WHERE status = 'Active';

  SELECT COUNT(*) INTO v_completed_count
  FROM subscriptions
  WHERE status = 'Completed'
    AND completed_at >= v_start AND completed_at < v_end;

  SELECT COUNT(*) INTO v_expired_count
  FROM subscriptions WHERE status IN ('Expired', 'Grace');

  RETURN json_build_object(
    'monthly_revenue', v_monthly_revenue,
    'prepaid_liability', v_prepaid_liability,
    'active_count', v_active_count,
    'completed_count', v_completed_count,
    'expired_count', v_expired_count
  );
END;
$$;

-- 2. get_renewal_queue
CREATE OR REPLACE FUNCTION get_renewal_queue()
RETURNS TABLE (
  subscription_id BIGINT,
  customer_name TEXT,
  phone TEXT,
  remaining_tiffins INT,
  last_reminded_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
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
$$;

-- Force sync the PostgREST cache so the UI immediately detects these functions
NOTIFY pgrst, 'reload schema';
