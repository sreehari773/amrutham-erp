-- Live DB patch for subscription renewal, delivery logging, and weekday skips.

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refund_liability NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS meal_preference TEXT NOT NULL DEFAULT 'veg',
ADD COLUMN IF NOT EXISTS skip_saturday BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS skip_weekdays SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
ADD COLUMN IF NOT EXISTS delivery_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscriptions_meal_preference_check'
  ) THEN
    ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_meal_preference_check
    CHECK (meal_preference IN ('veg', 'non_veg', 'mixed'));
  END IF;
END $$;

UPDATE public.subscriptions
SET skip_weekdays = ARRAY[6]::SMALLINT[]
WHERE COALESCE(skip_saturday, FALSE) = TRUE
  AND COALESCE(array_length(skip_weekdays, 1), 0) = 0;

CREATE TABLE IF NOT EXISTS public.deliveries (
  id BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES public.subscriptions(id),
  delivery_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT ALL ON TABLE public.deliveries TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.deliveries_id_seq TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'unique_delivery_per_day'
  ) THEN
    ALTER TABLE public.deliveries
    ADD CONSTRAINT unique_delivery_per_day UNIQUE (subscription_id, delivery_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deliveries_sub_date
ON public.deliveries(subscription_id, delivery_date);

DROP FUNCTION IF EXISTS public.create_customer_with_subscription(
  text, text, text, bigint, public.payment_mode_enum, date, date, text, boolean, text
);
DROP FUNCTION IF EXISTS public.create_customer_with_subscription(
  text, text, text, bigint, text, date, date, text, boolean, text
);
DROP FUNCTION IF EXISTS public.create_customer_with_subscription(
  text, text, text, bigint, text, date, date, text, boolean, smallint[], text
);

CREATE OR REPLACE FUNCTION public.create_customer_with_subscription(
  p_name TEXT,
  p_phone TEXT,
  p_address TEXT,
  p_plan_id BIGINT,
  p_payment_mode TEXT DEFAULT 'UPI',
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

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription Plan % not found', p_plan_id;
  END IF;

  v_price_per_tiffin := (v_plan.total_price - v_plan.delivery_charge) / v_plan.tiffin_count;

  INSERT INTO public.customers (name, phone, address)
  VALUES (p_name, p_phone, p_address)
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address
  RETURNING id INTO v_customer_id;

  INSERT INTO public.subscriptions (
    customer_id, plan_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date,
    meal_preference, skip_saturday, skip_weekdays, delivery_notes
  ) VALUES (
    v_customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, v_start,
    p_meal_preference, p_skip_saturday, COALESCE(p_skip_weekdays, ARRAY[]::SMALLINT[]), p_delivery_notes
  ) RETURNING id INTO v_sub_id;

  v_inv_num := public.generate_invoice_number(v_inv_date);

  INSERT INTO public.invoices (
    subscription_id, customer_id, invoice_number, amount, payment_mode, invoice_date
  ) VALUES (
    v_sub_id, v_customer_id, v_inv_num, v_plan.total_price, p_payment_mode, v_inv_date
  );

  RETURN json_build_object(
    'customer_id', v_customer_id,
    'subscription_id', v_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_plan.total_price
  );
END;
$$;

DROP FUNCTION IF EXISTS public.renew_subscription(
  bigint, bigint, date, public.payment_mode_enum
);
DROP FUNCTION IF EXISTS public.renew_subscription(
  bigint, bigint, date, text
);

CREATE OR REPLACE FUNCTION public.renew_subscription(
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
  SELECT * INTO v_old FROM public.subscriptions WHERE id = p_old_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_old_sub_id;
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription Plan % not found', p_plan_id;
  END IF;

  v_price_per_tiffin := (v_plan.total_price - v_plan.delivery_charge) / v_plan.tiffin_count;

  INSERT INTO public.subscriptions (
    customer_id, plan_id, total_tiffins, remaining_tiffins,
    price_per_tiffin, total_amount, start_date,
    meal_preference, skip_saturday, skip_weekdays, delivery_notes
  ) VALUES (
    v_old.customer_id, p_plan_id, v_plan.tiffin_count, v_plan.tiffin_count,
    v_price_per_tiffin, v_plan.total_price, COALESCE(p_start_date, CURRENT_DATE),
    COALESCE(v_old.meal_preference, 'veg'),
    COALESCE(v_old.skip_saturday, FALSE),
    COALESCE(v_old.skip_weekdays, ARRAY[]::SMALLINT[]),
    v_old.delivery_notes
  ) RETURNING id INTO v_new_sub_id;

  v_inv_num := public.generate_invoice_number(COALESCE(p_start_date, CURRENT_DATE));

  INSERT INTO public.invoices (
    subscription_id, customer_id, invoice_number, amount, payment_mode, invoice_date
  ) VALUES (
    v_new_sub_id, v_old.customer_id, v_inv_num, v_plan.total_price, p_payment_mode, COALESCE(p_start_date, CURRENT_DATE)
  );

  RETURN json_build_object(
    'new_subscription_id', v_new_sub_id,
    'invoice_number', v_inv_num,
    'total_amount', v_plan.total_price
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_kot_for_date(p_target_date DATE DEFAULT CURRENT_DATE)
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
  FROM public.subscriptions s
  JOIN public.customers c ON c.id = s.customer_id
  WHERE s.status IN ('Active', 'Grace')
    AND (s.status = 'Grace' OR s.remaining_tiffins > 0)
    AND p_target_date >= s.start_date
    AND NOT (
      s.pause_start IS NOT NULL
      AND p_target_date >= s.pause_start
      AND p_target_date <= COALESCE(s.pause_end, p_target_date)
    )
    AND NOT (
      (COALESCE(s.skip_saturday, FALSE) AND EXTRACT(DOW FROM p_target_date) = 6)
      OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
    )
  ORDER BY c.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_today_delivered(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH eligible AS (
    SELECT s.id
    FROM public.subscriptions s
    WHERE s.status = 'Active'
      AND s.remaining_tiffins > 0
      AND p_target_date >= s.start_date
      AND NOT (
        s.pause_start IS NOT NULL
        AND p_target_date >= s.pause_start
        AND p_target_date <= COALESCE(s.pause_end, p_target_date)
      )
      AND NOT (
        (COALESCE(s.skip_saturday, FALSE) AND EXTRACT(DOW FROM p_target_date) = 6)
        OR EXTRACT(DOW FROM p_target_date)::INT = ANY(COALESCE(s.skip_weekdays, ARRAY[]::SMALLINT[]))
      )
  ),
  inserted AS (
    INSERT INTO public.deliveries (subscription_id, delivery_date, reason)
    SELECT e.id, p_target_date, 'Bulk daily deduction'
    FROM eligible e
    ON CONFLICT (subscription_id, delivery_date) DO NOTHING
    RETURNING subscription_id
  ),
  updated AS (
    UPDATE public.subscriptions s
    SET remaining_tiffins = s.remaining_tiffins - 1,
        status = CASE WHEN s.remaining_tiffins - 1 = 0 THEN 'Expired'::public.subscription_status ELSE s.status END,
        completed_at = CASE WHEN s.remaining_tiffins - 1 = 0 THEN NOW() ELSE s.completed_at END
    FROM inserted i
    WHERE s.id = i.subscription_id
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_count FROM updated;

  INSERT INTO public.system_logs (action_type, description, actor)
  VALUES ('BULK_DEDUCTION', v_count || ' deliveries marked for ' || p_target_date, 'admin');

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.manual_adjust_delivery(
  p_sub_id BIGINT,
  p_target_date DATE,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  v_sub RECORD;
  v_del_id BIGINT;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_sub_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription % not found', p_sub_id;
  END IF;

  IF p_action = 'DEDUCT' THEN
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

    INSERT INTO public.deliveries (subscription_id, delivery_date, reason)
    VALUES (p_sub_id, p_target_date, COALESCE(p_reason, 'Manual deduction'))
    ON CONFLICT (subscription_id, delivery_date) DO NOTHING
    RETURNING id INTO v_del_id;

    IF v_del_id IS NULL THEN
      RAISE EXCEPTION 'Delivery already recorded for subscription % on %', p_sub_id, p_target_date;
    END IF;

    UPDATE public.subscriptions
    SET remaining_tiffins = remaining_tiffins - 1,
        status = CASE WHEN remaining_tiffins - 1 = 0 THEN 'Expired'::public.subscription_status ELSE status END,
        completed_at = CASE WHEN remaining_tiffins - 1 = 0 THEN NOW() ELSE completed_at END
    WHERE id = p_sub_id;

    RETURN json_build_object('action', 'DEDUCTED', 'delivery_id', v_del_id);
  ELSIF p_action = 'RESTORE' THEN
    DELETE FROM public.deliveries
    WHERE subscription_id = p_sub_id AND delivery_date = p_target_date;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'No delivery found for subscription % on %', p_sub_id, p_target_date;
    END IF;

    UPDATE public.subscriptions
    SET remaining_tiffins = remaining_tiffins + 1,
        status = 'Active'::public.subscription_status,
        completed_at = NULL
    WHERE id = p_sub_id;

    RETURN json_build_object('action', 'RESTORED');
  ELSE
    RAISE EXCEPTION 'Invalid action: %. Must be DEDUCT or RESTORE.', p_action;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
