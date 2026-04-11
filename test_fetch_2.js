const { createClient } = require('@supabase/supabase-js');
const client = createClient("http://localhost:54321", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqZW9nYmVtZXZ3ZG11Y2l1cWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDYyOTcsImV4cCI6MjA4ODgyMjI5N30.SYzbKsJ3NcnoBM4M8VEXy5_UeQK_5sahCnkFiysK6o4");
client.from('subscriptions').select('*').then(console.log).catch(console.error);
