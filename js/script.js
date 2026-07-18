// ==========================================
// LOGIN
// ==========================================

async function login() {

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!email || !password) {

        alert("Please enter your email and password.");
        return;

    }

    const { data, error } = await db.auth.signInWithPassword({

        email,
        password

    });

    if (error) {

        alert(error.message);
        return;

    }

    const user = data.user;

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



// ==========================================
// DASHBOARD
// ==========================================

async function loadDashboard() {

    const { data: sessionData } = await db.auth.getUser();

    if (!sessionData.user) {

        window.location.href = "../index.html";

        return;

    }

    const { data: profile } = await db

        .from("profiles")

        .select("role")

        .eq("id", sessionData.user.id)

        .single();

    if (!profile || profile.role !== "admin") {

        await db.auth.signOut();

        window.location.href = "../index.html";

        return;

    }

    // CUSTOMER COUNT

    const { count: customerCount } = await db

        .from("profiles")

        .select("*", {

            count: "exact",
            head: true

        })

        .eq("role", "customer");


    // SELLER COUNT

    const { count: sellerCount } = await db

        .from("profiles")

        .select("*", {

            count: "exact",
            head: true

        })

        .eq("role", "seller");


    document.getElementById("customerCount").textContent = customerCount;

    document.getElementById("sellerCount").textContent = sellerCount;

}



// ==========================================
// LOGOUT
// ==========================================

async function logout(){

    await db.auth.signOut();

    localStorage.removeItem("adminName");

    window.location.href="../index.html";

}
