const SUPABASE_URL = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
