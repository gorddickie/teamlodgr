// supabase.js — shared Supabase client for TeamLodgr
// The CDN UMD build exposes `supabase` as a global with createClient on it.
// We rename our client to `db` to avoid naming conflict.

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZ2FvcHh6ZmNmcnFwdXBjdHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM0ODMsImV4cCI6MjA5NDY3OTQ4M30.LPLHW7n7mb7SD1LTbnG3wpkHpF5e8ZrHsNL5tn2osy0';

// `supabase` here refers to the UMD global from the CDN script
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
