
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
        const results=await Promise.allSettled([
            loadSummaryCards(),loadNotifications(),loadUserGrowthChart(),
            loadOrderActivityChart(),loadPriceComplianceChart()
        ]);
        const errors=results.filter(r=>r.status==="rejected").map(r=>r.reason?.message||"Unknown error");
        if(errors.length)throw new Error(errors.join(" | "));

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
    const [profilesResult, ordersResult, itemsResult] = await Promise.all([
        client.from("profiles").select("id,role,seller_status,seller_application"),
        fetchAllRows(client.from("orders").select("user_id").gte("created_at",range.startISO).lte("created_at",range.endISO)),
        fetchAllRows(client.from("order_items").select("seller_id").gte("created_at",range.startISO).lte("created_at",range.endISO))
    ]);
    if(profilesResult.error) throw profilesResult.error;
    const profiles=profilesResult.data||[];
    const users=profiles.filter(p=>["customer","seller"].includes(String(p.role||"").toLowerCase()));
    // Adjust these values if your application workflow uses different status labels.
    const applicants=profiles.filter(p=>{
        const status=String(p.seller_status||"").trim().toLowerCase();
        const application=String(p.seller_application||"").trim().toLowerCase();
        return ["pending","under review","submitted"].includes(status) ||
            ["pending","under review","submitted"].includes(application);
    });
    const customers=new Set(users.filter(p=>String(p.role).toLowerCase()==="customer").map(p=>p.id));
    const sellers=new Set(users.filter(p=>String(p.role).toLowerCase()==="seller").map(p=>p.id));
    const activeCustomers=new Set(ordersResult.map(o=>o.user_id).filter(id=>customers.has(id)));
    const activeSellers=new Set(itemsResult.map(i=>i.seller_id).filter(id=>sellers.has(id)));
    document.getElementById("totalUsersCount").textContent=numberText(users.length);
    document.getElementById("applicantCount").textContent=numberText(new Set(applicants.map(p=>p.id)).size);
    document.getElementById("activeCustomerCount").textContent=numberText(activeCustomers.size);
    document.getElementById("activeSellerCount").textContent=numberText(activeSellers.size);
}
async function fetchAllRows(query) {
    const all=[];
    for(let from=0;from<100000;from+=1000){
        const {data,error}=await query.range(from,from+999);
        if(error)throw error;
        all.push(...(data||[]));
        if(!data||data.length<1000)return all;
    }
    throw new Error("Dashboard data exceeds safe fetch limit; add an aggregate RPC.");
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
    const client=getDatabase();
    const list=document.getElementById("dashboardNotificationList");
    const count=document.getElementById("unreadNotificationCount");
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user){list.innerHTML='<li class="notification-empty">Please sign in.</li>';return;}
    const [recent,unread,applicants]=await Promise.all([
        client.from("notifications").select("id,title,message,is_read,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(8),
        client.from("notifications").select("id",{head:true,count:"exact"}).eq("user_id",user.id).eq("is_read",false),
        client.from("profiles").select("id,seller_status,seller_application")
    ]);
    for(const r of [recent,unread,applicants])if(r.error)throw r.error;
    const pending=(applicants.data||[]).filter(p=>["pending","submitted","under review"].includes(String(p.seller_status||"").toLowerCase())||["pending","submitted","under review"].includes(String(p.seller_application||"").toLowerCase())).length;
    count.textContent=`Unread: ${unread.count||0}`;
    list.replaceChildren();
    if(pending){
        const li=document.createElement("li");li.className="unread";
        const detail=document.createElement("div");detail.className="notification-details";
        const title=document.createElement("div");title.className="notification-title";title.textContent=`${pending} pending seller application(s)`;
        const message=document.createElement("div");message.className="notification-message";message.textContent="Review applicants in Seller Requests.";
        detail.append(title,message);li.append(detail);list.append(li);
    }
    for(const n of recent.data||[]){
        const li=document.createElement("li");if(!n.is_read)li.className="unread";
        const detail=document.createElement("div");detail.className="notification-details";
        for(const [cls,val] of [["notification-title",n.title||"Notification"],["notification-message",n.message||""],["notification-time",relativeTime(n.created_at)]]){
            const el=document.createElement("div");el.className=cls;el.textContent=val;detail.append(el);
        }
        li.append(detail);list.append(li);
    }
    if(!list.children.length){const li=document.createElement("li");li.className="notification-empty";li.textContent="No notifications or pending applications.";list.append(li);}
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
    const range=selectedRange();
    const orders=await fetchAllRows(getDatabase().from("orders").select("status,created_at").eq("status","completed").gte("created_at",range.startISO).lte("created_at",range.endISO).order("created_at"));
    const labels=dailyLabels(range.start,range.end);
    const totals=countsByDate(orders,"created_at",labels);
    marketActivityChart=renderChart(marketActivityChart,document.getElementById("marketActivityChart"),{
        type:"bar",data:{labels:labels.map(x=>x.label),datasets:[{label:"Completed orders",data:totals,backgroundColor:chartColors.green,borderRadius:6,maxBarThickness:38}]},
        options:{...chartOptions(),scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12}},y:{beginAtZero:true,ticks:{precision:0}}}}
    });
    document.getElementById("orderRangeLabel").textContent=`${rangeLabel()} · ${orders.length} completed orders`;
}

function normalizeName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findMarketPrice(product, prices) {
    const matches=prices.filter(m=>normalizeName(m.product_name)===normalizeName(product.name)
        && (!m.category||normalizeName(m.category)===normalizeName(product.category))
        && (!m.pricing_type||normalizeName(m.pricing_type)===normalizeName(product.pricing_type))
        && (!m.size||normalizeName(m.size)===normalizeName(product.variant||product.unit)));
    // Ambiguous references must not be treated as compliant.
    return matches.length===1?matches[0]:null;
}
async function loadPriceComplianceChart() {
    const client=getDatabase();
    const [products,market]=await Promise.all([
        fetchAllRows(client.from("products").select("name,price,category,variant,unit,pricing_type").eq("is_active",true)),
        fetchAllRows(client.from("market_prices").select("product_name,category,size,pricing_type,min_price,max_price"))
    ]);
    let within=0,above=0,below=0,unmatched=0;
    for(const p of products){
        const ref=findMarketPrice(p,market);
        if(!ref||p.price==null||ref.min_price==null||ref.max_price==null){unmatched++;continue;}
        const price=Number(p.price),min=Number(ref.min_price),max=Number(ref.max_price);
        if(![price,min,max].every(Number.isFinite)||min>max){unmatched++;continue;}
        if(price>max)above++;else if(price<min)below++;else within++;
    }
    priceComplianceChart=renderChart(priceComplianceChart,document.getElementById("priceComplianceChart"),{
        type:"doughnut",
        data:{labels:["Within range","Above range","Below range","Unmatched / needs review"],datasets:[{data:[within,above,below,unmatched],backgroundColor:[chartColors.green,chartColors.red,chartColors.orange,chartColors.gray],borderWidth:0}]},
        options:{...chartOptions(),cutout:"70%",plugins:{...chartOptions().plugins,legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:8,font:{size:10}}}}}
    });
    document.getElementById("complianceNote").textContent=`${above} overpriced · ${unmatched} unmatched/needs review`;
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
