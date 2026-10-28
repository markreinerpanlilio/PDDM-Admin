const usersTable=document.getElementById("usersTable");
const usersStatus=document.getElementById("usersStatus");
const usersModal=document.getElementById("usersModal");

let allUsers=[],filteredUsers=[],currentPage=1,currentAdminId=null,usersBusy=false;
const usersPageSize=10;

function usersEscape(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
}

function usersNormalize(value){
    return String(value??"").trim().toLowerCase();
}

function usersDate(value){
    if(!value)return "—";
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("en-PH");
}

function usersSetStatus(message,error=false){
    usersStatus.textContent=message;
    usersStatus.style.color=error?"#c62828":"";
}

function usersAccountStatus(user){
    if(user.is_active===false)return "inactive";
    if(user.is_active===true)return "active";
    return "unknown";
}

function usersRole(user){
    return usersNormalize(user.role)||"unknown";
}

async function usersVerifyAdmin(){
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user)throw Error("Please sign in.");

    const {data:profile,error:profileError}=await db.from("profiles")
        .select("id,role,email")
        .eq("id",user.id)
        .single();

    if(profileError||usersRole(profile)!=="admin")throw Error("Admin access required.");
    currentAdminId=user.id;
    return {user,profile};
}

async function usersFetchAll(){
    const result=[],size=1000;
    for(let start=0;start<100000;start+=size){
        const {data,error}=await db.from("profiles")
            .select("*")
            .order("created_at",{ascending:false})
            .range(start,start+size-1);

        if(error)throw error;
        result.push(...(data||[]));
        if(!data||data.length<size)return result;
    }
    throw Error("User limit reached.");
}

async function loadUsers(){
    if(usersBusy)return;
    usersBusy=true;

    const button=document.getElementById("usersRefresh");
    button.disabled=true;
    button.textContent="Loading...";
    usersSetStatus("");

    try{
        await usersVerifyAdmin();
        allUsers=await usersFetchAll();
        currentPage=1;
        updateUsersStats();
        filterUsers();
    }catch(error){
        console.error("Load users:",error);
        usersSetStatus(error.message||"Unable to load users.",true);
        usersTable.innerHTML='<tr><td colspan="6" class="users-empty">Unable to load users</td></tr>';
    }finally{
        usersBusy=false;
        button.disabled=false;
        button.textContent="Refresh";
    }
}

function updateUsersStats(){
    const customers=allUsers.filter(user=>usersRole(user)==="customer");
    const sellers=allUsers.filter(user=>usersRole(user)==="seller");
    const inactive=allUsers.filter(user=>usersAccountStatus(user)==="inactive");

    document.getElementById("usersTotal").textContent=(customers.length+sellers.length).toLocaleString();
    document.getElementById("usersCustomers").textContent=customers.length.toLocaleString();
    document.getElementById("usersSellers").textContent=sellers.length.toLocaleString();
    document.getElementById("usersInactive").textContent=inactive.length.toLocaleString();
}

function filterUsers(){
    const search=usersNormalize(document.getElementById("usersSearch").value);
    const role=document.getElementById("usersRoleFilter").value;
    const status=document.getElementById("usersStatusFilter").value;

    filteredUsers=allUsers.filter(user=>{
        const text=[
            user.full_name,user.email,user.phone_number,user.phone,
            user.stall_number,user.id
        ].map(value=>String(value??"")).join(" ").toLowerCase();

        if(search&&!text.includes(search))return false;
        if(role!=="all"&&usersRole(user)!==role)return false;
        if(status!=="all"&&usersAccountStatus(user)!==status)return false;
        return true;
    });

    const maxPage=Math.max(1,Math.ceil(filteredUsers.length/usersPageSize));
    if(currentPage>maxPage)currentPage=maxPage;
    renderUsers();
}

