-- ============================================================
-- CLEANUP DUPLICATE CONSTRAINTS (if any)
-- ============================================================

DO $$ BEGIN
    -- Drop if exists (we will rely on the default ones if they exist)
    ALTER TABLE invoices DROP CONSTRAINT IF EXISTS fk_invoices_subscription;
    ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS fk_subscriptions_customer;
EXCEPTION
    WHEN undefined_table THEN null;
    WHEN undefined_object THEN null;
END $$;

-- Ensure standard names exist if missing
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_subscription_id_fkey') THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_subscription_id_fkey 
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_customer_id_fkey') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_customer_id_fkey 
        FOREIGN KEY (customer_id) REFERENCES customers(id);
    END IF;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;
