const SUPABASE_URL = env.spbs_url;
const SUPABASE_ANON_KEY = env.spbs_key;

const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
