-- ============================================================
-- AMRUTHAM ERP — Complete PostgreSQL Schema
-- ============================================================

-- 1. ENUMS
CREATE TYPE subscription_status AS ENUM ('Active', 'Completed', 'Cancelled');
CREATE TYPE payment_mode_enum AS ENUM ('UPI', 'Cash', 'Card', 'Bank Transfer');

-- 2. TABLES

CREATE TABLE customers (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  address    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id                BIGSERIAL PRIMARY KEY,
  customer_id       BIGINT NOT NULL REFERENCES customers(id),
  total_tiffins     INT NOT NULL CHECK (total_tiffins > 0),
  remaining_tiffins INT NOT NULL CHECK (remaining_tiffins >= 0),
  price_per_tiffin  NUMERIC(10,2) NOT NULL CHECK (price_per_tiffin >= 0),
  total_amount      NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  status            subscription_status NOT NULL DEFAULT 'Active',
  start_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  pause_start       DATE,
  pause_end         DATE,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  refund_liability  NUMERIC(12,2),
  last_reminded_at  TIMESTAMPTZ,
  branch_id         TEXT NOT NULL DEFAULT 'Western Line',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active subscriptions per customer
CREATE UNIQUE INDEX unique_active_subscription_per_customer
  ON subscriptions(customer_id) WHERE status = 'Active';

CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_completed_at ON subscriptions(completed_at);

CREATE TABLE deliveries (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  delivery_date   DATE NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deliveries
  ADD CONSTRAINT unique_delivery_per_day UNIQUE (subscription_id, delivery_date);

CREATE INDEX idx_deliveries_sub_date ON deliveries(subscription_id, delivery_date);

-- Invoice number sequence table
CREATE TABLE invoice_sequence (
  month_key TEXT PRIMARY KEY,  -- format: YYYYMM
  last_seq  INT NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  invoice_number  TEXT NOT NULL UNIQUE,
  amount          NUMERIC(12,2) NOT NULL,
  payment_mode    payment_mode_enum NOT NULL DEFAULT 'UPI',
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_created_at ON invoices(created_at);

CREATE TABLE system_logs (
  id          BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  description TEXT,
  actor       TEXT NOT NULL DEFAULT 'system',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INVOICE NUMBER GENERATOR FUNCTION
CREATE OR REPLACE FUNCTION generate_invoice_number(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_month_key TEXT;
  v_seq INT;
BEGIN
  v_month_key := TO_CHAR(p_date, 'YYYYMM');

  INSERT INTO invoice_sequence (month_key, last_seq)
  VALUES (v_month_key, 1)
  ON CONFLICT (month_key) DO UPDATE SET last_seq = invoice_sequence.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'AMR-' || TO_CHAR(p_date, 'YYYYMM') || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- 4. VIEW: subscriptions_with_latest_invoice
CREATE OR REPLACE VIEW subscriptions_with_latest_invoice AS
SELECT
  s.id AS subscription_id,
  s.customer_id,
  c.name,
  c.phone,
  c.address,
  s.total_tiffins,
  s.remaining_tiffins,
  s.price_per_tiffin,
  s.total_amount,
  s.status,
  s.start_date,
  s.pause_start,
  s.pause_end,
  s.completed_at,
  s.cancelled_at,
  s.refund_liability,
  s.last_reminded_at,
  s.branch_id,
  s.created_at,
  li.invoice_number AS latest_invoice_number,
  li.amount AS latest_invoice_amount,
  li.invoice_date AS latest_invoice_date
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
LEFT JOIN LATERAL (
  SELECT inv.invoice_number, inv.amount, inv.invoice_date
  FROM invoices inv
  WHERE inv.subscription_id = s.id
  ORDER BY inv.created_at DESC
  LIMIT 1
) li ON TRUE;

-- ============================================================
-- 5. RPCs
-- ============================================================

-- RPC 1: create_customer_with_subscription
CREATE OR REPLACE FUNCTION create_customer_with_subscription(
  p_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_total_tiffins INT,
  p_price_per_tiffin NUMERIC,
  p_payment_mode payment_mode_enum DEFAULT 'UPI',
  p_custom_start_date DATE DEFAULT NULL,
  p_custom_invoice_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id BIGINT;
  v_sub_id BIGINT;
  v_total NUMERIC;
  v_inv_num TEXT;
  v_start DATE;
  v_inv_date DATE;
BEGIN
  v_start := COALESCE(p_custom_start_date, CURRENT_DATE);
  v_inv_date := COALESCE(p_custom_invoice_date, CURRENT_DATE);
  v_total := p_total_tiffins * p_price_per_tiffin;

  -- Upsert customer
  INSERT INTO customers (name, phone, address)
  VALUES (p_name, p_phone, p_address)
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address
  RETURNING id INTO v_customer_id;

  -- Insert subscription (unique partial index blocks duplicate actives)
  INSERT INTO subscriptions (
    customer_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date
  ) VALUES (
    v_customer_id, p_total_tiffins, p_total_tiffins,
    p_price_per_tiffin, v_total, v_start
  ) RETURNING id INTO v_sub_id;

  -- Generate invoice
  v_inv_num := generate_invoice_number(v_inv_date);

  INSERT INTO invoices (subscription_id, invoice_number, amount, payment_mode, invoice_date)
  VALUES (v_sub_id, v_inv_num, v_total, p_payment_mode, v_inv_date);

  -- Log
  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_CREATED',
    'Sub #' || v_sub_id || ' for customer ' || p_name || ' (' || p_phone || '), '
    || p_total_tiffins || ' tiffins @ ₹' || p_price_per_tiffin,
    'admin');

  RETURN json_build_object(
    'customer_id', v_customer_id,
    'subscription_id', v_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_total
  );
END;
$$;

-- RPC 2: renew_subscription
CREATE OR REPLACE FUNCTION renew_subscription(
  p_old_sub_id BIGINT,
  p_new_total_tiffins INT,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_payment_mode payment_mode_enum DEFAULT 'UPI'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_old RECORD;
  v_new_sub_id BIGINT;
  v_total NUMERIC;
  v_inv_num TEXT;
BEGIN
  SELECT * INTO v_old FROM subscriptions WHERE id = p_old_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_old_sub_id;
  END IF;

  v_total := p_new_total_tiffins * v_old.price_per_tiffin;

  INSERT INTO subscriptions (
    customer_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date
  ) VALUES (
    v_old.customer_id, p_new_total_tiffins, p_new_total_tiffins,
    v_old.price_per_tiffin, v_total, p_start_date
  ) RETURNING id INTO v_new_sub_id;

  v_inv_num := generate_invoice_number(p_start_date);

  INSERT INTO invoices (subscription_id, invoice_number, amount, payment_mode, invoice_date)
  VALUES (v_new_sub_id, v_inv_num, v_total, p_payment_mode, p_start_date);

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_RENEWED',
    'Renewed from Sub #' || p_old_sub_id || ' → Sub #' || v_new_sub_id
    || ', ' || p_new_total_tiffins || ' tiffins',
    'admin');

  RETURN json_build_object(
    'new_subscription_id', v_new_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_total
  );
END;
$$;

-- RPC 3: get_kot_for_date
CREATE OR REPLACE FUNCTION get_kot_for_date(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  subscription_id BIGINT,
  name TEXT,
  address TEXT,
  phone TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, c.name, c.address, c.phone
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  WHERE s.status = 'Active'
    AND s.remaining_tiffins > 0
    AND p_target_date >= s.start_date
    AND NOT (
      s.pause_start IS NOT NULL
      AND p_target_date >= s.pause_start
      AND p_target_date <= COALESCE(s.pause_end, p_target_date)
    )
  ORDER BY c.name;
END;
$$;

-- RPC 4: mark_today_delivered (bulk deduction)
CREATE OR REPLACE FUNCTION mark_today_delivered(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH eligible AS (
    SELECT s.id
    FROM subscriptions s
    WHERE s.status = 'Active'
      AND s.remaining_tiffins > 0
      AND p_target_date >= s.start_date
      AND NOT (
        s.pause_start IS NOT NULL
        AND p_target_date >= s.pause_start
        AND p_target_date <= COALESCE(s.pause_end, p_target_date)
      )
  ),
  inserted AS (
    INSERT INTO deliveries (subscription_id, delivery_date, reason)
    SELECT e.id, p_target_date, 'Bulk daily deduction'
    FROM eligible e
    ON CONFLICT (subscription_id, delivery_date) DO NOTHING
    RETURNING subscription_id
  ),
  updated AS (
    UPDATE subscriptions s
    SET remaining_tiffins = s.remaining_tiffins - 1,
        status = CASE WHEN s.remaining_tiffins - 1 = 0 THEN 'Completed'::subscription_status ELSE s.status END,
        completed_at = CASE WHEN s.remaining_tiffins - 1 = 0 THEN NOW() ELSE s.completed_at END
    FROM inserted i
    WHERE s.id = i.subscription_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('BULK_DEDUCTION', v_count || ' deliveries marked for ' || p_target_date, 'admin');

  RETURN v_count;
END;
$$;

-- RPC 5: manual_adjust_delivery
CREATE OR REPLACE FUNCTION manual_adjust_delivery(
  p_sub_id BIGINT,
  p_target_date DATE,
  p_action TEXT,  -- 'DEDUCT' or 'RESTORE'
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_del_id BIGINT;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;

  IF p_action = 'DEDUCT' THEN
    -- Validate
    IF v_sub.remaining_tiffins <= 0 THEN
      RAISE EXCEPTION 'No remaining tiffins on subscription %', p_sub_id;
    END IF;
    IF p_target_date < v_sub.start_date THEN
      RAISE EXCEPTION 'Target date % is before subscription start date %', p_target_date, v_sub.start_date;
    END IF;
    IF v_sub.pause_start IS NOT NULL
       AND p_target_date >= v_sub.pause_start
       AND p_target_date <= COALESCE(v_sub.pause_end, p_target_date) THEN
      RAISE EXCEPTION 'Subscription is paused on %', p_target_date;
    END IF;

    -- Insert with conflict guard
    INSERT INTO deliveries (subscription_id, delivery_date, reason)
    VALUES (p_sub_id, p_target_date, COALESCE(p_reason, 'Manual deduction'))
    ON CONFLICT (subscription_id, delivery_date) DO NOTHING
    RETURNING id INTO v_del_id;

    IF v_del_id IS NULL THEN
      RAISE EXCEPTION 'Delivery already recorded for subscription % on %', p_sub_id, p_target_date;
    END IF;

    UPDATE subscriptions SET
      remaining_tiffins = remaining_tiffins - 1,
      status = CASE WHEN remaining_tiffins - 1 = 0 THEN 'Completed'::subscription_status ELSE status END,
      completed_at = CASE WHEN remaining_tiffins - 1 = 0 THEN NOW() ELSE completed_at END
    WHERE id = p_sub_id;

    INSERT INTO system_logs (action_type, description, actor)
    VALUES ('MANUAL_DEDUCT',
      'Sub #' || p_sub_id || ' deducted for ' || p_target_date || '. Reason: ' || COALESCE(p_reason, 'N/A'),
      'admin');

    RETURN json_build_object('action', 'DEDUCTED', 'delivery_id', v_del_id);

  ELSIF p_action = 'RESTORE' THEN
    DELETE FROM deliveries
    WHERE subscription_id = p_sub_id AND delivery_date = p_target_date;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No delivery found for subscription % on %', p_sub_id, p_target_date;
    END IF;

    UPDATE subscriptions SET
      remaining_tiffins = remaining_tiffins + 1,
      status = 'Active'::subscription_status,
      completed_at = NULL
    WHERE id = p_sub_id;

    INSERT INTO system_logs (action_type, description, actor)
    VALUES ('MANUAL_RESTORE',
      'Sub #' || p_sub_id || ' restored for ' || p_target_date || '. Reason: ' || COALESCE(p_reason, 'N/A'),
      'admin');

    RETURN json_build_object('action', 'RESTORED');

  ELSE
    RAISE EXCEPTION 'Invalid action: %. Must be DEDUCT or RESTORE.', p_action;
  END IF;
END;
$$;

-- RPC 6: cancel_subscription
CREATE OR REPLACE FUNCTION cancel_subscription(p_sub_id BIGINT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_refund NUMERIC;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;
  IF v_sub.status != 'Active' THEN
    RAISE EXCEPTION 'Subscription % is not Active (current: %)', p_sub_id, v_sub.status;
  END IF;

  v_refund := v_sub.remaining_tiffins * v_sub.price_per_tiffin;

  UPDATE subscriptions SET
    remaining_tiffins = 0,
    status = 'Cancelled',
    cancelled_at = NOW(),
    refund_liability = v_refund
  WHERE id = p_sub_id;

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_CANCELLED',
    'Sub #' || p_sub_id || ' cancelled. Refund liability: ₹' || v_refund,
    'admin');

  RETURN json_build_object(
    'subscription_id', p_sub_id,
    'refund_amount', v_refund
  );
END;
$$;

-- RPC 7: get_revenue_summary (Sargable)
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

  RETURN json_build_object(
    'monthly_revenue', v_monthly_revenue,
    'prepaid_liability', v_prepaid_liability,
    'active_count', v_active_count,
    'completed_count', v_completed_count
  );
END;
$$;

-- RPC 8: get_renewal_queue
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
  WHERE s.status = 'Active'
    AND s.remaining_tiffins <= 3
    AND (s.last_reminded_at IS NULL OR s.last_reminded_at < NOW() - INTERVAL '2 days')
  ORDER BY s.remaining_tiffins ASC;
END;
$$;
