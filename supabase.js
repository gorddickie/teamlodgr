// supabase.js — shared Supabase client for TeamLodgr
// Uses the CDN UMD build loaded via <script> tag in each HTML page.
// Usage in HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//               <script src="/supabase.js"></script>

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZ2FvcHh6ZmNmcnFwdXBjdHRzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDM0ODMsImV4cCI6MjA5NDY3OTQ4M30.LPLHW7n7mb7SD1LTbnG3wpkHpF5e8ZrHsNL5tn2osy0';

// supabase global is provided by the CDN script above
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
