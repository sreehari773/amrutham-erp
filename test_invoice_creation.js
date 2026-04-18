const { createClient } = require('@supabase/supabase-js');

// Configured local testing client
const client = createClient(
  "http://localhost:54321",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqZW9nYmVtZXZ3ZG11Y2l1cWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDYyOTcsImV4cCI6MjA4ODgyMjI5N30.SYzbKsJ3NcnoBM4M8VEXy5_UeQK_5sahCnkFiysK6o4"
);

async function runTest() {
  console.log("🚀 Testing create_customer_with_subscription RPC...");

  // We need a valid plan_id. We will dynamically fetch one first.
  const { data: plans, error: planError } = await client.from('subscription_plans').select('id').limit(1);
  if (planError || !plans || plans.length === 0) {
    console.error("❌ Need a subscription plan in the DB to test:", planError);
    return;
  }
  
  const planId = plans[0].id;

  const payload = {
    p_name: "Test Customer " + Date.now(),
    p_phone: "999" + Math.floor(1000000 + Math.random() * 9000000), 
    p_address: "123 Test Ave",
    p_plan_id: planId,
    p_payment_mode: "UPI",
    p_meal_preference: "veg",
    p_skip_saturday: false
  };

  const { data, error } = await client.rpc('create_customer_with_subscription', payload);

  if (error) {
    console.error("❌ RPC Failed!");
    console.error(error.message);
    if (error.details) console.error("Details:", error.details);
    if (error.hint) console.error("Hint:", error.hint);
  } else {
    console.log("✅ Success! Output from RPC:");
    console.log(data);
    
    // Verify invoice was created properly with customer_id
    const { data: invoice } = await client
      .from('invoices')
      .select('invoice_number, customer_id, amount')
      .eq('subscription_id', data.subscription_id)
      .single();
      
    if (invoice?.customer_id) {
       console.log("✅ Verified Invoice created with customer_id:", invoice.customer_id);
    } else {
       console.error("❌ Invoice missing customer_id or invoice not found!");
    }
  }
}

runTest();
