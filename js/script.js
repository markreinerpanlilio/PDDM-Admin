let userGrowthChart = null;
let priceComplianceChart = null;
let marketActivityChart = null;
let dashboardChannel = null;
let dashboardLoading = false;
let refreshRequested = false;

function getDatabase() {
    if (typeof db !== "undefined" && db) {
        return db;
    }

    throw new Error(
        "Supabase client was not found. Check js/supabase.js and its script order."
    );
}

function setDashboardStatus(message, isError = false) {
    const element = document.getElementById("dashboardStatus");

    if (!element) return;

    element.textContent = message || "";
    element.style.color = isError ? "#d64545" : "#858b9e";
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString();
}

function getSelectedRange() {
    const filter = document.getElementById("dateFilter")?.value || "week";
    const now = new Date();

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (filter === "today") {
        // Keep today's data in the selected range.
    } else if (filter === "week") {
        start.setDate(start.getDate() - 6);
    } else if (filter === "month") {
        start.setDate(start.getDate() - 29);
    } else if (filter === "year") {
        start.setMonth(0, 1);
    }

    return {
        filter,
        start,
        end: now,
        startISO: start.toISOString(),
        endISO: now.toISOString()
    };
}

function getRangeLabel() {
    const labels = {
        today: "Today",
        week: "Last 7 days",
        month: "Last 30 days",
        year: "This year"
    };

    return labels[
        document.getElementById("dateFilter")?.value || "week"
    ] || "Last 7 days";
}

function createDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function createDailyLabels(startDate, endDate) {
    const labels = [];
    const cursor = new Date(startDate);
    const lastDate = new Date(endDate);

    cursor.setHours(0, 0, 0, 0);
    lastDate.setHours(0, 0, 0, 0);

    while (cursor <= lastDate) {
        labels.push({
            key: createDateKey(cursor),
            label: cursor.toLocaleDateString("en-PH", {
                month: "short",
                day: "numeric"
            })
        });

        cursor.setDate(cursor.getDate() + 1);
    }

    return labels;
}

function countByDay(rows, dateField, labels) {
    const counts = Object.fromEntries(
        labels.map(item => [item.key, 0])
    );

    (rows || []).forEach(row => {
        if (!row[dateField]) return;

        const date = new Date(row[dateField]);

        if (Number.isNaN(date.getTime())) return;

        const key = createDateKey(date);

        if (Object.prototype.hasOwnProperty.call(counts, key)) {
            counts[key]++;
        }
    });

    return labels.map(item => counts[item.key] || 0);
}

function destroyChart(chart) {
    if (chart) chart.destroy();
}

function chartDefaults() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 350
        },
        plugins: {
            legend: {
                labels: {
                    usePointStyle: true,
                    pointStyle: "circle",
                    boxWidth: 8,
                    padding: 16,
                    color: "#858b9e",
                    font: {
                        size: 11
                    }
                }
            },
            tooltip: {
                backgroundColor: "#202436",
                padding: 11,
                cornerRadius: 8,
                titleFont: {
                    size: 12
                },
                bodyFont: {
                    size: 12
                }
            }
        }
    };
}

async function loadDashboard() {
    if (dashboardLoading) {
        refreshRequested = true;
        return;
    }

    dashboardLoading = true;

    const refreshButton = document.getElementById("refreshDashboard");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Loading...";
    }

    setDashboardStatus("");

    try {
        await Promise.all([
            loadCounts(),
            loadUserGrowthChart(),
            loadOrderActivityChart(),
            loadPriceComplianceChart()
        ]);

        setDashboardStatus(
            `Updated ${new Date().toLocaleTimeString("en-PH", {
                hour: "numeric",
                minute: "2-digit"
            })}`
        );
    } catch (error) {
        console.error("Dashboard loading error:", error);
        setDashboardStatus(
            error.message || "Unable to load dashboard data.",
            true
        );
    } finally {
        dashboardLoading = false;

        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh";
        }

        if (refreshRequested) {
            refreshRequested = false;
            loadDashboard();
        }
    }
}

