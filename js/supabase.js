const SUPABASE_URL = spbs_url;
const SUPABASE_ANON_KEY = spbs_key;

const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