function renderUsers(){
    const start=(currentPage-1)*usersPageSize;
    const page=filteredUsers.slice(start,start+usersPageSize);

    if(!page.length){
        usersTable.innerHTML='<tr><td colspan="6" class="users-empty">No users found</td></tr>';
    }else{
        usersTable.innerHTML=page.map(user=>{
            const role=usersRole(user);
            const status=usersAccountStatus(user);
            const isAdmin=role==="admin";
            const isSelf=user.id===currentAdminId;
            const canManage=!isAdmin&&!isSelf&&status!=="unknown";
            const name=user.full_name||"Unnamed User";
            const action=status==="active"?"Deactivate":"Activate";

            return `
                <tr>
                    <td>
                        <div class="users-person">
                            <div class="users-avatar">${usersEscape(name.trim().charAt(0).toUpperCase())}</div>
                            <div class="users-person-info">
                                <div class="users-name">${usersEscape(name)}</div>
                                <div class="users-id">${usersEscape(role)}</div>
                            </div>
                        </div>
                    </td>
                    <td class="users-email">${usersEscape(user.email||"—")}</td>
                    <td><span class="users-pill ${["customer","seller","admin"].includes(role)?role:"unknown"}">${usersEscape(role)}</span></td>
                    <td><span class="users-pill ${status}">${usersEscape(status)}</span></td>
                    <td>${usersDate(user.created_at)}</td>
                    <td>
                        <div class="users-row-actions">
                            <button class="users-view" type="button" data-action="view" data-id="${usersEscape(user.id)}">View</button>
                            <button class="users-toggle ${status==="inactive"?"enable":""}" type="button"
                                data-action="toggle" data-id="${usersEscape(user.id)}"
                                ${canManage?"":"disabled"}
                                title="${canManage?action:"Unavailable"}">${action}</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    const total=filteredUsers.length;
    const from=total?start+1:0;
    const to=Math.min(start+usersPageSize,total);

    document.getElementById("usersPageInfo").textContent=
        `${from}–${to} of ${total}`;

    document.getElementById("usersPrevious").disabled=currentPage<=1;
    document.getElementById("usersNext").disabled=currentPage*usersPageSize>=total;
}

function showUserDetails(id){
    const user=allUsers.find(item=>item.id===id);
    if(!user)return;

    document.getElementById("usersModalTitle").textContent=user.full_name||"User Details";

    const fields=[
        ["Full Name",user.full_name],
        ["Email",user.email],
        ["Phone",user.phone_number||user.phone],
        ["Role",usersRole(user)],
        ["Status",usersAccountStatus(user)],
        ["Seller Application",user.seller_application],
        ["Stall Number",user.stall_number],
        ["Store Description",user.store_description],
        ["Joined",usersDate(user.created_at)],
        ["User ID",user.id]
    ];

    document.getElementById("usersDetailGrid").innerHTML=fields.map(([label,value])=>`
        <div class="users-detail">
            <span class="users-detail-label">${usersEscape(label)}</span>
            <span class="users-detail-value">${usersEscape(value??"—")}</span>
        </div>
    `).join("");

    usersModal.style.display="flex";
}

function closeUsersModal(){
    usersModal.style.display="none";
}

async function usersNotifyAccount(userId,active){
    const {error}=await db.from("notifications").insert({
        user_id:userId,
        type:"account_status",
        title:active?"Account Activated":"Account Deactivated",
        message:active
            ?"Your account has been activated."
            :"Your account has been deactivated.",
        is_read:false
    });
    if(error)throw error;
}

async function usersAudit(admin,target,active){
    const {error}=await db.from("audit_logs").insert({
        user_id:admin.user.id,
        user:`${admin.profile.email} (admin)`,
        action:active?"Activate User":"Deactivate User",
        module:"Users",
        description:`${target.email||target.id} - ${active?"Activated":"Deactivated"}`
    });
    if(error)console.error("Audit:",error.message);
}

async function toggleUserStatus(id){
    if(usersBusy)return;

    const target=allUsers.find(user=>user.id===id);
    if(!target)return;

    const status=usersAccountStatus(target);
    if(status==="unknown"){
        usersSetStatus("Account status unavailable.",true);
        return;
    }

    if(usersRole(target)==="admin"||id===currentAdminId){
        usersSetStatus("Admin accounts cannot be changed here.",true);
        return;
    }

    const nextActive=status==="inactive";
    const action=nextActive?"Activate":"Deactivate";

    if(!confirm(`${action} ${target.full_name||target.email}?`))return;

    usersBusy=true;
    usersSetStatus("Processing...");
    document.querySelectorAll(".users-row-actions button").forEach(button=>button.disabled=true);

    try{
        const admin=await usersVerifyAdmin();

        const {data,error}=await db.from("profiles")
            .update({is_active:nextActive})
            .eq("id",id)
            .neq("role","admin")
            .select("id,is_active");

        if(error)throw error;
        if(!data?.length)throw Error("Unable to update account.");

        target.is_active=nextActive;
        updateUsersStats();
        filterUsers();

        let notified=true;
        try{
            await usersNotifyAccount(id,nextActive);
        }catch(error){
            notified=false;
            console.error("Notification:",error);
        }

        await usersAudit(admin,target,nextActive);
        usersSetStatus(notified?`${action}d · Notified`:`${action}d · Notification failed`,!notified);
    }catch(error){
        console.error("Account update:",error);
        usersSetStatus(error.message||"Update failed.",true);
        await loadUsers();
    }finally{
        usersBusy=false;
        renderUsers();
    }
}

usersTable.addEventListener("click",event=>{
    const button=event.target.closest("button[data-action]");
    if(!button)return;

    const {action,id}=button.dataset;
    if(action==="view")showUserDetails(id);
    if(action==="toggle")toggleUserStatus(id);
});

document.getElementById("usersSearch").addEventListener("input",()=>{
    currentPage=1;
    filterUsers();
});
document.getElementById("usersRoleFilter").addEventListener("change",()=>{
    currentPage=1;
    filterUsers();
});
document.getElementById("usersStatusFilter").addEventListener("change",()=>{
    currentPage=1;
    filterUsers();
});
document.getElementById("usersPrevious").addEventListener("click",()=>{
    if(currentPage>1){currentPage--;renderUsers();}
});
document.getElementById("usersNext").addEventListener("click",()=>{
    if(currentPage*usersPageSize<filteredUsers.length){currentPage++;renderUsers();}
});
document.getElementById("usersRefresh").addEventListener("click",loadUsers);
document.getElementById("usersModalClose").addEventListener("click",closeUsersModal);
document.getElementById("usersModalDone").addEventListener("click",closeUsersModal);
usersModal.addEventListener("click",event=>{
    if(event.target===usersModal)closeUsersModal();
});
document.addEventListener("keydown",event=>{
    if(event.key==="Escape")closeUsersModal();
});

loadUsers();
