let userGrowthChart = null;
let priceComplianceChart = null;
let marketActivityChart = null;
let dashboardChannel = null;
let refreshTimer = null;
let loadingDashboard = false;
let refreshQueued = false;

const chartColors = {
    primary: "#6658e8",
    green: "#27a879",
    red: "#d85c68",
    orange: "#e5a13c",
    blue: "#4386d9",
    gray: "#9298a7"
};

function getDatabase() {
    if (typeof db === "undefined" || !db) {
        throw new Error("Supabase client is unavailable. Check js/supabase.js.");
    }

    return db;
}

function setStatus(message, isError = false) {
    const element = document.getElementById("dashboardStatus");
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#c0392b" : "";
}

function selectedRange() {
    const filter = document.getElementById("dateFilter")?.value || "week";
    const start = new Date();
    const end = new Date();

    start.setHours(0, 0, 0, 0);

    if (filter === "week") {
        start.setDate(start.getDate() - 6);
    } else if (filter === "month") {
        start.setDate(start.getDate() - 29);
    } else if (filter === "year") {
        start.setMonth(0, 1);
    }

    return {
        start,
        end,
        startISO: start.toISOString(),
        endISO: end.toISOString()
    };
}

function rangeLabel() {
    const labels = {
        today: "Today",
        week: "Last 7 days",
        month: "Last 30 days",
        year: "This year"
    };

    return labels[document.getElementById("dateFilter")?.value || "week"];
}

function dateKey(value) {
    const date = new Date(value);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function dailyLabels(startDate, endDate) {
    const labels = [];
    const cursor = new Date(startDate);
    const last = new Date(endDate);

    cursor.setHours(0, 0, 0, 0);
    last.setHours(0, 0, 0, 0);

    while (cursor <= last) {
        labels.push({
            key: dateKey(cursor),
            label: cursor.toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric"
            })
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return labels;
}

function countsByDate(rows, field, labels) {
    const counts = new Map(labels.map(item => [item.key, 0]));

    for (const row of rows || []) {
        if (!row[field]) continue;

        const key = dateKey(row[field]);

        if (counts.has(key)) {
            counts.set(key, counts.get(key) + 1);
        }
    }

    return labels.map(item => counts.get(item.key));
}

function numberText(value) {
    return Number(value || 0).toLocaleString();
}

function chartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
            legend: {
                labels: {
                    usePointStyle: true,
                    pointStyle: "circle",
                    boxWidth: 8,
                    padding: 14,
                    font: { size: 11 }
                }
            },
            tooltip: {
                padding: 10,
                cornerRadius: 7
            }
        }
    };
}

function renderChart(existingChart, canvas, config) {
    if (existingChart) {
        existingChart.data = config.data;
        existingChart.options = config.options;
        existingChart.update();
        return existingChart;
    }

    return new Chart(canvas, config);
}

async function loadDashboard() {
    if (loadingDashboard) {
        refreshQueued = true;
        return;
    }

    loadingDashboard = true;

    const button = document.getElementById("refreshDashboard");

    if (button) {
        button.disabled = true;
        button.textContent = "Loading...";
    }

    setStatus("");

    try {
        await Promise.all([
            loadSummaryCards(),
            loadNotifications(),
            loadUserGrowthChart(),
            loadOrderActivityChart(),
            loadPriceComplianceChart()
        ]);

        setStatus(`Updated ${new Date().toLocaleTimeString("en-PH", {
            hour: "numeric",
            minute: "2-digit"
        })}`);
    } catch (error) {
        console.error("Dashboard error:", error);
        setStatus(error.message || "Unable to load dashboard data.", true);
    } finally {
        loadingDashboard = false;

        if (button) {
            button.disabled = false;
            button.textContent = "Refresh";
        }

        if (refreshQueued) {
            refreshQueued = false;
            loadDashboard();
        }
    }
}

async function loadSummaryCards() {
    const client = getDatabase();
    const range = selectedRange();

    const results = await Promise.all([
        client.from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "customer"),

        client.from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "seller"),

        client.from("orders")
            .select("user_id")
            .gte("created_at", range.startISO)
            .lte("created_at", range.endISO)
            .not("user_id", "is", null),

        client.from("order_items")
            .select("seller_id")
            .gte("created_at", range.startISO)
            .lte("created_at", range.endISO)
            .not("seller_id", "is", null)
    ]);

    const failed = results.find(result => result.error);
    if (failed) throw failed.error;

    const [customers, sellers, orders, items] = results;

    const activeCustomers = new Set(
        (orders.data || []).map(item => item.user_id).filter(Boolean)
    );

    const activeSellers = new Set(
        (items.data || []).map(item => item.seller_id).filter(Boolean)
    );

    document.getElementById("customerCount").textContent =
        numberText(customers.count);

    document.getElementById("sellerCount").textContent =
        numberText(sellers.count);

    document.getElementById("activeCustomerCount").textContent =
        numberText(activeCustomers.size);

    document.getElementById("activeSellerCount").textContent =
        numberText(activeSellers.size);
}

