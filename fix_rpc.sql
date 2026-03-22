-- Fix for create_customer_with_subscription RPC signature and schema cache

-- 1. Drop existing functions with any signature just to be safe
DROP FUNCTION IF EXISTS public.create_customer_with_subscription;

-- 2. Recreate with the exact expected parameters
CREATE OR REPLACE FUNCTION public.create_customer_with_subscription(
  p_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_plan_id BIGINT,
  p_payment_mode payment_mode_enum DEFAULT 'UPI',
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

  -- Insert subscription
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

  INSERT INTO invoices (subscription_id, invoice_number, amount, payment_mode, invoice_date)
  VALUES (v_sub_id, v_inv_num, v_plan.total_price, p_payment_mode, v_inv_date);

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

-- ==========================================
-- Add missing cancel_subscription RPC
-- ==========================================
CREATE OR REPLACE FUNCTION public.cancel_subscription(
  p_sub_id BIGINT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_refund NUMERIC(12,2);
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;

  IF v_sub.status IN ('Cancelled', 'Completed', 'Expired') THEN
    RAISE EXCEPTION 'Subscription is already %', v_sub.status;
  END IF;

  v_refund := v_sub.remaining_tiffins * v_sub.price_per_tiffin;

  UPDATE subscriptions
  SET status = 'Cancelled',
      cancelled_at = NOW(),
      refund_liability = v_refund,
      remaining_tiffins = 0
  WHERE id = p_sub_id;

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_CANCELLED', 'Cancelled Subscription #' || p_sub_id || ' with refund liability: ' || v_refund, 'admin');

  RETURN json_build_object(
    'subscription_id', p_sub_id,
    'status', 'Cancelled',
    'refund_amount', v_refund
  );
END;
$$;

-- 3. Force Supabase/PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
