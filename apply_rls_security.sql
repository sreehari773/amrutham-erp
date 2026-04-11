-- ============================================================
-- AMRUTHAM ERP - SECURITY ADVISOR FIX (RLS ENABLEMENT)
-- ============================================================
-- This script fixes the "RLS Disabled in Public" errors in your
-- Supabase Security Advisor by enabling Row Level Security on all tables.
-- The Next.js ERP Admin dashboard will continue working without issues
-- because the SUPABASE_SERVICE_ROLE_KEY automatically bypasses RLS.

-- 1. Enable RLS on current active tables
ALTER TABLE IF EXISTS customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoice_sequence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pause_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menu_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS weekly_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS kitchen_forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS delivery_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messaging_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS renewal_requests ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on legacy tables (from your screenshot)
-- Enabling RLS on these locks them down safely.
ALTER TABLE IF EXISTS addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subscription_pauses ENABLE ROW LEVEL SECURITY;

-- 3. Customer Mobile App Foundation Policies
-- These policies ensure that when a customer logs in via the mobile app,
-- they can ONLY see their own data, and cannot modify other customers' data.

-- Customers can view and update their own profile
CREATE POLICY "Customers can view their own profile" 
  ON customers FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Customers can update their own profile" 
  ON customers FOR UPDATE 
  USING (auth.uid() = user_id);

-- Customers can view their own subscriptions
CREATE POLICY "Customers can view their subscriptions" 
  ON subscriptions FOR SELECT 
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Customers can view public subscription plans
CREATE POLICY "Anyone can view subscription plans" 
  ON subscription_plans FOR SELECT 
  TO public
  USING (true);

-- Customers can view their own invoices
CREATE POLICY "Customers can view their own invoices" 
  ON invoices FOR SELECT 
  USING (subscription_id IN (
    SELECT id FROM subscriptions WHERE customer_id IN (
      SELECT id FROM customers WHERE user_id = auth.uid()
    )
  ));

-- Customers can insert renewal requests for their subscriptions
CREATE POLICY "Customers can submit renewals" 
  ON renewal_requests FOR INSERT 
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

CREATE POLICY "Customers can view their own renewals" 
  ON renewal_requests FOR SELECT 
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
