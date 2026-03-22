-- Phase 3: Billing and Deletion Upgrades

-- ==========================================
-- 1. Hard Deletion RPC
-- ==========================================
-- Safely wipes out a subscription and all its child records (invoices, deliveries)
CREATE OR REPLACE FUNCTION public.hard_delete_subscription(p_sub_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Delete dependencies
  DELETE FROM invoices WHERE subscription_id = p_sub_id;
  DELETE FROM deliveries WHERE subscription_id = p_sub_id;
  
  -- Delete subscription
  DELETE FROM subscriptions WHERE id = p_sub_id;
  
  -- Log operation
  INSERT INTO system_logs (action_type, description, actor)
  VALUES ('SUBSCRIPTION_HARD_DELETED', 'Permanently deleted subscription #' || p_sub_id || ' and all associated records.', 'admin');
END;
$$;


-- ==========================================
-- 2. Payment Tracking Enhancements
-- ==========================================
-- Add tracking columns to invoices
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'Pending';

-- Optional: Mark all historical invoices as fully paid to prevent a massive backlog of "Pending" dues upon upgrade.
UPDATE invoices 
SET amount_paid = amount, payment_status = 'Paid' 
WHERE payment_status = 'Pending';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
