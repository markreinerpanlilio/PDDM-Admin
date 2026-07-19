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

        email: email,
        password: password

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

        alert("Access Denied.");
        await db.auth.signOut();
        return;

    }

    localStorage.setItem("adminName", profile.full_name);

    window.location.href = "pages/dashboard.html";

}



// ==========================================
// LOGOUT
// ==========================================

async function logout() {

    await db.auth.signOut();

    localStorage.removeItem("adminName");

    window.location.href = "../index.html";

}



// ==========================================
// LOAD DASHBOARD
// ==========================================

async function loadDashboard() {

    const welcome = document.getElementById("welcome");

    if (welcome) {

        welcome.textContent =
            "Welcome, " + (localStorage.getItem("adminName") || "Admin");

    }

    await loadCounts();

}



// ==========================================
// LOAD COUNTS
// ==========================================

async function loadCounts() {

    // Customers

    const { count: customerCount } = await db

        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "customer");

    document.getElementById("customerCount").textContent = customerCount ?? 0;



    // Sellers

    const { count: sellerCount } = await db

        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "seller");

    document.getElementById("sellerCount").textContent = sellerCount ?? 0;



    // Active Customers
    // (Temporary)

    document.getElementById("activeCustomerCount").textContent = 0;



    // Active Sellers
    // (Temporary)

    document.getElementById("activeSellerCount").textContent = 0;

}



// ==========================================
// SIDEBAR
// ==========================================

function toggleSidebar() {

    const sidebar = document.getElementById("sidebar");

    const content = document.getElementById("content");

    sidebar.classList.toggle("collapsed");

    if (sidebar.classList.contains("collapsed")) {

        content.classList.remove("expanded-content");

        content.classList.add("collapsed-content");

    }

    else {

        content.classList.remove("collapsed-content");

        content.classList.add("expanded-content");

    }

}



// ==========================================
// CHARTS
// ==========================================

let userGrowthChart;
let marketActivityChart;
let priceComplianceChart;

function initializeCharts() {

    // ======================================
    // USER GROWTH
    // ======================================

    const growthCtx = document.getElementById("userGrowthChart");

    if (growthCtx) {

        userGrowthChart = new Chart(growthCtx, {

            type: "line",

            data: {

                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],

                datasets: [{

                    label: "New Users",

                    data: [3, 6, 8, 7, 10, 12, 9],

                    borderColor: "#7A1F1F",

                    backgroundColor: "rgba(122,31,31,.15)",

                    fill: true,

                    tension: .4

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {

                        display: false

                    }

                }

            }

        });

    }



    // ======================================
    // MARKET ACTIVITY
    // ======================================

    const marketCtx = document.getElementById("marketActivityChart");

    if (marketCtx) {

        marketActivityChart = new Chart(marketCtx, {

            type: "bar",

            data: {

                labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],

                datasets: [{

                    label: "Orders",

                    data: [15, 20, 18, 24, 29, 16, 12],

                    backgroundColor: "#7A1F1F",

                    borderRadius: 8

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {

                        display: false

                    }

                }

            }

        });

    }



    // ======================================
    // PRICE COMPLIANCE
    // ======================================

    const priceCtx = document.getElementById("priceComplianceChart");

    if (priceCtx) {

        priceComplianceChart = new Chart(priceCtx, {

            type: "doughnut",

            data: {

                labels: [

                    "Within Range",

                    "Above",

                    "Below"

                ],

                datasets: [{

                    data: [70, 20, 10],

                    backgroundColor: [

                        "#4CAF50",

                        "#FFC107",

                        "#F44336"

                    ]

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false

            }

        });

    }

}
