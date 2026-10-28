let userGrowthChart=null,priceComplianceChart=null,marketActivityChart=null;
let dashboardChannel=null,refreshTimer=null,loadingDashboard=false,refreshQueued=false;

const chartColors={
    primary:"#6658e8",green:"#27a879",red:"#d85c68",
    orange:"#e5a13c",blue:"#4386d9",gray:"#9298a7"
};

const completedStatuses=new Set(["completed","complete","delivered","fulfilled"]);
const pendingStatuses=new Set(["pending","submitted","under review","under_review","for approval"]);

function getDatabase(){
    if(typeof db==="undefined"||!db)throw Error("Supabase is unavailable. Check js/supabase.js.");
    return db;
}

function setStatus(message,error=false){
    const el=document.getElementById("dashboardStatus");
    if(!el)return;
    el.textContent=message;
    el.style.color=error?"#c0392b":"";
}

function normalize(value){
    return String(value??"").trim().toLowerCase().replace(/\s+/g," ");
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
    return {today:"Today",week:"Last 7 days",month:"Last 30 days",year:"This year"}[selectedRange().type];
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

function numberText(value){
    return Number(value||0).toLocaleString("en-PH");
}

function chartOptions(){
    return {
        responsive:true,maintainAspectRatio:false,
        plugins:{
            legend:{labels:{usePointStyle:true,boxWidth:8,padding:12,font:{size:11}}},
            tooltip:{padding:10,cornerRadius:8}
        }
    };
}

function renderChart(oldChart,canvas,config){
    if(oldChart){
        oldChart.data=config.data;
        oldChart.options=config.options;
        oldChart.update();
        return oldChart;
    }
    return new Chart(canvas,config);
}

async function fetchAllRows(query){
    const rows=[],pageSize=1000,maxRows=100000;
    for(let start=0;start<maxRows;start+=pageSize){
        const {data,error}=await query.range(start,start+pageSize-1);
        if(error)throw error;
        rows.push(...(data||[]));
        if(!data||data.length<pageSize)return rows;
    }
    throw Error("Too many records. A database aggregate query is required.");
}

async function loadDashboard(){
    if(loadingDashboard){refreshQueued=true;return;}
    loadingDashboard=true;
    const button=document.getElementById("refreshDashboard");
    if(button){button.disabled=true;button.textContent="Loading...";}
    setStatus("");

    const tasks=[
        ["Summary",loadSummaryCards],
        ["Notifications",loadNotifications],
        ["User Growth",loadUserGrowthChart],
        ["Order Trends",loadOrderActivityChart],
        ["Price Compliance",loadPriceComplianceChart]
    ];

    const results=await Promise.allSettled(tasks.map(([,fn])=>fn()));
    const failures=results.flatMap((result,i)=>{
        if(result.status==="fulfilled")return [];
        console.error(tasks[i][0],result.reason);
        return [`${tasks[i][0]}: ${result.reason?.message||"Failed"}`];
    });

    setStatus(
        failures.length?failures.join(" | "):`Updated ${new Date().toLocaleTimeString("en-PH")}`,
        failures.length>0
    );

    if(button){button.disabled=false;button.textContent="Refresh";}
    loadingDashboard=false;

    if(refreshQueued){
        refreshQueued=false;
        loadDashboard();
    }
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
    const users=new Set([...customers,...sellers]);

    const applicants=new Set(profiles.filter(p=>
        pendingStatuses.has(normalize(p.seller_status))||
        pendingStatuses.has(normalize(p.seller_application))
    ).map(p=>p.id));

    const activeCustomers=new Set(orders.filter(o=>customers.has(o.user_id)).map(o=>o.user_id));
    const activeSellers=new Set(items.filter(i=>sellers.has(i.seller_id)).map(i=>i.seller_id));

    document.getElementById("totalUsersCount").textContent=numberText(users.size);
    document.getElementById("applicantCount").textContent=numberText(applicants.size);
    document.getElementById("activeCustomerCount").textContent=numberText(activeCustomers.size);
    document.getElementById("activeSellerCount").textContent=numberText(activeSellers.size);
}

function relativeTime(value){
    if(!value)return "";
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
    if(seconds<60)return "Just now";
    if(seconds<3600)return `${Math.floor(seconds/60)} minutes ago`;
    if(seconds<86400)return `${Math.floor(seconds/3600)} hours ago`;
    if(seconds<604800)return `${Math.floor(seconds/86400)} days ago`;
    return new Date(value).toLocaleDateString("en-PH");
}

function createNotification(title,message,time,unread=false,icon="🔔"){
    const li=document.createElement("li");
    if(unread)li.classList.add("unread");

    const symbol=document.createElement("span");
    symbol.className="notification-icon";
    symbol.textContent=icon;

    const details=document.createElement("div");
    details.className="notification-details";

    const heading=document.createElement("div");
    heading.className="notification-title";
    heading.textContent=title;

    const body=document.createElement("div");
    body.className="notification-message";
    body.textContent=message;

    const date=document.createElement("div");
    date.className="notification-time";
    date.textContent=time;

    details.append(heading,body,date);
    li.append(symbol,details);
    return li;
}

async function loadNotifications(){
    const client=getDatabase();
    const list=document.getElementById("dashboardNotificationList");
    const badge=document.getElementById("unreadNotificationCount");

    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError)throw authError;
    if(!user)throw Error("Please sign in to view notifications.");

    const [notifications,unread,profiles]=await Promise.all([
        client.from("notifications")
            .select("id,type,title,message,is_read,created_at")
            .eq("user_id",user.id)
            .order("created_at",{ascending:false})
            .limit(10),
        client.from("notifications")
            .select("id",{count:"exact",head:true})
            .eq("user_id",user.id)
            .eq("is_read",false),
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

    if(pending>0){
        list.append(createNotification(
            "Pending Seller Applications",
            `${pending} seller application${pending===1?" needs":"s need"} your review.`,
            "Current pending applications",true,"📋"
        ));
    }

    for(const n of notifications.data||[]){
        const type=normalize(n.type);
        const icon=type.includes("order")?"🛒":
            type.includes("seller")?"🏪":
            type.includes("price")?"💰":"🔔";

        list.append(createNotification(
            n.title||"Notification",
            n.message||"",
            relativeTime(n.created_at),
            !n.is_read,icon
        ));
    }

    if(!list.children.length){
        const li=document.createElement("li");
        li.className="notification-empty";
        li.textContent="No notifications at the moment.";
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

    userGrowthChart=renderChart(
        userGrowthChart,
        document.getElementById("userGrowthChart"),
        {
            type:"line",
            data:{
                labels:labels.map(x=>x.label),
                datasets:[{
                    label:"New Users",
                    data:values,
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
        }
    );

    document.getElementById("growthRangeLabel").textContent=
        `${rangeLabel()} · ${users.length} new users`;
}

async function loadOrderActivityChart(){
    const client=getDatabase(),range=selectedRange();

    const [orders,items]=await Promise.all([
        fetchAllRows(client.from("orders")
            .select("id,status,created_at,Time")
            .gte("created_at",range.startISO)
            .lte("created_at",range.endISO)),
        fetchAllRows(client.from("order_items")
            .select("order_id,status"))
    ]);

    const itemsByOrder=new Map();
    for(const item of items){
        if(!itemsByOrder.has(item.order_id))itemsByOrder.set(item.order_id,[]);
        itemsByOrder.get(item.order_id).push(item);
    }

    const completed=orders.filter(order=>{
        const orderStatus=normalize(order.status);
        if(completedStatuses.has(orderStatus))return true;

        const orderItems=itemsByOrder.get(order.id)||[];
        return orderItems.length>0&&orderItems.every(item=>
            completedStatuses.has(normalize(item.status))
        );
    });

    const labels=dailyLabels(range.start,range.end);
    const values=countsByDate(completed,"created_at",labels);

    marketActivityChart=renderChart(
        marketActivityChart,
        document.getElementById("marketActivityChart"),
        {
            type:"bar",
            data:{
                labels:labels.map(x=>x.label),
                datasets:[{
                    label:"Completed Orders",
                    data:values,
                    backgroundColor:chartColors.green,
                    borderRadius:6,
                    maxBarThickness:38
                }]
            },
            options:{
                ...chartOptions(),
                scales:{
                    x:{grid:{display:false},ticks:{maxTicksLimit:12}},
                    y:{beginAtZero:true,ticks:{precision:0}}
                }
            }
        }
    );

    document.getElementById("orderRangeLabel").textContent=
        `${rangeLabel()} · ${completed.length} completed orders · Grouped by order creation date`;
}

function parseSize(value){
    const text=normalize(value).replace(/\s+/g,"");
    if(!text)return null;

    const match=text.match(/^(\d+(?:\.\d+)?)(kg|g|mg|l|ml|pcs?|pieces?|pack|packs)$/);
    if(!match)return {raw:text};

    let amount=Number(match[1]),unit=match[2];
    if(unit==="kg"){amount*=1000;unit="g";}
    if(unit==="mg"){amount/=1000;unit="g";}
    if(unit==="l"){amount*=1000;unit="ml";}
    if(["pc","pcs","piece","pieces"].includes(unit))unit="pcs";
    if(unit==="packs")unit="pack";

    return {amount,unit};
}

function sizeMatches(a,b){
    const left=parseSize(a),right=parseSize(b);
    if(!left||!right)return false;

    if(left.raw||right.raw)return left.raw===right.raw;
    return left.unit===right.unit&&Math.abs(left.amount-right.amount)<0.000001;
}

function productReferenceMatch(product,reference){
    if(normalize(product.name)!==normalize(reference.product_name))return false;

    if(reference.category&&normalize(product.category)!==normalize(reference.category))return false;

    if(reference.pricing_type&&normalize(product.pricing_type)!==normalize(reference.pricing_type))return false;

    const refSize=reference.size;
    const productSize=product.variant||product.unit||
        (product.weight&&product.pricing_type?
            `${product.weight}${product.pricing_type}`:null);

    if(refSize&&!sizeMatches(productSize,refSize))return false;
    if(!refSize&&productSize&&reference.pricing_type&&
        normalize(product.pricing_type)!==normalize(reference.pricing_type))return false;

    return true;
}

function calculatePriceCompliance(products,references){
    const result={within:0,above:0,below:0,unmatched:0,details:[]};

    for(const product of products){
        const matches=references.filter(ref=>productReferenceMatch(product,ref));

        if(matches.length!==1){
            result.unmatched++;
            result.details.push({name:product.name,status:"unmatched",reason:"No unique matching reference"});
            continue;
        }

        const ref=matches[0];
        const sellerPrice=Number(product.price);
        const min=Number(ref.min_price);
        const max=Number(ref.max_price);

        if(product.price==null||ref.min_price==null||ref.max_price==null||
            ![sellerPrice,min,max].every(Number.isFinite)||min>max){
            result.unmatched++;
            result.details.push({name:product.name,status:"unmatched",reason:"Invalid or missing price range"});
            continue;
        }

        const status=sellerPrice>max?"above":sellerPrice<min?"below":"within";
        result[status]++;

        result.details.push({
            name:product.name,
            sellerPrice,min,max,status,
            difference:status==="above"?sellerPrice-max:status==="below"?min-sellerPrice:0
        });
    }
    return result;
}

async function loadPriceComplianceChart(){
    const client=getDatabase();

    const [products,references]=await Promise.all([
        fetchAllRows(client.from("products")
            .select("id,name,price,category,variant,unit,weight,pricing_type,is_active")
            .eq("is_active",true)),
        fetchAllRows(client.from("market_prices")
            .select("id,product_name,category,size,pricing_type,min_price,max_price"))
    ]);

    const result=calculatePriceCompliance(products,references);
    const labels=["Within Range","Overpriced","Below Range","Unmatched"];
    const values=[result.within,result.above,result.below,result.unmatched];

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
                    legend:{position:"bottom",labels:{
                        usePointStyle:true,boxWidth:8,padding:10,font:{size:10}
                    }},
                    tooltip:{
                        callbacks:{
                            label:context=>{
                                const count=context.parsed;
                                const total=values.reduce((a,b)=>a+b,0);
                                const percent=total?(count/total*100).toFixed(1):"0";
                                return `${context.label}: ${count} (${percent}%)`;
                            }
                        }
                    }
                }
            }
        }
    );

    document.getElementById("complianceNote").textContent=
        `${result.within} within range · ${result.above} overpriced · `+
        `${result.below} below range · ${result.unmatched} unmatched. `+
        `Based on ${products.length} active listings and current reference prices.`;

    console.table(result.details);
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
        if(status==="CHANNEL_ERROR")console.warn("Dashboard Realtime unavailable. Use Refresh.");
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
        if(error)console.error("Audit log:",error.message);
    }catch(error){
        console.error("Audit log:",error);
    }
}

async function logout(){
    try{
        await getDatabase().auth.signOut();
    }catch(error){
        console.error("Logout:",error);
    }
    localStorage.removeItem("adminName");
    window.location.href="../index.html";
}

async function login(){
    const emailInput=document.getElementById("email");
    const passwordInput=document.getElementById("password");
    const button=document.querySelector(".login-card button");
    const email=emailInput?.value.trim(),password=passwordInput?.value;

    if(!email||!password){alert("Please enter your email and password.");return;}
    if(button){button.disabled=true;button.textContent="Logging in...";}

    try{
        const client=getDatabase();
        const {data,error}=await client.auth.signInWithPassword({email,password});
        if(error)throw error;

        const {data:profile,error:profileError}=await client.from("profiles")
            .select("full_name,role")
            .eq("id",data.user.id)
            .maybeSingle();

        if(profileError)throw profileError;
        if(normalize(profile?.role)!=="admin"){
            await client.auth.signOut();
            throw Error("Access denied. Admin accounts only.");
        }

        localStorage.setItem("adminName",profile.full_name||email);
        window.location.href="pages/dashboard.html";
    }catch(error){
        console.error("Login:",error);
        alert(error.message||"Login failed.");
    }finally{
        if(button){button.disabled=false;button.textContent="Login";}
    }
}
