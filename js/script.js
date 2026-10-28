let userGrowthChart=null,priceComplianceChart=null,marketActivityChart=null;
let dashboardChannel=null,refreshTimer=null,loadingDashboard=false,refreshQueued=false;

const chartColors={
    primary:"#6658e8",green:"#27a879",red:"#d85c68",
    orange:"#e5a13c",gray:"#9298a7"
};
const completedStatuses=new Set(["completed","complete","delivered","fulfilled"]);
const pendingStatuses=new Set(["pending","submitted","under review","under_review","for approval"]);

function getDatabase(){
    if(typeof db==="undefined"||!db)throw Error("Supabase unavailable.");
    return db;
}

function normalize(value){
    return String(value??"").trim().toLowerCase().replace(/\s+/g," ");
}

function normalizeValue(value){
    return String(value??"").trim().toLowerCase().replace(/\s+/g,"");
}

function numberText(value){
    return Number(value||0).toLocaleString("en-PH");
}

function dateKey(value){
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "";
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function selectedRange(){
    const type=document.getElementById("dateFilter")?.value||"week";
    const start=new Date(),end=new Date();
    start.setHours(0,0,0,0);
    if(type==="week")start.setDate(start.getDate()-6);
    if(type==="month")start.setDate(start.getDate()-29);
    if(type==="year")start.setMonth(0,1);
    return {start,end,startISO:start.toISOString(),endISO:end.toISOString(),type};
}

function rangeLabel(){
    return {today:"Today",week:"Last 7 Days",month:"Last 30 Days",year:"This Year"}[selectedRange().type];
}

function dailyLabels(start,end){
    const result=[],cursor=new Date(start),last=new Date(end);
    cursor.setHours(0,0,0,0);
    last.setHours(0,0,0,0);
    while(cursor<=last){
        result.push({
            key:dateKey(cursor),
            label:cursor.toLocaleDateString("en-PH",{month:"short",day:"numeric"})
        });
        cursor.setDate(cursor.getDate()+1);
    }
    return result;
}

function countsByDate(rows,field,labels){
    const map=new Map(labels.map(x=>[x.key,0]));
    for(const row of rows){
        const key=dateKey(row[field]);
        if(map.has(key))map.set(key,map.get(key)+1);
    }
    return labels.map(x=>map.get(x.key));
}

function chartOptions(){
    return {
        responsive:true,maintainAspectRatio:false,
        plugins:{
            legend:{labels:{usePointStyle:true,boxWidth:8,padding:10,font:{size:11}}},
            tooltip:{padding:10,cornerRadius:8}
        }
    };
}

function renderChart(existing,canvas,config){
    if(existing){
        existing.data=config.data;
        existing.options=config.options;
        existing.update();
        return existing;
    }
    return new Chart(canvas,config);
}

async function fetchAllRows(query){
    const rows=[],size=1000;
    for(let start=0;start<100000;start+=size){
        const {data,error}=await query.range(start,start+size-1);
        if(error)throw error;
        rows.push(...(data||[]));
        if(!data||data.length<size)return rows;
    }
    throw Error("Record limit reached.");
}

function setStatus(message,error=false){
    const el=document.getElementById("dashboardStatus");
    if(!el)return;
    el.textContent=message;
    el.style.color=error?"#c0392b":"";
}

async function loadDashboard(){
    if(loadingDashboard){refreshQueued=true;return;}
    loadingDashboard=true;
    const button=document.getElementById("refreshDashboard");
    if(button){button.disabled=true;button.textContent="Loading...";}
    setStatus("");

    const tasks=[
        ["KPIs",loadSummaryCards],
        ["Notifications",loadNotifications],
        ["User Growth",loadUserGrowthChart],
        ["Order Trends",loadOrderActivityChart],
        ["Price Compliance",loadPriceComplianceChart]
    ];

    const results=await Promise.allSettled(tasks.map(([,fn])=>fn()));
    const errors=results.flatMap((result,i)=>{
        if(result.status==="fulfilled")return [];
        console.error(tasks[i][0],result.reason);
        return [`${tasks[i][0]}: ${result.reason?.message||"Error"}`];
    });

    setStatus(errors.length?errors.join(" | "):"Updated",errors.length>0);
    if(button){button.disabled=false;button.textContent="Refresh";}
    loadingDashboard=false;
    if(refreshQueued){refreshQueued=false;loadDashboard();}
}

async function loadSummaryCards(){
    const client=getDatabase(),range=selectedRange();
    const [profiles,orders,items]=await Promise.all([
        fetchAllRows(client.from("profiles").select("id,role,seller_status,seller_application")),
        fetchAllRows(client.from("orders").select("id,user_id,status").gte("created_at",range.startISO).lte("created_at",range.endISO)),
        fetchAllRows(client.from("order_items").select("order_id,seller_id,status").gte("created_at",range.startISO).lte("created_at",range.endISO))
    ]);

    const customers=new Set(profiles.filter(p=>normalize(p.role)==="customer").map(p=>p.id));
    const sellers=new Set(profiles.filter(p=>normalize(p.role)==="seller").map(p=>p.id));
    const applicants=new Set(profiles.filter(p=>
        pendingStatuses.has(normalize(p.seller_status))||
        pendingStatuses.has(normalize(p.seller_application))
    ).map(p=>p.id));

    const activeCustomers=new Set(orders.filter(o=>customers.has(o.user_id)).map(o=>o.user_id));
    const activeSellers=new Set(items.filter(i=>sellers.has(i.seller_id)).map(i=>i.seller_id));

    document.getElementById("totalUsersCount").textContent=numberText(new Set([...customers,...sellers]).size);
    document.getElementById("applicantCount").textContent=numberText(applicants.size);
    document.getElementById("activeCustomerCount").textContent=numberText(activeCustomers.size);
    document.getElementById("activeSellerCount").textContent=numberText(activeSellers.size);
}

function relativeTime(value){
    if(!value)return "";
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
    if(seconds<60)return "Just now";
    if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;
    if(seconds<86400)return `${Math.floor(seconds/3600)}h ago`;
    return `${Math.floor(seconds/86400)}d ago`;
}

function createNotification(title,message,time,unread=false,icon="🔔"){
    const li=document.createElement("li");
    if(unread)li.classList.add("unread");
    const symbol=document.createElement("span");
    symbol.className="notification-icon";
    symbol.textContent=icon;
    const details=document.createElement("div");
    details.className="notification-details";
    for(const [cls,value] of [
        ["notification-title",title],
        ["notification-message",message],
        ["notification-time",time]
    ]){
        const el=document.createElement("div");
        el.className=cls;
        el.textContent=value||"";
        details.append(el);
    }
    li.append(symbol,details);
    return li;
}

async function loadNotifications(){
    const client=getDatabase();
    const list=document.getElementById("dashboardNotificationList");
    const badge=document.getElementById("unreadNotificationCount");
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user)throw Error("Sign in required.");

    const [notifications,unread,profiles]=await Promise.all([
        client.from("notifications").select("id,type,title,message,is_read,created_at")
            .eq("user_id",user.id).order("created_at",{ascending:false}).limit(10),
        client.from("notifications").select("id",{count:"exact",head:true})
            .eq("user_id",user.id).eq("is_read",false),
        fetchAllRows(client.from("profiles").select("id,seller_status,seller_application"))
    ]);

    if(notifications.error)throw notifications.error;
    if(unread.error)throw unread.error;

    const pending=profiles.filter(p=>
        pendingStatuses.has(normalize(p.seller_status))||
        pendingStatuses.has(normalize(p.seller_application))
    ).length;

    badge.textContent=`Unread: ${unread.count||0}`;
    list.replaceChildren();

    if(pending){
        list.append(createNotification(
            "Seller Applications",`${pending} pending`,"Pending",true,"📋"
        ));
    }

    for(const n of notifications.data||[]){
        const type=normalize(n.type);
        const icon=type.includes("order")?"🛒":
            type.includes("seller")?"🏪":
            type.includes("price")?"💰":"🔔";
        list.append(createNotification(
            n.title||"Notification",n.message||"",
            relativeTime(n.created_at),!n.is_read,icon
        ));
    }

    if(!list.children.length){
        const li=document.createElement("li");
        li.className="notification-empty";
        li.textContent="No notifications";
        list.append(li);
    }
}

