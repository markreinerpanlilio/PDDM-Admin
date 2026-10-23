(() => {
    // Make sure the Supabase library loaded first.
    if (
        !window.supabase ||
        typeof window.supabase.createClient !== "function"
    ) {
        throw new Error(
            "Supabase library did not load. Check the Supabase CDN script."
        );
    }

    // Make sure the generated configuration exists.
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        throw new Error(
            "Supabase configuration is missing. Check config.js and Render environment variables."
        );
    }

    // Create one shared client accessible to page scripts.
    window.db = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
    );
})();
