-- ====================================================================
-- PATCH: Restore missing generate_invoice_number function and sequence
-- ====================================================================

-- 1. Ensure the sequence table exists
CREATE TABLE IF NOT EXISTS invoice_sequence (
  month_key TEXT PRIMARY KEY,  -- format: YYYYMM
  last_seq  INT NOT NULL DEFAULT 0
);

-- Grant privileges so Supabase APIs can access this table
GRANT ALL ON invoice_sequence TO anon, authenticated, service_role;

-- 2. Restore the invoice string generator function
CREATE OR REPLACE FUNCTION generate_invoice_number(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_month_key TEXT;
  v_seq INT;
BEGIN
  -- Format the date into YYYYMM (e.g. 202604)
  v_month_key := TO_CHAR(p_date, 'YYYYMM');

  -- Upsert sequence counter for the month
  INSERT INTO invoice_sequence (month_key, last_seq)
  VALUES (v_month_key, 1)
  ON CONFLICT (month_key) DO UPDATE SET last_seq = invoice_sequence.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Return formatted string: AMR-202604-001
  RETURN 'AMR-' || TO_CHAR(p_date, 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- ====================================================================
-- PATCH: Fix invoices customer_id constraint in RPCs
-- ====================================================================

-- RPC 1: create_customer_with_subscription
CREATE OR REPLACE FUNCTION create_customer_with_subscription(
  p_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_plan_id BIGINT,
  p_payment_mode TEXT DEFAULT 'UPI',
  p_custom_start_date DATE DEFAULT NULL,
  p_custom_invoice_date DATE DEFAULT NULL,
  p_meal_preference TEXT DEFAULT 'veg',
  p_skip_saturday BOOLEAN DEFAULT FALSE,
  p_delivery_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id BIGINT;
  v_sub_id BIGINT;
  v_plan RECORD;
  v_price_per_tiffin NUMERIC;
  v_inv_num TEXT;
  v_start DATE;
  v_inv_date DATE;
BEGIN
  v_start := COALESCE(p_custom_start_date, CURRENT_DATE);
  v_inv_date := COALESCE(p_custom_invoice_date, CURRENT_DATE);

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription Plan % not found', p_plan_id;
  END IF;

  v_price_per_tiffin := (v_plan.total_price - v_plan.delivery_charge) / v_plan.tiffin_count;

  -- Upsert customer
  INSERT INTO customers (name, phone, address)
  VALUES (p_name, p_phone, p_address)
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address
  RETURNING id INTO v_customer_id;

  -- Insert subscription (unique partial index blocks duplicate actives)
  INSERT INTO subscriptions (
    customer_id, plan_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date,
    meal_preference, skip_saturday, delivery_notes
  ) VALUES (
    v_customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, v_start,
    p_meal_preference, p_skip_saturday, p_delivery_notes
  ) RETURNING id INTO v_sub_id;

  -- Generate invoice
  v_inv_num := generate_invoice_number(v_inv_date);

  -- FIXED: Included customer_id in the INSERT
  INSERT INTO invoices (subscription_id, customer_id, invoice_number, amount, payment_mode, invoice_date)
  VALUES (v_sub_id, v_customer_id, v_inv_num, v_plan.total_price, p_payment_mode, v_inv_date);

  -- Log
  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_CREATED',
    'Sub #' || v_sub_id || ' for customer ' || p_name || ' (' || p_phone || '), '
    || v_plan.name,
    'admin');

  RETURN json_build_object(
    'customer_id', v_customer_id,
    'subscription_id', v_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_plan.total_price
  );
END;
$$;

-- RPC 2: renew_subscription
CREATE OR REPLACE FUNCTION renew_subscription(
  p_old_sub_id BIGINT,
  p_plan_id BIGINT,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_payment_mode TEXT DEFAULT 'UPI'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_old RECORD;
  v_plan RECORD;
  v_price_per_tiffin NUMERIC;
  v_new_sub_id BIGINT;
  v_inv_num TEXT;
BEGIN
  SELECT * INTO v_old FROM subscriptions WHERE id = p_old_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_old_sub_id;
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription Plan % not found', p_plan_id;
  END IF;

  v_price_per_tiffin := (v_plan.total_price - v_plan.delivery_charge) / v_plan.tiffin_count;

  INSERT INTO subscriptions (
    customer_id, plan_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date
  ) VALUES (
    v_old.customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, p_start_date
  ) RETURNING id INTO v_new_sub_id;

  v_inv_num := generate_invoice_number(p_start_date);

  -- FIXED: Included customer_id in the INSERT
  INSERT INTO invoices (subscription_id, customer_id, invoice_number, amount, payment_mode, invoice_date)
  VALUES (v_new_sub_id, v_old.customer_id, v_inv_num, v_plan.total_price, p_payment_mode, p_start_date);

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_RENEWED',
    'Renewed from Sub #' || p_old_sub_id || ' → ' || v_plan.name || ' (Sub #' || v_new_sub_id || ')',
    'admin');

  RETURN json_build_object(
    'new_subscription_id', v_new_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_plan.total_price
  );
END;
$$;
