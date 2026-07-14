async function login() {

    const email = document.getElementById("email").value.trim();

    const password = document.getElementById("password").value.trim();

    if (!email || !password) {

        alert("Please enter your email and password.");

        return;

    }

    const { data, error } = await window.supabaseClient.auth.signInWithPassword({

        email,
        password

    });

    if (error) {

        alert(error.message);

        return;

    }

    const user = data.user;

    const { data: profile, error: profileError } = await supabase

        .from("profiles")

        .select("role, full_name")

        .eq("id", user.id)

        .single();

    if (profileError) {

        alert(profileError.message);

        await supabase.auth.signOut();

        return;

    }

    if (profile.role !== "admin") {

        alert("Access denied. Administrator account required.");

        await supabase.auth.signOut();

        return;

    }

    localStorage.setItem("adminName", profile.full_name);

    window.location.href = "pages/dashboard.html";

}

async function logout(){

    await supabase.auth.signOut();

    window.location.href="../index.html";

}
