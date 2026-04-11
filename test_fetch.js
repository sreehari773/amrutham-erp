const { createClient } = require('@supabase/supabase-js');
const client = createClient("", "");
client.from('subscriptions').select('*').then(console.log).catch(console.error);
