```javascript
const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;

const db = supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_ANON_KEY
);

let userGrowthChart = null;
let marketActivityChart = null;
let priceComplianceChart = null;

// Auth
async function login() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value.trim();

    if (!email || !password) {
        alert("Please enter your email and password.");
        return;
    }

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        alert(error.message);
        return;
    }

    const user = data.user;

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("full_name,email,role")
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

    await addAuditLog(
        "Login",
        "Authentication",
        `${profile.email} logged in.`
    );

    window.location.href = "pages/dashboard.html";
}

async function logout() {
    const { data: { user } } = await db.auth.getUser();

    if (user) {
        const { data: admin } = await db
            .from("profiles")
            .select("email")
            .eq("id", user.id)
            .single();

        await addAuditLog(
            "Logout",
            "Authentication",
            `${admin?.email || user.email} logged out.`
        );
    }

    await db.auth.signOut();
    localStorage.removeItem("adminName");

    window.location.href = "../index.html";
}

async function addAuditLog(action, module, description) {
    const { data: { user } } = await db.auth.getUser();

    if (!user) return;

    const { data: admin } = await db
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single();

    const { error } = await db.from("audit_logs").insert([{
        user_id: user.id,
        user: `Admin(${admin?.email || user.email})`,
        action,
        module,
        description
    }]);

    if (error) console.error("Audit log error:", error.message);
}

// Dashboard
async function loadDashboard() {
    if ($("welcome")) {
        $("welcome").textContent =
            `Welcome, ${localStorage.getItem("adminName") || "Admin"}`;
    }

    await loadCounts();
}

async function loadCounts() {
    const [customers, sellers] = await Promise.all([
        db.from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "customer"),
        db.from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "seller")
    ]);

    if (customers.error) console.error(customers.error.message);
    if (sellers.error) console.error(sellers.error.message);

    if ($("customerCount")) $("customerCount").textContent = customers.count ?? 0;
    if ($("sellerCount")) $("sellerCount").textContent = sellers.count ?? 0;

    if ($("activeCustomerCount")) $("activeCustomerCount").textContent = 0;
    if ($("activeSellerCount")) $("activeSellerCount").textContent = 0;
}

// Sidebar
function toggleSidebar() {
    const sidebar = $("sidebar");
    const content = $("content");

    if (!sidebar || !content) return;

    sidebar.classList.toggle("collapsed");
    content.classList.toggle(
        "collapsed-content",
        sidebar.classList.contains("collapsed")
    );
    content.classList.toggle(
        "expanded-content",
        !sidebar.classList.contains("collapsed")
    );
}

// Filters
function getFilter() {
    return $("dateFilter")?.value || "today";
}

function getRange(filter) {
    const now = new Date();
    const start = new Date(now);

    if (filter === "today") {
        start.setHours(0, 0, 0, 0);
        return { start, end: now, type: "hour" };
    }

    if (filter === "week") {
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        return { start, end: now, type: "day" };
    }

    if (filter === "month") {
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        return { start, end: now, type: "day" };
    }

    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, type: "month" };
}

function makeLabels(range) {
    if (range.type === "hour") {
        return Array.from(
            { length: 24 },
            (_, h) => `${h % 12 || 12}${h < 12 ? "AM" : "PM"}`
        );
    }

    if (range.type === "day") {
        const labels = [];
        const totalDays = Math.floor(
            (new Date(range.end).setHours(0, 0, 0, 0) -
            range.start.getTime()) / DAY_MS
        ) + 1;

        for (let i = 0; i < totalDays; i++) {
            const d = new Date(range.start);
            d.setDate(d.getDate() + i);
            labels.push(
                d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric"
                })
            );
        }

        return labels;
    }

    return [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];
}

function bucketIndex(date, range) {
    if (range.type === "hour") return date.getHours();

    if (range.type === "day") {
        const day = new Date(date);
        day.setHours(0, 0, 0, 0);
        return Math.floor(
            (day.getTime() - range.start.getTime()) / DAY_MS
        );
    }

    return date.getMonth();
}

function zeroArray(n) {
    return Array.from({ length: n }, () => 0);
}

function buildCounts(rows, range, labelCount, field = "created_at") {
    const counts = zeroArray(labelCount);

    rows.forEach((row) => {
        if (!row[field]) return;

        const date = new Date(row[field]);
        const index = bucketIndex(date, range);

        if (index >= 0 && index < counts.length) {
            counts[index]++;
        }
    });

    return counts;
}

function drawChart(existingChart, canvasId, config) {
    const canvas = $(canvasId);
    if (!canvas) return existingChart;

    if (existingChart) existingChart.destroy();

    return new Chart(canvas, config);
}

// Charts
async function initializeCharts() {
    await loadUserGrowthChart();
    await loadMarketActivityChart();
    loadPriceComplianceChart();
}

async function loadUserGrowthChart() {
    const range = getRange(getFilter());

    const { data, error } = await db
        .from("profiles")
        .select("created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());

    if (error) {
        console.error(error.message);
        return;
    }

    const labels = makeLabels(range);
    const values = buildCounts(data || [], range, labels.length);

    userGrowthChart = drawChart(userGrowthChart, "userGrowthChart", {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "New Users",
                data: values,
                borderColor: "#7A1F1F",
                backgroundColor: "rgba(122,31,31,.15)",
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxRotation: 0, autoSkip: true } }
            }
        }
    });
}

async function loadMarketActivityChart() {
    const range = getRange(getFilter());

    const { data, error } = await db
        .from("orders")
        .select("created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());

    if (error) {
        console.error(error.message);
        return;
    }

    const labels = makeLabels(range);
    const values = buildCounts(data || [], range, labels.length);

    marketActivityChart = drawChart(marketActivityChart, "marketActivityChart", {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Orders",
                data: values,
                backgroundColor: "#7A1F1F",
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxRotation: 0, autoSkip: true } }
            }
        }
    });
}

function loadPriceComplianceChart() {
    priceComplianceChart = drawChart(
        priceComplianceChart,
        "priceComplianceChart",
        {
            type: "doughnut",
            data: {
                labels: ["Within Range", "Above Range", "Below Range"],
                datasets: [{
                    data: [70, 20, 10],
                    backgroundColor: ["#4CAF50", "#FFC107", "#F44336"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        }
    );
}

// Events
document.addEventListener("DOMContentLoaded", () => {
    $("dateFilter")?.addEventListener("change", initializeCharts);
});
```