function relativeTime(value) {
    if (!value) return "";

    const seconds = Math.max(0, Math.floor((Date.now() - new Date(value)) / 1000));

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return new Date(value).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric"
    });
}

function addNotificationText(parent, className, value) {
    const element = document.createElement("p");
    element.className = className;
    element.textContent = value || "";
    parent.appendChild(element);
    return element;
}

async function loadNotifications() {
    const client = getDatabase();
    const list = document.getElementById("notificationList");
    const countElement = document.getElementById("notificationCount");

    const [countResult, listResult] = await Promise.all([
        client.from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false),

        client.from("notifications")
            .select("id, type, title, message, created_at, is_read")
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(3)
    ]);

    if (countResult.error) throw countResult.error;
    if (listResult.error) throw listResult.error;

    countElement.textContent = `${numberText(countResult.count)} unread`;
    list.replaceChildren();

    const notifications = listResult.data || [];

    if (!notifications.length) {
        const empty = document.createElement("li");
        empty.className = "notification-empty";
        empty.textContent = "You're all caught up.";
        list.appendChild(empty);
        return;
    }

    for (const notification of notifications) {
        const item = document.createElement("li");
        item.className = "notification-item";

        addNotificationText(
            item,
            "notification-title",
            notification.title || notification.type || "Notification"
        );

        addNotificationText(
            item,
            "notification-message",
            notification.message || "No details provided."
        );

        const time = document.createElement("span");
        time.className = "notification-time";
        time.textContent = relativeTime(notification.created_at);
        item.appendChild(time);

        list.appendChild(item);
    }
}

async function loadUserGrowthChart() {
    const client = getDatabase();
    const range = selectedRange();

    const { data, error } = await client.from("profiles")
        .select("created_at")
        .gte("created_at", range.startISO)
        .lte("created_at", range.endISO)
        .order("created_at");

    if (error) throw error;

    const labels = dailyLabels(range.start, range.end);
    const values = countsByDate(data, "created_at", labels);
    const canvas = document.getElementById("userGrowthChart");

    userGrowthChart = renderChart(userGrowthChart, canvas, {
        type: "line",
        data: {
            labels: labels.map(item => item.label),
            datasets: [{
                label: "New users",
                data: values,
                borderColor: chartColors.primary,
                backgroundColor: "rgba(102, 88, 232, 0.10)",
                fill: true,
                tension: 0.35,
                borderWidth: 2,
                pointRadius: values.length > 14 ? 0 : 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            ...chartOptions(),
            interaction: { intersect: false, mode: "index" },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, maxRotation: 0 }
                },
                y: {
                    beginAtZero: true,
                    ticks: { precision: 0 },
                    grid: { color: "rgba(130, 130, 130, 0.12)" }
                }
            }
        }
    });

    document.getElementById("growthRangeLabel").textContent = rangeLabel();
}

async function loadOrderActivityChart() {
    const client = getDatabase();
    const range = selectedRange();

    const { data, error } = await client.from("orders")
        .select("status, created_at")
        .gte("created_at", range.startISO)
        .lte("created_at", range.endISO);

    if (error) throw error;

    const statuses = ["Pending", "Accepted", "Ready", "Completed", "Cancelled", "Other"];
    const totals = Object.fromEntries(statuses.map(status => [status, 0]));

    for (const order of data || []) {
        const status = String(order.status || "").trim().toLowerCase();

        if (status === "pending") totals.Pending++;
        else if (status === "accepted") totals.Accepted++;
        else if (status === "ready") totals.Ready++;
        else if (status === "completed") totals.Completed++;
        else if (status === "cancelled" || status === "canceled") totals.Cancelled++;
        else totals.Other++;
    }

    marketActivityChart = renderChart(
        marketActivityChart,
        document.getElementById("marketActivityChart"),
        {
            type: "bar",
            data: {
                labels: statuses,
                datasets: [{
                    label: "Orders",
                    data: statuses.map(status => totals[status]),
                    backgroundColor: [
                        chartColors.orange,
                        chartColors.primary,
                        chartColors.blue,
                        chartColors.green,
                        chartColors.red,
                        chartColors.gray
                    ],
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 45
                }]
            },
            options: {
                ...chartOptions(),
                plugins: {
                    ...chartOptions().plugins,
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: { precision: 0 },
                        grid: { color: "rgba(130, 130, 130, 0.12)" }
                    }
                }
            }
        }
    );

    document.getElementById("orderRangeLabel").textContent = rangeLabel();
}

