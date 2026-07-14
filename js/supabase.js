const SUPABASE_URL = "https://pcpahrtrnynjdnjptqwh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBjcGFocnRybnluamRuanB0cXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNDk4OTgsImV4cCI6MjA5MjgyNTg5OH0.wc0kRk92aC7l0cV6kg30v5ApggVRlzwkPL4JHrdvxHU";

const db = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);