async function loadUserGrowthChart(){
    const client=getDatabase(),range=selectedRange();
    const profiles=await fetchAllRows(
        client.from("profiles").select("created_at,role")
            .gte("created_at",range.startISO)
            .lte("created_at",range.endISO)
            .order("created_at")
    );
    const users=profiles.filter(p=>["customer","seller"].includes(normalize(p.role)));
    const labels=dailyLabels(range.start,range.end);
    const values=countsByDate(users,"created_at",labels);

    userGrowthChart=renderChart(userGrowthChart,document.getElementById("userGrowthChart"),{
        type:"line",
        data:{
            labels:labels.map(x=>x.label),
            datasets:[{
                label:"New Users",data:values,
                borderColor:chartColors.primary,
                backgroundColor:"rgba(102,88,232,.10)",
                fill:true,tension:.35,borderWidth:2,
                pointRadius:labels.length>14?0:3
            }]
        },
        options:{
            ...chartOptions(),
            scales:{
                x:{grid:{display:false},ticks:{maxTicksLimit:9}},
                y:{beginAtZero:true,ticks:{precision:0}}
            }
        }
    });
    document.getElementById("growthRangeLabel").textContent=rangeLabel();
}

async function loadOrderActivityChart(){
    const client=getDatabase(),range=selectedRange();
    const [orders,items]=await Promise.all([
        fetchAllRows(client.from("orders").select("id,status,created_at")
            .gte("created_at",range.startISO).lte("created_at",range.endISO)),
        fetchAllRows(client.from("order_items").select("order_id,status"))
    ]);

    const grouped=new Map();
    for(const item of items){
        if(!grouped.has(item.order_id))grouped.set(item.order_id,[]);
        grouped.get(item.order_id).push(item);
    }

    const completed=orders.filter(order=>{
        if(completedStatuses.has(normalize(order.status)))return true;
        const rows=grouped.get(order.id)||[];
        return rows.length>0&&rows.every(item=>completedStatuses.has(normalize(item.status)));
    });

    const labels=dailyLabels(range.start,range.end);
    const values=countsByDate(completed,"created_at",labels);

    marketActivityChart=renderChart(marketActivityChart,document.getElementById("marketActivityChart"),{
        type:"bar",
        data:{
            labels:labels.map(x=>x.label),
            datasets:[{
                label:"Completed Orders",data:values,
                backgroundColor:chartColors.green,
                borderRadius:6,maxBarThickness:38
            }]
        },
        options:{
            ...chartOptions(),
            scales:{
                x:{grid:{display:false},ticks:{maxTicksLimit:12}},
                y:{beginAtZero:true,ticks:{precision:0}}
            }
        }
    });

    document.getElementById("orderRangeLabel").textContent=
        `${rangeLabel()} · ${completed.length} completed`;
}