function normalizeName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findMarketPrice(product, marketPrices) {
    const name = normalizeName(product.name);
    const candidates = marketPrices.filter(
        item => normalizeName(item.product_name) === name
    );

    if (!candidates.length) return null;

    const category = normalizeName(product.category);

    return candidates.find(
        item => category && normalizeName(item.category) === category
    ) || candidates[0];
}

async function loadPriceComplianceChart() {
    const client = getDatabase();

    const [productsResult, marketResult] = await Promise.all([
        client.from("products")
            .select("name, price, category, is_active")
            .eq("is_active", true),

        client.from("market_prices")
            .select("product_name, category, min_price, max_price")
    ]);

    if (productsResult.error) throw productsResult.error;
    if (marketResult.error) throw marketResult.error;

    let within = 0;
    let above = 0;
    let below = 0;
    let unmatched = 0;

    const marketPrices = marketResult.data || [];

    for (const product of productsResult.data || []) {
        const market = findMarketPrice(product, marketPrices);

        if (!market) {
            unmatched++;
            continue;
        }

        const price = Number(product.price);
        const min = Number(market.min_price);
        const max = Number(market.max_price);

        if (
            !Number.isFinite(price) ||
            !Number.isFinite(min) ||
            !Number.isFinite(max) ||
            min > max
        ) {
            unmatched++;
        } else if (price < min) {
            below++;
        } else if (price > max) {
            above++;
        } else {
            within++;
        }
    }

    priceComplianceChart = renderChart(
        priceComplianceChart,
        document.getElementById("priceComplianceChart"),
        {
            type: "doughnut",
            data: {
                labels: ["Within range", "Above range", "Below range"],
                datasets: [{
                    data: [within, above, below],
                    backgroundColor: [
                        chartColors.green,
                        chartColors.red,
                        chartColors.orange
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                ...chartOptions(),
                cutout: "70%",
                plugins: {
                    ...chartOptions().plugins,
                    legend: {
                        position: "bottom",
                        labels: {
                            usePointStyle: true,
                            pointStyle: "circle",
                            boxWidth: 8,
                            padding: 12,
                            font: { size: 10 }
                        }
                    }
                }
            }
        }
    );

    document.getElementById("complianceNote").textContent =
        `${within + above + below} matched products · ${unmatched} unmatched or invalid`;
}

function scheduleDashboardRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(loadDashboard, 500);
}

function setupDashboardRealtime() {
    const client = getDatabase();

    if (dashboardChannel) {
        client.removeChannel(dashboardChannel);
    }

    const tables = [
        "profiles",
        "orders",
        "order_items",
        "products",
        "market_prices",
        "notifications"
    ];

    dashboardChannel = client.channel("pddm-dashboard-updates");

    for (const table of tables) {
        dashboardChannel.on(
            "postgres_changes",
            { event: "*", schema: "public", table },
            scheduleDashboardRefresh
        );
    }

    dashboardChannel.subscribe(status => {
        if (status === "CHANNEL_ERROR") {
            console.warn("Dashboard realtime connection failed.");
        }
    });
}

async function addAuditLog(action, module, description = "") {
    try {
        const client = getDatabase();
        const { data } = await client.auth.getUser();

        const { error } = await client.from("audit_logs").insert([{
            user_id: data?.user?.id || null,
            user: localStorage.getItem("adminName") || "Admin",
            action,
            module,
            description
        }]);

        if (error) console.error("Audit log error:", error.message);
    } catch (error) {
        console.error("Audit log error:", error.message);
    }
}

async function logout() {
    try {
        if (typeof db !== "undefined" && db?.auth) {
            await db.auth.signOut();
        }
    } catch (error) {
        console.error("Logout error:", error);
    }

    localStorage.removeItem("adminName");
    window.location.href = "../index.html";
}

/* =========================================
   ADMIN LOGIN
========================================= */

async function login() {
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const button = document.querySelector(".login-card button");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        alert("Please enter your email and password.");
        return;
    }

    if (typeof db === "undefined" || !db?.auth) {
        alert("Supabase is not initialized. Check js/supabase.js.");
        return;
    }

    button.disabled = true;
    button.textContent = "Logging in...";

    try {
        const { data, error } = await db.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            throw error;
        }

        const user = data.user;

        if (!user) {
            throw new Error("Unable to retrieve your user account.");
        }

        const { data: profile, error: profileError } = await db
            .from("profiles")
            .select("full_name, role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
            throw profileError;
        }

        if (!profile) {
            await db.auth.signOut();
            throw new Error("Your account profile was not found.");
        }

        if (String(profile.role || "").toLowerCase() !== "admin") {
            await db.auth.signOut();
            throw new Error("Access denied. Admin accounts only.");
        }

        localStorage.setItem(
            "adminName",
            profile.full_name || email
        );

        window.location.href = "pages/dashboard.html";

    } catch (error) {
        console.error("Login error:", error);
        alert(error.message || "Login failed. Please try again.");

    } finally {
        button.disabled = false;
        button.textContent = "Login";
    }
}
