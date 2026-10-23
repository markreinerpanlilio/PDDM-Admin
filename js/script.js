const $ = (id) => document.getElementById(id);
const DAY_MS = 24 * 60 * 60 * 1000;

let userGrowthChart = null;
let marketActivityChart = null;
let priceComplianceChart = null;
let dashboardRealtimeChannel = null;
let dashboardRefreshTimer = null;
let dashboardLoading = false;

// AUTHENTICATION

async function login() {
    const email = $("email")?.value.trim();
    const password = $("password")?.value.trim();

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

    localStorage.setItem("adminName", profile.full_name || "Admin");

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

    if (error) {
        console.error("Audit log error:", error.message);
    }
}

// DASHBOARD

async function loadDashboard() {
    if (dashboardLoading) return;

    dashboardLoading = true;

    const status = $("dashboardStatus");

    if ($("welcome")) {
        $("welcome").textContent =
            `Welcome, ${localStorage.getItem("adminName") || "Admin"}`;
    }

    if (status) {
        status.textContent = "Loading dashboard data...";
    }

    try {
        await Promise.all([
            loadCounts(),
            loadUserGrowthChart(),
            loadOrderActivityChart(),
            loadPriceComplianceChart()
        ]);

        if (status) {
            status.textContent =
                `Last updated: ${new Date().toLocaleTimeString()}`;
        }
    } catch (error) {
        console.error("Dashboard loading error:", error);

        if (status) {
            status.textContent =
                "Some dashboard data could not be loaded. Check the console and database permissions.";
        }
    } finally {
        dashboardLoading = false;
    }
}

function getFilter() {
    return $("dateFilter")?.value || "today";
}

function getRange(filter = getFilter()) {
    const now = new Date();
    const start = new Date(now);

    if (filter === "today") {
        start.setHours(0, 0, 0, 0);
    } else if (filter === "week") {
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
    } else if (filter === "month") {
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
    } else {
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
    }

    return { start, end: now };
}

function makeDailyLabels(range) {
    const labels = [];
    const dates = [];

    const current = new Date(range.start);
    current.setHours(0, 0, 0, 0);

    const last = new Date(range.end);
    last.setHours(0, 0, 0, 0);

    while (current <= last) {
        const date = new Date(current);

        dates.push(date);
        labels.push(date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric"
        }));

        current.setDate(current.getDate() + 1);
    }

    return { labels, dates };
}

function dateKey(date) {
    const d = new Date(date);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function countRowsByDay(rows, dates, field = "created_at") {
    const counts = new Map(
        dates.map(date => [dateKey(date), 0])
    );

    for (const row of rows || []) {
        if (!row[field]) continue;

        const key = dateKey(row[field]);

        if (counts.has(key)) {
            counts.set(key, counts.get(key) + 1);
        }
    }

    return dates.map(date => counts.get(dateKey(date)) || 0);
}

function drawChart(existingChart, canvasId, config) {
    const canvas = $(canvasId);

    if (!canvas) return existingChart;

    if (existingChart) {
        existingChart.destroy();
    }

    return new Chart(canvas, config);
}

function getChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom"
            }
        }
    };
}

// USER COUNTS AND ACTIVITY

async function loadCounts() {
    const range = getRange();

    const [customersResult, sellersResult, ordersResult, itemsResult] =
        await Promise.all([
            db.from("profiles")
                .select("id", { count: "exact", head: true })
                .eq("role", "customer"),

            db.from("profiles")
                .select("id", { count: "exact", head: true })
                .eq("role", "seller"),

            db.from("orders")
                .select("user_id")
                .gte("created_at", range.start.toISOString())
                .lte("created_at", range.end.toISOString()),

            db.from("order_items")
                .select("seller_id")
                .gte("created_at", range.start.toISOString())
                .lte("created_at", range.end.toISOString())
        ]);

    const errors = [
        customersResult.error,
        sellersResult.error,
        ordersResult.error,
        itemsResult.error
    ].filter(Boolean);

    if (errors.length) {
        errors.forEach(error => console.error(error.message));
        throw new Error("Unable to load customer and seller counts.");
    }

    const activeCustomerIds = new Set(
        (ordersResult.data || [])
            .map(order => order.user_id)
            .filter(Boolean)
    );

    const activeSellerIds = new Set(
        (itemsResult.data || [])
            .map(item => item.seller_id)
            .filter(Boolean)
    );

    if ($("customerCount")) {
        $("customerCount").textContent = customersResult.count ?? 0;
    }

    if ($("sellerCount")) {
        $("sellerCount").textContent = sellersResult.count ?? 0;
    }

    if ($("activeCustomerCount")) {
        $("activeCustomerCount").textContent = activeCustomerIds.size;
    }

    if ($("activeSellerCount")) {
        $("activeSellerCount").textContent = activeSellerIds.size;
    }
}

// USER GROWTH: NEW PROFILES PER DAY

async function loadUserGrowthChart() {
    const range = getRange();

    const { data, error } = await db
        .from("profiles")
        .select("created_at")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString())
        .order("created_at", { ascending: true });

    if (error) throw error;

    const { labels, dates } = makeDailyLabels(range);
    const values = countRowsByDay(data || [], dates);

    userGrowthChart = drawChart(
        userGrowthChart,
        "userGrowthChart",
        {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label: "New Users",
                    data: values,
                    borderColor: "#7A1F1F",
                    backgroundColor: "rgba(122,31,31,0.15)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                ...getChartOptions(),
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        ticks: {
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 12
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        }
    );
}