// Market Price page comparison logic
function getProductSize(product){
    const candidates=[
        product.variant,
        product.size,
        product.weight!=null&&product.unit?`${product.weight}${product.unit}`:null,
        product.weight!=null?String(product.weight):null
    ];
    return candidates.filter(v=>v!=null&&String(v).trim()!=="");
}

function getProductPricingType(product){
    if(product.pricing_type==="per_kg")return "per_kg";
    if(product.pricing_type==="fixed_size")return "fixed_size";
    const sizes=getProductSize(product).map(normalizeValue);
    return sizes.some(size=>size==="kg"||size.endsWith("/kg"))?"per_kg":"fixed_size";
}

function findProductBenchmark(product,marketPriceData){
    const name=normalizeValue(product.name);
    if(!name)return null;
    const pricingType=getProductPricingType(product);
    const category=normalizeValue(product.category);

    const benchmarks=marketPriceData.filter(benchmark=>{
        if(normalizeValue(benchmark.product_name)!==name)return false;
        if(category&&benchmark.category&&category!==normalizeValue(benchmark.category))return false;
        return benchmark.pricing_type===pricingType;
    });

    if(pricingType==="per_kg")return benchmarks[0]||null;

    const sizes=getProductSize(product).map(normalizeValue);
    if(!sizes.length)return benchmarks[0]||null;

    return benchmarks.find(benchmark=>
        benchmark.size!=null&&sizes.includes(normalizeValue(benchmark.size))
    )||null;
}

function compareSellerProduct(product,marketPriceData){
    const benchmark=findProductBenchmark(product,marketPriceData);
    const hasBenchmark=benchmark&&benchmark.max_price!==null&&
        benchmark.max_price!==undefined&&String(benchmark.max_price).trim()!==""&&
        Number.isFinite(Number(benchmark.max_price));

    const sellingPrice=Number(product.price);

    if(!hasBenchmark){
        return {...product,benchmark:null,status:"unmatched"};
    }

    if(product.price==null||product.price===""||
        !Number.isFinite(sellingPrice)||sellingPrice<0){
        return {...product,benchmark,status:"missing"};
    }

    const maxPrice=Number(benchmark.max_price);
    const minPrice=benchmark.min_price==null||
        String(benchmark.min_price).trim()===""?null:Number(benchmark.min_price);

    if(sellingPrice>maxPrice){
        return {...product,benchmark,status:"overpriced"};
    }

    if(minPrice!==null&&Number.isFinite(minPrice)&&sellingPrice<minPrice){
        return {...product,benchmark,status:"underpriced"};
    }

    return {...product,benchmark,status:"compliant"};
}

