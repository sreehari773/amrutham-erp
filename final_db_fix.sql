-- ============================================================
-- FINAL DATABASE FIX & SCHEMA RELOAD
-- ============================================================

-- 1. Explicitly drop any possible duplicate constraints
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname, relname 
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        WHERE conname LIKE 'fk_%' OR conname LIKE '%_fkey'
    ) LOOP
        -- We will keep only the standard names if we find duplicates
        -- For now, let's just make sure we don't have the ones we manually added
        IF r.conname IN ('fk_invoices_subscription', 'fk_subscriptions_customer') THEN
            EXECUTE 'ALTER TABLE ' || r.relname || ' DROP CONSTRAINT IF EXISTS ' || r.conname;
        END IF;
    END LOOP;
END $$;

-- 2. Ensure standard foreign keys exist
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_subscription_id_fkey') THEN
        ALTER TABLE invoices ADD CONSTRAINT invoices_subscription_id_fkey 
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_customer_id_fkey') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_customer_id_fkey 
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_fkey') THEN
        ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_id_fkey 
        FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN null;
END $$;

-- 3. FORCE SCHEMA RELOAD (Critical for Supabase/PostgREST)
NOTIFY pgrst, 'reload schema';
