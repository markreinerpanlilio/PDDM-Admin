async function login() {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {

        alert("Please enter your email and password.");

        return;

    }

    // Login

    const { data, error } = await db.auth.signInWithPassword({

        email: email,
        password: password

    });

    if (error) {

        alert(error.message);

        return;

    }

    const user = data.user;

    // Get Profile

    const { data: profile, error: profileError } = await db

        .from("profiles")

        .select("full_name, role")

        .eq("id", user.id)

        .single();

    if (profileError) {

        alert(profileError.message);

        await db.auth.signOut();

        return;

    }

    if (profile.role !== "admin") {

        alert("Access denied.");

        await db.auth.signOut();

        return;

    }

    localStorage.setItem("adminName", profile.full_name);

    window.location.href = "pages/dashboard.html";

}



// ==============================
// LOGOUT
// ==============================

async function logout(){

    await db.auth.signOut();

    localStorage.removeItem("adminName");

    window.location.href="../index.html";

}