async function loadPriceComplianceChart(){
    const client=getDatabase();

    const [products,marketPrices]=await Promise.all([
        fetchAllRows(client.from("products").select("*").order("name",{ascending:true})),
        fetchAllRows(client.from("market_prices").select("*").order("product_name",{ascending:true}))
    ]);

    const compared=products.map(product=>compareSellerProduct(product,marketPrices));
    const totals={
        compliant:0,overpriced:0,underpriced:0,unmatched:0
    };

    for(const product of compared){
        const key=product.status==="missing"?"unmatched":product.status;
        totals[key]++;
    }

    const labels=["Within Range","Overpriced","Below Minimum","No Benchmark"];
    const values=[
        totals.compliant,
        totals.overpriced,
        totals.underpriced,
        totals.unmatched
    ];

    priceComplianceChart=renderChart(
        priceComplianceChart,
        document.getElementById("priceComplianceChart"),
        {
            type:"doughnut",
            data:{
                labels,
                datasets:[{
                    data:values,
                    backgroundColor:[
                        chartColors.green,
                        chartColors.red,
                        chartColors.orange,
                        chartColors.gray
                    ],
                    borderWidth:0,
                    hoverOffset:5
                }]
            },
            options:{
                ...chartOptions(),
                cutout:"68%",
                plugins:{
                    ...chartOptions().plugins,
                    legend:{
                        position:"bottom",
                        labels:{usePointStyle:true,boxWidth:8,padding:9,font:{size:10}}
                    },
                    tooltip:{
                        callbacks:{
                            label:context=>`${context.label}: ${context.parsed}`
                        }
                    }
                }
            }
        }
    );

    document.getElementById("complianceNote").textContent=
        `${products.length} Products · Current Prices`;

    console.table(compared.map(product=>({
        Product:product.name,
        SellerPrice:product.price,
        ReferenceMin:product.benchmark?.min_price??"—",
        ReferenceMax:product.benchmark?.max_price??"—",
        Status:product.status
    })));
}

function scheduleDashboardRefresh(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(loadDashboard,700);
}

function setupDashboardRealtime(){
    const client=getDatabase();
    if(dashboardChannel)client.removeChannel(dashboardChannel);
    dashboardChannel=client.channel("ppdm-dashboard-realtime");

    for(const table of ["profiles","orders","order_items","products","market_prices","notifications"]){
        dashboardChannel.on(
            "postgres_changes",
            {event:"*",schema:"public",table},
            scheduleDashboardRefresh
        );
    }
    dashboardChannel.subscribe(status=>{
        if(status==="CHANNEL_ERROR")console.warn("Realtime unavailable.");
    });
}

async function addAuditLog(action,module,description=""){
    try{
        const client=getDatabase();
        const {data}=await client.auth.getUser();
        const {error}=await client.from("audit_logs").insert({
            user_id:data?.user?.id||null,
            user:localStorage.getItem("adminName")||"Admin",
            action,module,description
        });
        if(error)console.error(error.message);
    }catch(error){console.error(error);}
}

async function logout(){
    try{await getDatabase().auth.signOut();}
    catch(error){console.error(error);}
    localStorage.removeItem("adminName");
    location.href="../index.html";
}

async function login(){
    const email=document.getElementById("email")?.value.trim();
    const password=document.getElementById("password")?.value;
    const button=document.querySelector(".login-card button");

    if(!email||!password){alert("Enter email and password.");return;}
    if(button){button.disabled=true;button.textContent="Logging in...";}

    try{
        const client=getDatabase();
        const {data,error}=await client.auth.signInWithPassword({email,password});
        if(error)throw error;

        const {data:profile,error:profileError}=await client.from("profiles")
            .select("full_name,role").eq("id",data.user.id).maybeSingle();
        if(profileError)throw profileError;

        if(normalize(profile?.role)!=="admin"){
            await client.auth.signOut();
            throw Error("Admin access only.");
        }

        localStorage.setItem("adminName",profile.full_name||email);
        location.href="pages/dashboard.html";
    }catch(error){
        console.error(error);
        alert(error.message||"Login failed.");
    }finally{
        if(button){button.disabled=false;button.textContent="Login";}
    }
}