// ORDER ACTIVITY: ACTUAL ORDERS BY CURRENT STATUS

async function loadOrderActivityChart() {
    const range = getRange();

    const { data, error } = await db
        .from("orders")
        .select("status")
        .gte("created_at", range.start.toISOString())
        .lte("created_at", range.end.toISOString());

    if (error) throw error;

    const statuses = [
        "pending",
        "accepted",
        "ready",
        "completed",
        "cancelled"
    ];

    const counts = Object.fromEntries(
        statuses.map(status => [status, 0])
    );

    let otherCount = 0;

    for (const order of data || []) {
        const status = String(order.status || "")
            .trim()
            .toLowerCase();

        if (Object.prototype.hasOwnProperty.call(counts, status)) {
            counts[status]++;
        } else {
            otherCount++;
        }
    }

    const labels = [
        "Pending",
        "Accepted",
        "Ready",
        "Completed",
        "Cancelled"
    ];

    const values = statuses.map(status => counts[status]);

    if (otherCount > 0) {
        labels.push("Other");
        values.push(otherCount);
    }

    marketActivityChart = drawChart(
        marketActivityChart,
        "marketActivityChart",
        {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Orders",
                    data: values,
                    backgroundColor: [
                        "#FFC107",
                        "#7A1F1F",
                        "#2196F3",
                        "#4CAF50",
                        "#F44336",
                        "#9E9E9E"
                    ],
                    borderRadius: 6
                }]
            },
            options: {
                ...getChartOptions(),
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        }
    );
}

// PRICE COMPLIANCE: PRODUCT PRICE VS. MARKET PRICE RANGE

function normalizeProductName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normalizeText(value) {
    return String(value || "")
        .trim()
        .toLowerCase();
}

function findMarketPrice(product, marketPrices) {
    const productName = normalizeProductName(product.name);

    if (!productName) return null;

    const candidates = marketPrices.filter(item =>
        normalizeProductName(item.product_name) === productName
    );

    if (!candidates.length) return null;

    // Prefer matching category and pricing type when both are provided.
    const exactCandidates = candidates.filter(item => {
        const categoryMatches =
            !product.category ||
            !item.category ||
            normalizeText(product.category) === normalizeText(item.category);

        const pricingMatches =
            !product.pricing_type ||
            !item.pricing_type ||
            normalizeText(product.pricing_type) === normalizeText(item.pricing_type);

        return categoryMatches && pricingMatches;
    });

    return exactCandidates[0] || candidates[0];
}

async function loadPriceComplianceChart() {
    const [productsResult, marketPricesResult] = await Promise.all([
        db.from("products")
            .select("name,price,category,pricing_type,is_active")
            .eq("is_active", true),

        db.from("market_prices")
            .select("product_name,min_price,max_price,category,pricing_type")
    ]);

    if (productsResult.error) throw productsResult.error;
    if (marketPricesResult.error) throw marketPricesResult.error;

    const products = productsResult.data || [];
    const marketPrices = marketPricesResult.data || [];

    let withinRange = 0;
    let aboveRange = 0;
    let belowRange = 0;
    let unmatched = 0;

    for (const product of products) {
        const price = Number(product.price);

        if (!Number.isFinite(price)) {
            unmatched++;
            continue;
        }

        const marketPrice = findMarketPrice(product, marketPrices);

        if (!marketPrice) {
            unmatched++;
            continue;
        }

        const minPrice = Number(marketPrice.min_price);
        const maxPrice = Number(marketPrice.max_price);

        if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
            unmatched++;
            continue;
        }

        if (price < minPrice) {
            belowRange++;
        } else if (price > maxPrice) {
            aboveRange++;
        } else {
            withinRange++;
        }
    }

    const matchedCount = withinRange + aboveRange + belowRange;
    const note = $("priceComplianceNote");

    if (note) {
        note.textContent = matchedCount
            ? `${matchedCount} active products compared with market-price ranges. ${unmatched} unmatched or incomplete records excluded.`
            : "No active products could be matched to complete market-price ranges.";
    }

    priceComplianceChart = drawChart(
        priceComplianceChart,
        "priceComplianceChart",
        {
            type: "doughnut",
            data: {
                labels: ["Within Range", "Above Range", "Below Range"],
                datasets: [{
                    data: [withinRange, aboveRange, belowRange],
                    backgroundColor: ["#4CAF50", "#FFC107", "#F44336"]
                }]
            },
            options: {
                ...getChartOptions(),
                cutout: "60%"
            }
        }
    );
}

// REALTIME UPDATES

function setupDashboardRealtime() {
    if (dashboardRealtimeChannel) {
        db.removeChannel(dashboardRealtimeChannel);
        dashboardRealtimeChannel = null;
    }

    const tables = [
        "profiles",
        "orders",
        "order_items",
        "products",
        "market_prices"
    ];

    let channel = db.channel("admin-dashboard-live");

    for (const table of tables) {
        channel = channel.on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table
            },
            () => scheduleDashboardRefresh()
        );
    }

    dashboardRealtimeChannel = channel.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error(
                "Dashboard Realtime subscription issue:",
                status
            );
        }
    });
}

function scheduleDashboardRefresh() {
    if (dashboardRefreshTimer) {
        clearTimeout(dashboardRefreshTimer);
    }

    dashboardRefreshTimer = setTimeout(() => {
        loadDashboard();
    }, 500);
}

// EVENTS

document.addEventListener("DOMContentLoaded", () => {
    $("dateFilter")?.addEventListener("change", () => {
        loadDashboard();
    });
});
