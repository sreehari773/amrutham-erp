-- ============================================================
-- AMRUTHAM ERP — Schema Fix Script
-- Run this in your Supabase SQL Editor if you see "table not found" errors.
-- ============================================================

-- 1. Ensure Enums exist
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('Active', 'Completed', 'Cancelled', 'Expired', 'Grace');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_mode_enum AS ENUM ('UPI', 'Cash', 'Card', 'Bank Transfer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create missing tables
CREATE TABLE IF NOT EXISTS subscription_plans (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  tiffin_count    INT NOT NULL CHECK (tiffin_count > 0),
  total_price     NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
  delivery_charge NUMERIC(10,2) NOT NULL DEFAULT 40,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id              BIGSERIAL PRIMARY KEY,
  subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
  invoice_number  TEXT NOT NULL UNIQUE,
  amount          NUMERIC(12,2) NOT NULL,
  payment_mode    payment_mode_enum NOT NULL DEFAULT 'UPI',
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_menus (
  day_of_week         TEXT PRIMARY KEY,
  veg_description     TEXT NOT NULL DEFAULT '',
  non_veg_description TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Seed initial weekly menus if empty
INSERT INTO weekly_menus (day_of_week, veg_description, non_veg_description) 
VALUES
  ('Monday', 'Paneer Butter Masala, Roti, Rice, Dal, Salad', 'Butter Chicken, Roti, Rice, Dal, Salad'),
  ('Tuesday', 'Aloo Gobi, Roti, Rice, Dal, Salad', 'Chicken Curry, Roti, Rice, Dal, Salad'),
  ('Wednesday', 'Mix Veg, Roti, Rice, Dal, Salad', 'Egg Curry, Roti, Rice, Dal, Salad'),
  ('Thursday', 'Palak Paneer, Roti, Rice, Dal, Salad', 'Mutton Curry, Roti, Rice, Dal, Salad'),
  ('Friday', 'Bhindi Masala, Roti, Rice, Dal, Salad', 'Fish Curry, Roti, Rice, Dal, Salad'),
  ('Saturday', 'Chole Bhature, Rice, Salad', 'Chicken Biryani, Raita, Salad')
ON CONFLICT (day_of_week) DO NOTHING;

-- 4. Ensure invoice sequence table exists
CREATE TABLE IF NOT EXISTS invoice_sequence (
  month_key TEXT PRIMARY KEY,
  last_seq  INT NOT NULL DEFAULT 0
);

-- 5. Permissions
-- Grant usage on public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant all permissions on all tables in public to the roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Explicitly ensure foreign key for PostgREST relationships
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscriptions_customer') THEN
        ALTER TABLE subscriptions 
        ADD CONSTRAINT fk_subscriptions_customer 
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_subscription') THEN
        ALTER TABLE invoices 
        ADD CONSTRAINT fk_invoices_subscription 
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);
    END IF;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;