async function loadCounts() {
    const client = getDatabase();
    const range = getSelectedRange();

    const [
        customersResult,
        sellersResult,
        ordersResult,
        itemsResult,
        notificationsResult
    ] = await Promise.all([
        client
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "customer"),

        client
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "seller"),

        client
            .from("orders")
            .select("user_id")
            .gte("created_at", range.startISO)
            .lte("created_at", range.endISO)
            .not("user_id", "is", null),

        client
            .from("order_items")
            .select("seller_id")
            .gte("created_at", range.startISO)
            .lte("created_at", range.endISO)
            .not("seller_id", "is", null),

        client
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .eq("is_read", false)
    ]);

    const results = [
        customersResult,
        sellersResult,
        ordersResult,
        itemsResult,
        notificationsResult
    ];

    const failed = results.find(result => result.error);

    if (failed) throw failed.error;

    const activeCustomers = new Set(
        (ordersResult.data || [])
            .map(order => order.user_id)
            .filter(Boolean)
    );

    const activeSellers = new Set(
        (itemsResult.data || [])
            .map(item => item.seller_id)
            .filter(Boolean)
    );

    document.getElementById("customerCount").textContent =
        formatNumber(customersResult.count);

    document.getElementById("sellerCount").textContent =
        formatNumber(sellersResult.count);

    document.getElementById("activeCustomerCount").textContent =
        formatNumber(activeCustomers.size);

    document.getElementById("activeSellerCount").textContent =
        formatNumber(activeSellers.size);

    document.getElementById("notificationCount").textContent =
        formatNumber(notificationsResult.count);
}

async function loadUserGrowthChart() {
    const client = getDatabase();
    const range = getSelectedRange();

    const { data, error } = await client
        .from("profiles")
        .select("created_at")
        .gte("created_at", range.startISO)
        .lte("created_at", range.endISO)
        .order("created_at", { ascending: true });

    if (error) throw error;

    const labels = createDailyLabels(range.start, range.end);
    const values = countByDay(data, "created_at", labels);

    const canvas = document.getElementById("userGrowthChart");
    if (!canvas) return;

    destroyChart(userGrowthChart);

    userGrowthChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: labels.map(item => item.label),
            datasets: [{
                label: "New users",
                data: values,
                borderColor: "#6658e8",
                backgroundColor: "rgba(102, 88, 232, 0.10)",
                fill: true,
                tension: 0.38,
                borderWidth: 2.5,
                pointRadius: values.length > 14 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: "#6658e8"
            }]
        },
        options: {
            ...chartDefaults(),
            interaction: {
                intersect: false,
                mode: "index"
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: "#858b9e",
                        maxTicksLimit: 8,
                        maxRotation: 0
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "#f0f1f6"
                    },
                    border: {
                        display: false,
                        dash: [4, 4]
                    },
                    ticks: {
                        color: "#858b9e",
                        precision: 0
                    }
                }
            }
        }
    });

    const label = document.getElementById("growthRangeLabel");
    if (label) label.textContent = getRangeLabel();
}

async function loadOrderActivityChart() {
    const client = getDatabase();
    const range = getSelectedRange();

    const { data, error } = await client
        .from("orders")
        .select("status, created_at")
        .gte("created_at", range.startISO)
        .lte("created_at", range.endISO)
        .order("created_at", { ascending: true });

    if (error) throw error;

    const statuses = [
        "Pending",
        "Accepted",
        "Ready",
        "Completed",
        "Cancelled",
        "Other"
    ];

    const counts = Object.fromEntries(
        statuses.map(status => [status, 0])
    );

    (data || []).forEach(order => {
        const status = String(order.status || "")
            .trim()
            .toLowerCase();

        if (status === "pending") {
            counts.Pending++;
        } else if (status === "accepted") {
            counts.Accepted++;
        } else if (status === "ready") {
            counts.Ready++;
        } else if (status === "completed") {
            counts.Completed++;
        } else if (status === "cancelled" || status === "canceled") {
            counts.Cancelled++;
        } else {
            counts.Other++;
        }
    });

    const canvas = document.getElementById("marketActivityChart");
    if (!canvas) return;

    destroyChart(marketActivityChart);

    marketActivityChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: statuses,
            datasets: [{
                label: "Orders",
                data: statuses.map(status => counts[status]),
                backgroundColor: [
                    "#f3b64d",
                    "#6658e8",
                    "#3984e8",
                    "#27b879",
                    "#e46b79",
                    "#a5a9b8"
                ],
                borderRadius: 7,
                borderSkipped: false,
                maxBarThickness: 46
            }]
        },
        options: {
            ...chartDefaults(),
            plugins: {
                ...chartDefaults().plugins,
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: "#858b9e"
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: "#f0f1f6"
                    },
                    border: {
                        display: false,
                        dash: [4, 4]
                    },
                    ticks: {
                        precision: 0,
                        color: "#858b9e"
                    }
                }
            }
        }
    });

    const label = document.getElementById("orderRangeLabel");
    if (label) label.textContent = getRangeLabel();
}

