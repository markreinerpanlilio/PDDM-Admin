const SUPABASE_URL = window.spbs_url;
const SUPABASE_ANON_KEY = window.spbs_key;

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
