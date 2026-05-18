// supabase.js — shared Supabase client for TeamLodgr
// Uses the CDN UMD build loaded via <script> tag in each HTML page.
// Usage in HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
//               <script src="/supabase.js"></script>

const SUPABASE_URL = 'https://ehgaopxzfcfrqpupctts.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Skf-EJ80V4kTYtDDMdbfVQ_Z20Zlgym';

// supabase global is provided by the CDN script above
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
