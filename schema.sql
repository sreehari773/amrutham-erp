-- ============================================================
-- AMRUTHAM ERP — Complete PostgreSQL Schema
-- ============================================================

-- 1. ENUMS
CREATE TYPE subscription_status AS ENUM ('Active', 'Completed', 'Cancelled', 'Expired', 'Grace');
CREATE TYPE payment_mode_enum AS ENUM ('UPI', 'Cash', 'Card', 'Bank Transfer');

-- NOTE: If migrating an existing database, run these instead:
-- ALTER TYPE subscription_status ADD VALUE 'Expired';
-- ALTER TYPE subscription_status ADD VALUE 'Grace';

-- 2. TABLES

CREATE TABLE customers (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID, -- References auth.users(id) in Supabase
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL UNIQUE,
  secondary_phone TEXT,
  address    TEXT,
  saved_addresses JSONB DEFAULT '[]'::jsonb, -- Array of additional addresses
  app_password TEXT, -- For custom mobile app authentication
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscription_plans (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  tiffin_count    INT NOT NULL CHECK (tiffin_count > 0),
  total_price     NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 40,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
CREATE TABLE subscriptions (
  id                BIGSERIAL PRIMARY KEY,
  customer_id       BIGINT NOT NULL REFERENCES customers(id),
  plan_id           BIGINT NOT NULL REFERENCES subscription_plans(id),
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
  meal_preference   TEXT NOT NULL DEFAULT 'veg' CHECK (meal_preference IN ('veg', 'non_veg', 'mixed')),
  skip_saturday     BOOLEAN NOT NULL DEFAULT FALSE,
  skip_weekdays     SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
  delivery_notes    TEXT,
  route_id          BIGINT,
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

GRANT ALL ON TABLE deliveries TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE deliveries_id_seq TO anon, authenticated, service_role;

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
  customer_id     BIGINT NOT NULL REFERENCES customers(id),
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
  s.meal_preference,
  s.skip_saturday,
  s.delivery_notes,
  s.route_id,
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
  p_plan_id BIGINT,
  p_payment_mode payment_mode_enum DEFAULT 'UPI',
  p_custom_start_date DATE DEFAULT NULL,
  p_custom_invoice_date DATE DEFAULT NULL,
  p_meal_preference TEXT DEFAULT 'veg',
  p_skip_saturday BOOLEAN DEFAULT FALSE,
  p_skip_weekdays SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
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
    meal_preference, skip_saturday, skip_weekdays, delivery_notes
  ) VALUES (
    v_customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, v_start,
    p_meal_preference, p_skip_saturday, COALESCE(p_skip_weekdays, ARRAY[]::SMALLINT[]), p_delivery_notes
  ) RETURNING id INTO v_sub_id;

  -- Generate invoice
  v_inv_num := generate_invoice_number(v_inv_date);

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
  p_payment_mode payment_mode_enum DEFAULT 'UPI'
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
    price_per_tiffin, total_amount, start_date, meal_preference, skip_saturday, skip_weekdays, delivery_notes
  ) VALUES (
    v_old.customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, p_start_date,
    v_old.meal_preference, COALESCE(v_old.skip_saturday, FALSE), COALESCE(v_old.skip_weekdays, ARRAY[]::SMALLINT[]), v_old.delivery_notes
  ) RETURNING id INTO v_new_sub_id;

  v_inv_num := generate_invoice_number(p_start_date);

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

-- RPC 3: get_kot_for_date
CREATE OR REPLACE FUNCTION get_kot_for_date(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  subscription_id BIGINT,
  name TEXT,
  address TEXT,
  phone TEXT,
  meal_preference TEXT,
  delivery_notes TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, c.name, c.address, c.phone, s.meal_preference, s.delivery_notes
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  WHERE s.status IN ('Active', 'Grace')
    AND (s.status = 'Grace' OR s.remaining_tiffins > 0)
    AND p_target_date >= s.start_date
    AND NOT (
      s.pause_start IS NOT NULL
      AND p_target_date >= s.pause_start
      AND p_target_date <= COALESCE(s.pause_end, p_target_date)
    )
    AND NOT (
      (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6)
      OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
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
      AND NOT (
        (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6)
        OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
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
        status = CASE WHEN s.remaining_tiffins - 1 = 0 THEN 'Expired'::subscription_status ELSE s.status END,
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
    IF (COALESCE(v_sub.skip_saturday, FALSE) AND EXTRACT(DOW FROM p_target_date) = 6)
       OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(v_sub.skip_weekdays, ARRAY[]::SMALLINT[])) THEN
      RAISE EXCEPTION 'Subscription is configured to skip deliveries on %', p_target_date;
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
      status = CASE WHEN remaining_tiffins - 1 = 0 THEN 'Expired'::subscription_status ELSE status END,
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
  WHERE s.status IN ('Active', 'Expired', 'Grace')
    AND s.remaining_tiffins <= 3
    AND (s.last_reminded_at IS NULL OR s.last_reminded_at < NOW() - INTERVAL '2 days')
  ORDER BY s.remaining_tiffins ASC;
END;
$$;

-- ============================================================
-- 6. OPERATIONS LAYER TABLES
-- ============================================================

-- Pause history for audit trail and churn analysis
CREATE TABLE pause_history (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  pause_start     DATE NOT NULL,
  pause_end       DATE,
  pause_mode      TEXT NOT NULL DEFAULT 'override' CHECK (pause_mode IN ('override', 'cumulative')),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pause_history_sub ON pause_history(subscription_id);

-- Weekly rotating menu schedule
CREATE TABLE menu_schedule (
  id              BIGSERIAL PRIMARY KEY,
  day_of_week     INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  meal_slot       TEXT NOT NULL DEFAULT 'lunch',
  veg_items       TEXT NOT NULL,
  non_veg_items   TEXT NOT NULL,
  veg_alternatives TEXT,
  side_items      TEXT,
  notes           TEXT,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(day_of_week, meal_slot, effective_from)
);

-- New fixed Weekly Menus table
CREATE TABLE weekly_menus (
  day_of_week         TEXT PRIMARY KEY,
  veg_description     TEXT NOT NULL DEFAULT '',
  non_veg_description TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO weekly_menus (day_of_week, veg_description, non_veg_description) VALUES
  ('Monday', 'Paneer Butter Masala, Roti, Rice, Dal, Salad', 'Butter Chicken, Roti, Rice, Dal, Salad'),
  ('Tuesday', 'Aloo Gobi, Roti, Rice, Dal, Salad', 'Chicken Curry, Roti, Rice, Dal, Salad'),
  ('Wednesday', 'Mix Veg, Roti, Rice, Dal, Salad', 'Egg Curry, Roti, Rice, Dal, Salad'),
  ('Thursday', 'Palak Paneer, Roti, Rice, Dal, Salad', 'Mutton Curry, Roti, Rice, Dal, Salad'),
  ('Friday', 'Bhindi Masala, Roti, Rice, Dal, Salad', 'Fish Curry, Roti, Rice, Dal, Salad'),
  ('Saturday', 'Chole Bhature, Rice, Salad', 'Chicken Biryani, Raita, Salad')
ON CONFLICT (day_of_week) DO NOTHING;

-- Kitchen forecast for production planning
CREATE TABLE kitchen_forecast (
  id             BIGSERIAL PRIMARY KEY,
  forecast_date  DATE NOT NULL UNIQUE,
  veg_count      INT NOT NULL DEFAULT 0,
  non_veg_count  INT NOT NULL DEFAULT 0,
  mixed_count    INT NOT NULL DEFAULT 0,
  total_count    INT NOT NULL DEFAULT 0,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery routes for manifest sorting
CREATE TABLE delivery_routes (
  id         BIGSERIAL PRIMARY KEY,
  route_name TEXT NOT NULL UNIQUE,
  area_codes TEXT[],
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for route_id on subscriptions (column already added above)
ALTER TABLE subscriptions ADD CONSTRAINT fk_subscriptions_route
  FOREIGN KEY (route_id) REFERENCES delivery_routes(id);

-- Driver assignments per route
CREATE TABLE driver_assignments (
  id          BIGSERIAL PRIMARY KEY,
  route_id    BIGINT NOT NULL REFERENCES delivery_routes(id),
  driver_name TEXT NOT NULL,
  phone       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconciliation run logs
CREATE TABLE reconciliation_runs (
  id                  BIGSERIAL PRIMARY KEY,
  run_date            DATE NOT NULL,
  resumed             INT NOT NULL DEFAULT 0,
  delivered           INT NOT NULL DEFAULT 0,
  expired             INT NOT NULL DEFAULT 0,
  graced              INT NOT NULL DEFAULT 0,
  forecast_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  manifest_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  errors              JSONB,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- Messaging events for WhatsApp automation
CREATE TABLE messaging_events (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT REFERENCES subscriptions(id),
  customer_id     BIGINT REFERENCES customers(id),
  event_type      TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'whatsapp',
  message_text    TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messaging_sub ON messaging_events(subscription_id);
CREATE INDEX idx_messaging_type ON messaging_events(event_type);

-- Customer renewal requests for manual UPI verification
CREATE TYPE renewal_status AS ENUM ('Pending', 'Verified', 'Rejected');

CREATE TABLE renewal_requests (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  customer_id     BIGINT NOT NULL REFERENCES customers(id),
  plan_id         BIGINT NOT NULL REFERENCES subscription_plans(id),
  utr_number      TEXT NOT NULL,
  status          renewal_status NOT NULL DEFAULT 'Pending',
  admin_notes     TEXT,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_renewal_requests_status ON renewal_requests(status);

-- ============================================================
-- 7. OPERATIONS LAYER RPCs
-- ============================================================

-- RPC: Generate kitchen forecast for a date
CREATE OR REPLACE FUNCTION generate_kitchen_forecast(p_target_date DATE DEFAULT CURRENT_DATE + 1)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_veg INT;
  v_non_veg INT;
  v_mixed INT;
  v_total INT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE s.meal_preference = 'veg'),
    COUNT(*) FILTER (WHERE s.meal_preference = 'non_veg'),
    COUNT(*) FILTER (WHERE s.meal_preference = 'mixed')
  INTO v_veg, v_non_veg, v_mixed
  FROM subscriptions s
  WHERE s.status IN ('Active', 'Grace')
    AND (s.status = 'Grace' OR s.remaining_tiffins > 0)
    AND p_target_date >= s.start_date
    AND NOT (
      s.pause_start IS NOT NULL
      AND p_target_date >= s.pause_start
      AND p_target_date <= COALESCE(s.pause_end, p_target_date)
    )
    AND NOT (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6);

  v_total := v_veg + v_non_veg + v_mixed;

  INSERT INTO kitchen_forecast (forecast_date, veg_count, non_veg_count, mixed_count, total_count)
  VALUES (p_target_date, v_veg, v_non_veg, v_mixed, v_total)
  ON CONFLICT (forecast_date) DO UPDATE SET
    veg_count = v_veg,
    non_veg_count = v_non_veg,
    mixed_count = v_mixed,
    total_count = v_total,
    generated_at = NOW();

  RETURN json_build_object(
    'forecast_date', p_target_date,
    'veg_count', v_veg,
    'non_veg_count', v_non_veg,
    'mixed_count', v_mixed,
    'total_count', v_total
  );
END;
$$;

-- RPC: Generate delivery manifest for a date
CREATE OR REPLACE FUNCTION generate_delivery_manifest(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_manifest JSON;
BEGIN
  SELECT json_agg(row_to_json(m)) INTO v_manifest
  FROM (
    SELECT
      s.id AS subscription_id,
      c.name,
      c.phone,
      c.address,
      s.meal_preference,
      s.delivery_notes,
      s.status,
      s.remaining_tiffins,
      dr.route_name,
      dr.sort_order AS route_sort,
      da.driver_name,
      da.phone AS driver_phone
    FROM subscriptions s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN delivery_routes dr ON dr.id = s.route_id
    LEFT JOIN driver_assignments da ON da.route_id = dr.id AND da.active = TRUE
    WHERE s.status IN ('Active', 'Grace')
      AND (s.status = 'Grace' OR s.remaining_tiffins > 0)
      AND p_target_date >= s.start_date
      AND NOT (
        s.pause_start IS NOT NULL
        AND p_target_date >= s.pause_start
        AND p_target_date <= COALESCE(s.pause_end, p_target_date)
      )
      AND NOT (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6)
    ORDER BY COALESCE(dr.sort_order, 9999), c.name
  ) m;

  RETURN COALESCE(v_manifest, '[]'::JSON);
END;
$$;

-- Materialized view for subscription analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS subscription_analytics AS
SELECT
  c.id AS customer_id,
  c.name,
  c.phone,
  COUNT(s.id) AS total_subscriptions,
  COUNT(s.id) FILTER (WHERE s.status = 'Active') AS active_count,
  COUNT(s.id) FILTER (WHERE s.status = 'Completed') AS completed_count,
  COUNT(s.id) FILTER (WHERE s.status = 'Cancelled') AS cancelled_count,
  COUNT(s.id) FILTER (WHERE s.status IN ('Expired', 'Grace')) AS expired_count,
  COALESCE(SUM(s.total_amount), 0) AS lifetime_value,
  MAX(s.created_at) AS last_subscription_date,
  COUNT(DISTINCT ph.id) AS total_pauses
FROM customers c
LEFT JOIN subscriptions s ON s.customer_id = c.id
LEFT JOIN pause_history ph ON ph.subscription_id = s.id
GROUP BY c.id, c.name, c.phone;

CREATE UNIQUE INDEX idx_analytics_customer ON subscription_analytics(customer_id);

-- ============================================================================
-- Billing System Hardening Patch
-- ============================================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS holiday_opt_out BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS extension_notes JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS ingredient_cost_per_tiffin NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_per_tiffin NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS status_source TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS fault_type TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS extension_applied BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deliveries_status_check'
  ) THEN
    ALTER TABLE deliveries
      ADD CONSTRAINT deliveries_status_check
      CHECK (status IN ('pending', 'out_for_delivery', 'delivered', 'confirmed', 'skipped', 'kitchen_missed', 'cancelled'));
  END IF;
END;
$$;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS billing_period_start DATE,
  ADD COLUMN IF NOT EXISTS billing_period_end DATE,
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS related_invoice_id BIGINT REFERENCES invoices(id),
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_meta JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS recognized_revenue NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS ingredient_cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_cost_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_total NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(recognized_revenue, amount) - ingredient_cost_total - delivery_cost_total
  ) STORED;

ALTER TABLE messaging_events
  ADD COLUMN IF NOT EXISTS reference_key TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_messaging_reference_key ON messaging_events(reference_key);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription_period ON invoices(subscription_id, billing_period_start, billing_period_end);
CREATE INDEX IF NOT EXISTS idx_deliveries_date_status ON deliveries(delivery_date, status, billable);

CREATE OR REPLACE VIEW subscriptions_with_latest_invoice AS
SELECT
  s.id AS subscription_id,
  s.customer_id,
  c.name,
  c.phone,
  c.address,
  s.plan_id,
  sp.name AS plan_name,
  s.total_tiffins,
  s.remaining_tiffins,
  s.price_per_tiffin,
  s.total_amount,
  s.status,
  s.start_date,
  s.pause_start,
  s.pause_end,
  s.skip_saturday,
  s.skip_weekdays,
  s.delivery_notes,
  s.meal_preference,
  s.holiday_opt_out,
  s.created_at,
  li.invoice_number AS latest_invoice_number,
  li.amount AS latest_invoice_amount,
  li.invoice_date AS latest_invoice_date,
  li.payment_status AS latest_invoice_status
FROM subscriptions s
JOIN customers c ON c.id = s.customer_id
JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN LATERAL (
  SELECT inv.invoice_number, inv.amount, inv.invoice_date, inv.payment_status
  FROM invoices inv
  WHERE inv.subscription_id = s.id
    AND inv.invoice_type <> 'adjustment'
  ORDER BY inv.invoice_date DESC, inv.created_at DESC
  LIMIT 1
) li ON TRUE;

CREATE OR REPLACE FUNCTION sync_subscription_pause_window(p_sub_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_pause_start DATE;
  v_pause_end DATE;
  v_today_ist DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  SELECT MIN(pause_start), MAX(COALESCE(pause_end, pause_start))
  INTO v_pause_start, v_pause_end
  FROM pause_history
  WHERE subscription_id = p_sub_id
    AND COALESCE(pause_end, pause_start) >= v_today_ist;

  UPDATE subscriptions
  SET pause_start = v_pause_start,
      pause_end = v_pause_end
  WHERE id = p_sub_id;
END;
$$;

CREATE OR REPLACE FUNCTION register_pause_event_v2(
  p_sub_id BIGINT,
  p_pause_start DATE,
  p_pause_end DATE DEFAULT NULL,
  p_pause_mode TEXT DEFAULT 'override',
  p_reason TEXT DEFAULT NULL,
  p_actor TEXT DEFAULT 'system'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_effective_end DATE;
  v_overlap_count INT;
  v_today_ist DATE := (NOW() AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  SELECT *
  INTO v_sub
  FROM subscriptions
  WHERE id = p_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;

  IF p_pause_start < v_sub.start_date THEN
    RAISE EXCEPTION 'Pause date % is before subscription start date %', p_pause_start, v_sub.start_date;
  END IF;

  IF p_pause_start < v_today_ist THEN
    RAISE EXCEPTION 'Pause date % cannot be in the past', p_pause_start;
  END IF;

  v_effective_end := COALESCE(p_pause_end, p_pause_start);

  IF v_effective_end < p_pause_start THEN
    RAISE EXCEPTION 'Pause end date % cannot be earlier than pause start %', v_effective_end, p_pause_start;
  END IF;

  SELECT COUNT(*)
  INTO v_overlap_count
  FROM pause_history
  WHERE subscription_id = p_sub_id
    AND p_pause_start <= COALESCE(pause_end, pause_start)
    AND v_effective_end >= pause_start;

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Pause window overlaps with an existing pause for subscription %', p_sub_id;
  END IF;

  INSERT INTO pause_history (subscription_id, pause_start, pause_end, pause_mode, reason)
  VALUES (p_sub_id, p_pause_start, v_effective_end, p_pause_mode, p_reason);

  PERFORM sync_subscription_pause_window(p_sub_id);

  INSERT INTO system_logs (action_type, description, actor)
  VALUES (
    'SUBSCRIPTION_PAUSED',
    'Sub #' || p_sub_id || ' paused from ' || p_pause_start || ' to ' || v_effective_end || '. Reason: ' || COALESCE(p_reason, 'N/A'),
    p_actor
  );

  RETURN json_build_object(
    'subscription_id', p_sub_id,
    'pause_start', p_pause_start,
    'pause_end', v_effective_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION apply_global_holiday_skip_v2(
  p_target_date DATE,
  p_reason TEXT DEFAULT 'Holiday auto-skip'
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT := 0;
  v_sub RECORD;
BEGIN
  FOR v_sub IN
    SELECT id
    FROM subscriptions
    WHERE status IN ('Active', 'Grace')
      AND holiday_opt_out = FALSE
      AND p_target_date >= start_date
      AND NOT EXISTS (
        SELECT 1
        FROM pause_history ph
        WHERE ph.subscription_id = subscriptions.id
          AND p_target_date BETWEEN ph.pause_start AND COALESCE(ph.pause_end, ph.pause_start)
      )
  LOOP
    PERFORM register_pause_event_v2(
      v_sub.id,
      p_target_date,
      p_target_date,
      'override',
      COALESCE(p_reason, 'Holiday auto-skip'),
      'holiday-bot'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION transition_delivery_status_v2(
  p_sub_id BIGINT,
  p_target_date DATE,
  p_new_status TEXT,
  p_status_source TEXT DEFAULT 'admin',
  p_reason TEXT DEFAULT NULL,
  p_fault_type TEXT DEFAULT NULL,
  p_billable BOOLEAN DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_delivery RECORD;
  v_old_status TEXT;
  v_effective_billable BOOLEAN;
  v_is_non_chargeable BOOLEAN;
BEGIN
  SELECT *
  INTO v_sub
  FROM subscriptions
  WHERE id = p_sub_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;

  IF p_target_date < v_sub.start_date THEN
    RAISE EXCEPTION 'Target date % is before subscription start date %', p_target_date, v_sub.start_date;
  END IF;

  IF p_new_status NOT IN ('pending', 'out_for_delivery', 'delivered', 'confirmed', 'skipped', 'kitchen_missed', 'cancelled') THEN
    RAISE EXCEPTION 'Unsupported delivery status: %', p_new_status;
  END IF;

  SELECT *
  INTO v_delivery
  FROM deliveries
  WHERE subscription_id = p_sub_id
    AND delivery_date = p_target_date
  FOR UPDATE;

  v_effective_billable := COALESCE(p_billable, p_new_status IN ('delivered', 'confirmed'));
  v_is_non_chargeable := p_new_status IN ('skipped', 'kitchen_missed', 'cancelled') OR v_effective_billable = FALSE;
  v_old_status := v_delivery.status;

  IF v_delivery.id IS NULL THEN
    INSERT INTO deliveries (
      subscription_id,
      delivery_date,
      reason,
      status,
      status_updated_at,
      status_source,
      fault_type,
      confirmed_at,
      billable,
      extension_applied,
      metadata
    ) VALUES (
      p_sub_id,
      p_target_date,
      COALESCE(p_reason, 'Delivery transition'),
      p_new_status,
      NOW(),
      p_status_source,
      p_fault_type,
      CASE WHEN p_new_status = 'confirmed' THEN NOW() ELSE NULL END,
      v_effective_billable,
      v_is_non_chargeable,
      jsonb_build_object('reason', COALESCE(p_reason, ''), 'status_source', p_status_source)
    )
    RETURNING * INTO v_delivery;
  ELSE
    UPDATE deliveries
    SET reason = COALESCE(p_reason, deliveries.reason),
        status = p_new_status,
        status_updated_at = NOW(),
        status_source = p_status_source,
        fault_type = COALESCE(p_fault_type, deliveries.fault_type),
        confirmed_at = CASE
          WHEN p_new_status = 'confirmed' THEN NOW()
          ELSE deliveries.confirmed_at
        END,
        billable = v_effective_billable,
        extension_applied = v_is_non_chargeable,
        metadata = deliveries.metadata || jsonb_build_object('reason', COALESCE(p_reason, ''), 'status_source', p_status_source)
    WHERE id = v_delivery.id
    RETURNING * INTO v_delivery;
  END IF;

  IF p_new_status IN ('delivered', 'confirmed') AND COALESCE(v_old_status, '') NOT IN ('delivered', 'confirmed') THEN
    IF v_sub.remaining_tiffins <= 0 THEN
      RAISE EXCEPTION 'No remaining tiffins on subscription %', p_sub_id;
    END IF;

    UPDATE subscriptions
    SET remaining_tiffins = remaining_tiffins - 1,
        status = CASE
          WHEN remaining_tiffins - 1 = 0 THEN 'Expired'::subscription_status
          ELSE status
        END,
        completed_at = CASE
          WHEN remaining_tiffins - 1 = 0 THEN NOW()
          ELSE completed_at
        END
    WHERE id = p_sub_id;
  ELSIF p_new_status IN ('skipped', 'kitchen_missed', 'cancelled')
        AND COALESCE(v_old_status, '') IN ('delivered', 'confirmed') THEN
    UPDATE subscriptions
    SET remaining_tiffins = remaining_tiffins + 1,
        status = 'Active'::subscription_status,
        completed_at = NULL,
        extension_notes = extension_notes || jsonb_build_array(
          jsonb_build_object('date', p_target_date, 'status', p_new_status, 'reason', COALESCE(p_reason, ''))
        )
    WHERE id = p_sub_id;
  END IF;

  INSERT INTO system_logs (action_type, description, actor)
  VALUES (
    'DELIVERY_STATUS_UPDATED',
    'Sub #' || p_sub_id || ' on ' || p_target_date || ' -> ' || p_new_status || '. Reason: ' || COALESCE(p_reason, 'N/A'),
    p_status_source
  );

  RETURN json_build_object(
    'subscription_id', p_sub_id,
    'delivery_date', p_target_date,
    'status', p_new_status,
    'billable', v_effective_billable,
    'fault_type', p_fault_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION mark_today_delivered_v2(
  p_target_date DATE DEFAULT CURRENT_DATE,
  p_stage TEXT DEFAULT 'delivered'
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT := 0;
  v_sub RECORD;
BEGIN
  FOR v_sub IN
    SELECT s.id
    FROM subscriptions s
    WHERE s.status IN ('Active', 'Grace')
      AND s.remaining_tiffins > 0
      AND p_target_date >= s.start_date
      AND NOT (
        s.pause_start IS NOT NULL
        AND p_target_date >= s.pause_start
        AND p_target_date <= COALESCE(s.pause_end, p_target_date)
      )
      AND NOT (
        (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6)
        OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
      )
  LOOP
    PERFORM transition_delivery_status_v2(v_sub.id, p_target_date, p_stage, 'bulk-admin', 'Bulk daily processing');
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('BULK_DEDUCTION', v_count || ' deliveries updated for ' || p_target_date || ' at stage ' || p_stage, 'admin');

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION manual_adjust_delivery_v2(
  p_sub_id BIGINT,
  p_target_date DATE,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
  CASE UPPER(p_action)
    WHEN 'DEDUCT' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'delivered', 'admin-manual', COALESCE(p_reason, 'Manual delivery deduction'));
    WHEN 'RESTORE' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'skipped', 'admin-manual', COALESCE(p_reason, 'Manual delivery restore'), 'retro_restore', FALSE);
    WHEN 'CUSTOMER_SKIP' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'skipped', 'admin-manual', COALESCE(p_reason, 'Customer skip entered retroactively'), 'customer_skip', FALSE);
    WHEN 'KITCHEN_FAULT' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'kitchen_missed', 'admin-manual', COALESCE(p_reason, 'Kitchen missed delivery'), 'kitchen_fault', FALSE);
    WHEN 'OUT_FOR_DELIVERY' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'out_for_delivery', 'admin-manual', COALESCE(p_reason, 'Marked out for delivery'));
    WHEN 'CONFIRM' THEN
      RETURN transition_delivery_status_v2(p_sub_id, p_target_date, 'confirmed', 'admin-manual', COALESCE(p_reason, 'Delivery confirmed by customer'));
    ELSE
      RAISE EXCEPTION 'Unsupported manual delivery action: %', p_action;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION generate_delivery_manifest_v2(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_manifest JSON;
BEGIN
  SELECT json_agg(row_to_json(m)) INTO v_manifest
  FROM (
    SELECT
      s.id AS subscription_id,
      c.name,
      c.phone,
      c.address,
      s.meal_preference,
      s.delivery_notes,
      s.status,
      s.remaining_tiffins,
      dr.route_name,
      dr.sort_order AS route_sort,
      da.driver_name,
      da.phone AS driver_phone,
      d.status AS delivery_status,
      d.billable
    FROM subscriptions s
    JOIN customers c ON c.id = s.customer_id
    LEFT JOIN delivery_routes dr ON dr.id = s.route_id
    LEFT JOIN driver_assignments da ON da.route_id = dr.id AND da.active = TRUE
    LEFT JOIN deliveries d ON d.subscription_id = s.id AND d.delivery_date = p_target_date
    WHERE s.status IN ('Active', 'Grace')
      AND (s.status = 'Grace' OR s.remaining_tiffins > 0)
      AND p_target_date >= s.start_date
      AND NOT (
        s.pause_start IS NOT NULL
        AND p_target_date >= s.pause_start
        AND p_target_date <= COALESCE(s.pause_end, p_target_date)
      )
      AND NOT (
        (s.skip_saturday AND EXTRACT(DOW FROM p_target_date) = 6)
        OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
      )
    ORDER BY COALESCE(dr.sort_order, 9999), c.name
  ) m;

  RETURN COALESCE(v_manifest, '[]'::JSON);
END;
$$;

CREATE OR REPLACE FUNCTION get_renewal_queue_v2()
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
  SELECT
    s.id,
    c.name,
    c.phone,
    s.remaining_tiffins,
    s.last_reminded_at
  FROM subscriptions s
  JOIN customers c ON c.id = s.customer_id
  WHERE s.status IN ('Active', 'Grace')
    AND s.remaining_tiffins <= 3
  ORDER BY s.remaining_tiffins ASC, s.last_reminded_at NULLS FIRST, s.created_at ASC;
END;
$$;