function normalizeProductName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normalizeCategory(category) {
    return String(category || "")
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

    // Prefer a category match when the product has a category.
    const category = normalizeCategory(product.category);

    if (category) {
        const categoryMatches = candidates.filter(item =>
            normalizeCategory(item.category) === category
        );

        if (categoryMatches.length) {
            return categoryMatches[0];
        }
    }

    return candidates[0];
}

async function loadPriceComplianceChart() {
    const client = getDatabase();

    const [
        productsResult,
        marketPricesResult
    ] = await Promise.all([
        client
            .from("products")
            .select("name, price, category, is_active")
            .eq("is_active", true),

        client
            .from("market_prices")
            .select("product_name, category, min_price, max_price")
    ]);

    if (productsResult.error) throw productsResult.error;
    if (marketPricesResult.error) throw marketPricesResult.error;

    const products = productsResult.data || [];
    const marketPrices = marketPricesResult.data || [];

    let withinRange = 0;
    let aboveRange = 0;
    let belowRange = 0;
    let unmatched = 0;

    products.forEach(product => {
        const marketPrice = findMarketPrice(product, marketPrices);

        if (!marketPrice) {
            unmatched++;
            return;
        }

        const productPrice = Number(product.price);
        const minPrice = Number(marketPrice.min_price);
        const maxPrice = Number(marketPrice.max_price);

        if (
            !Number.isFinite(productPrice) ||
            !Number.isFinite(minPrice) ||
            !Number.isFinite(maxPrice) ||
            minPrice > maxPrice
        ) {
            unmatched++;
            return;
        }

        if (productPrice < minPrice) {
            belowRange++;
        } else if (productPrice > maxPrice) {
            aboveRange++;
        } else {
            withinRange++;
        }
    });

    const canvas = document.getElementById("priceComplianceChart");
    if (!canvas) return;

    destroyChart(priceComplianceChart);

    priceComplianceChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: [
                "Within range",
                "Above range",
                "Below range"
            ],
            datasets: [{
                data: [
                    withinRange,
                    aboveRange,
                    belowRange
                ],
                backgroundColor: [
                    "#27b879",
                    "#e46b79",
                    "#f3b64d"
                ],
                borderWidth: 0,
                hoverOffset: 5
            }]
        },
        options: {
            ...chartDefaults(),
            cutout: "72%",
            plugins: {
                ...chartDefaults().plugins,
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        pointStyle: "circle",
                        boxWidth: 8,
                        padding: 15,
                        color: "#858b9e",
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });

    const note = document.getElementById("complianceNote");

    if (note) {
        note.textContent =
            `${withinRange + aboveRange + belowRange} matched products · ` +
            `${unmatched} unmatched or invalid`;
    }
}

function setupDashboardRealtime() {
    try {
        const client = getDatabase();

        // Prevent duplicate subscriptions when setup is called again.
        if (dashboardChannel) {
            client.removeChannel(dashboardChannel);
            dashboardChannel = null;
        }

        dashboardChannel = client
            .channel("admin-dashboard-live-updates")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "profiles"
                },
                scheduleDashboardRefresh
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders"
                },
                scheduleDashboardRefresh
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "order_items"
                },
                scheduleDashboardRefresh
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "products"
                },
                scheduleDashboardRefresh
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "market_prices"
                },
                scheduleDashboardRefresh
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "notifications"
                },
                scheduleDashboardRefresh
            )
            .subscribe(status => {
                if (status === "CHANNEL_ERROR") {
                    console.warn(
                        "Dashboard realtime connection failed. Check Supabase Realtime settings."
                    );
                }
            });
    } catch (error) {
        console.error("Realtime setup error:", error);
    }
}

let refreshTimeout = null;

function scheduleDashboardRefresh() {
    clearTimeout(refreshTimeout);

    refreshTimeout = setTimeout(() => {
        loadDashboard();
    }, 500);
}

/* -----------------------------
   AUTH / EXISTING UTILITIES
----------------------------- */

async function addAuditLog(action, module, description = "") {
    try {
        const client = getDatabase();
        const userName = localStorage.getItem("adminName") || "Admin";

        const { data: authData } = await client.auth.getUser();
        const userId = authData?.user?.id || null;

        const { error } = await client
            .from("audit_logs")
            .insert([{
                user_id: userId,
                user: userName,
                action,
                module,
                description
            }]);

        if (error) {
            console.error("Audit log error:", error.message);
        }
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
