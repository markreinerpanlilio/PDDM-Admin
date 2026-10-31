const usersTable=document.getElementById("usersTable");
const usersModal=document.getElementById("usersModal");
const usersContent=document.getElementById("usersModalContent");
const usersFooter=document.getElementById("usersModalFooter");

let allUsers=[],filteredUsers=[],currentPage=1,currentAdminId=null,usersBusy=false;
const usersPageSize=10;

function uEsc(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
}

function uDate(value){
    if(!value)return "—";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-PH");
}

function uRole(user){
    return String(user?.role||"").trim().toLowerCase();
}

function uStatus(message,error=false){
    const el=document.getElementById("usersStatus");
    el.textContent=message;
    el.style.color=error?"#c62828":"";
}

function uBusy(value){
    usersBusy=value;
    document.querySelectorAll("#usersAdd,#usersRefresh,.users-actions button,#usersSave")
        .forEach(button=>button.disabled=value);
}

async function uVerifyAdmin(){
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user)throw Error("Please sign in.");

    const {data:profile,error:profileError}=await db.from("profiles")
        .select("id,role").eq("id",user.id).single();

    if(profileError||uRole(profile)!=="admin")
        throw Error("Admin access required.");

    currentAdminId=user.id;
}

async function uFetchAll(){
    const rows=[],size=1000;
    for(let start=0;start<100000;start+=size){
        const {data,error}=await db.from("profiles")
            .select("id,full_name,email,phone_number,role,stall_number,store_description,seller_application,created_at")
            .order("created_at",{ascending:false})
            .range(start,start+size-1);

        if(error)throw error;
        rows.push(...(data||[]));
        if(!data||data.length<size)return rows;
    }
    throw Error("Too many users.");
}

async function loadUsers(){
    if(usersBusy)return;
    uBusy(true);
    uStatus("Loading...");

    try{
        await uVerifyAdmin();
        allUsers=await uFetchAll();
        currentPage=1;
        updateUsersStats();
        filterUsers();
        uStatus("");
    }catch(error){
        console.error("Load users:",error);
        uStatus(error.message||"Unable to load users.",true);
        usersTable.innerHTML='<tr><td colspan="5" class="users-empty">Unable to load users</td></tr>';
    }finally{
        uBusy(false);
    }
}

function updateUsersStats(){
    const customers=allUsers.filter(u=>uRole(u)==="customer").length;
    const sellers=allUsers.filter(u=>uRole(u)==="seller").length;
    document.getElementById("usersTotal").textContent=(customers+sellers).toLocaleString();
    document.getElementById("usersCustomers").textContent=customers.toLocaleString();
    document.getElementById("usersSellers").textContent=sellers.toLocaleString();
}

function filterUsers(){
    const search=document.getElementById("usersSearch").value.trim().toLowerCase();
    const role=document.getElementById("usersRoleFilter").value;

    filteredUsers=allUsers.filter(user=>{
        const text=[
            user.full_name,user.email,user.phone_number,user.stall_number,user.id
        ].map(v=>String(v??"")).join(" ").toLowerCase();

        return (!search||text.includes(search))&&
            (role==="all"||uRole(user)===role);
    });

    currentPage=Math.min(currentPage,Math.max(1,Math.ceil(filteredUsers.length/usersPageSize)));
    renderUsers();
}

function renderUsers(){
    const start=(currentPage-1)*usersPageSize;
    const page=filteredUsers.slice(start,start+usersPageSize);

    usersTable.innerHTML=page.length?page.map(user=>{
        const role=uRole(user);
        const protectedUser=role==="admin"||user.id===currentAdminId;
        const name=user.full_name||"Unnamed User";

        return `
        <tr>
            <td>
                <div class="users-person">
                    <div class="users-avatar">${uEsc(name.charAt(0).toUpperCase())}</div>
                    <div>
                        <div class="users-name">${uEsc(name)}</div>
                        <div class="users-id">${uEsc(role)}</div>
                    </div>
                </div>
            </td>
            <td class="users-email">${uEsc(user.email||"—")}</td>
            <td><span class="users-pill ${["customer","seller","admin"].includes(role)?role:"customer"}">${uEsc(role||"Unknown")}</span></td>
            <td>${uDate(user.created_at)}</td>
            <td>
                <div class="users-actions">
                    <button type="button" class="users-view" data-action="view" data-id="${uEsc(user.id)}">View</button>
                    <button type="button" class="users-edit" data-action="edit" data-id="${uEsc(user.id)}" ${protectedUser?"disabled":""}>Edit</button>
                    <button type="button" class="users-delete" data-action="delete" data-id="${uEsc(user.id)}" ${protectedUser?"disabled":""}>Delete</button>
                </div>
            </td>
        </tr>`;
    }).join(""):'<tr><td colspan="5" class="users-empty">No users found</td></tr>';

    document.getElementById("usersPageInfo").textContent=
        `${page.length?start+1:0}–${Math.min(start+usersPageSize,filteredUsers.length)} of ${filteredUsers.length}`;
    document.getElementById("usersPrevious").disabled=currentPage===1;
    document.getElementById("usersNext").disabled=currentPage*usersPageSize>=filteredUsers.length;
}

function uOpen(title,subtitle="Account Information"){
    document.getElementById("usersModalTitle").textContent=title;
    document.getElementById("usersModalSubtitle").textContent=subtitle;
    usersModal.style.display="flex";
}

function uClose(){
    if(usersBusy)return;
    usersModal.style.display="none";
    usersContent.replaceChildren();
    usersFooter.replaceChildren();
}

function uButton(text,style,handler){
    const button=document.createElement("button");
    button.type="button";
    button.className=`users-btn ${style}`;
    button.textContent=text;
    button.addEventListener("click",handler);
    return button;
}

function showUserDetails(id){
    const user=allUsers.find(u=>u.id===id);
    if(!user)return;

    uOpen(user.full_name||"User Details");
    const fields=[
        ["Full Name",user.full_name],
        ["Email",user.email],
        ["Phone",user.phone_number],
        ["Role",user.role],
        ["Stall",user.stall_number],
        ["Store Description",user.store_description],
        ["Application",user.seller_application],
        ["Joined",uDate(user.created_at)],
        ["User ID",user.id]
    ];

    usersContent.innerHTML=`<div class="users-detail-grid">${fields.map(([label,value])=>`
        <div class="users-detail">
            <span class="users-detail-label">${uEsc(label)}</span>
            <span class="users-detail-value">${uEsc(value??"—")}</span>
        </div>
    `).join("")}</div>`;

    usersFooter.replaceChildren(uButton("Close","users-secondary",uClose));
}

function userField(label,name,value="",type="text",required=false){
    return `<div class="users-field">
        <label for="uf_${name}">${label}</label>
        <input class="users-input" id="uf_${name}" name="${name}"
            type="${type}" value="${uEsc(value)}" ${required?"required":""}>
    </div>`;
}

function userPasswordField(label,name,required=false){
    return `<div class="users-field">
        <label for="uf_${name}">${label}</label>
        <div class="users-password-wrap">
            <input class="users-input" id="uf_${name}" name="${name}"
                type="password" autocomplete="new-password"
                minlength="12" maxlength="128"
                placeholder="${required?"At least 12 characters":"Leave blank to keep current"}"
                ${required?"required":""}>
            <button class="users-show-password" type="button" data-show="${name}">Show</button>
        </div>
    </div>`;
}

function showUserForm(id=null){
    const user=id?allUsers.find(u=>u.id===id):null;
    if(id&&!user)return;
    if(user&&(uRole(user)==="admin"||user.id===currentAdminId))return;

    uOpen(user?"Edit User":"Add User",user?"Update Information":"New Account");

    usersContent.innerHTML=`
        <form id="usersForm">
            <div class="users-form-grid">
                ${userField("Full Name","full_name",user?.full_name||"","text",true)}
                ${userField("Email","email",user?.email||"","email",!user)}
                ${userField("Phone","phone_number",user?.phone_number||"","tel")}
                <div class="users-field">
                    <label for="uf_role">Role</label>
                    <select class="users-input" name="role" id="uf_role">
                        <option value="customer" ${uRole(user||{})==="customer"?"selected":""}>Customer</option>
                        <option value="seller" ${uRole(user||{})==="seller"?"selected":""}>Seller</option>
                    </select>
                </div>
                ${userField("Stall Number (Optional)","stall_number",user?.stall_number??"")}
                <div class="users-field full">
                    <label for="uf_store_description">Store Description</label>
                    <input class="users-input" name="store_description" id="uf_store_description" value="${uEsc(user?.store_description||"")}">
                </div>
                ${userPasswordField(user?"New Password (Optional)":"Password","password",!user)}
                ${userPasswordField("Confirm Password","confirm_password",!user)}
            </div>
            <p class="users-form-note">
                ${user
                    ?"Leave both password fields blank to keep the existing password."
                    :"The new account will use the password you enter. Share it securely with the user."}
                Passwords must contain at least 12 characters.
            </p>
        </form>
    `;

    if(user)document.getElementById("uf_email").readOnly=true;

    usersContent.querySelectorAll("[data-show]").forEach(button=>{
        button.addEventListener("click",()=>{
            const input=document.getElementById(`uf_${button.dataset.show}`);
            const visible=input.type==="password";
            input.type=visible?"text":"password";
            button.textContent=visible?"Hide":"Show";
        });
    });

    usersFooter.replaceChildren(
        uButton("Cancel","users-secondary",uClose),
        uButton(user?"Save Changes":"Create User","users-primary",()=>saveUser(id))
    );
    usersFooter.lastChild.id="usersSave";
}

function collectUserForm(){
    const form=document.getElementById("usersForm");
    if(!form.reportValidity())return null;

    const data=new FormData(form);
    const password=String(data.get("password")||"");
    const confirmation=String(data.get("confirm_password")||"");

    if(password!==confirmation){
        uStatus("Passwords do not match.",true);
        return null;
    }

    if(password&&password.length<12){
        uStatus("Password must contain at least 12 characters.",true);
        return null;
    }

    return {
        full_name:String(data.get("full_name")||"").trim(),
        email:String(data.get("email")||"").trim().toLowerCase(),
        phone_number:String(data.get("phone_number")||"").trim(),
        role:String(data.get("role")||""),
        stall_number:String(data.get("stall_number")||"").trim()||null,
        store_description:String(data.get("store_description")||"").trim(),
        password
    };
}

async function callAdminUsers(action,payload={}){
    const {data:{session},error:sessionError}=await db.auth.getSession();
    if(sessionError||!session)throw Error("Session expired. Please sign in.");

    const {data,error}=await db.functions.invoke("admin-users",{
        body:{action,...payload},
        headers:{Authorization:`Bearer ${session.access_token}`}
    });

    if(error){
        let message=error.message;
        if(error.context?.json){
            try{
                const body=await error.context.json();
                message=body.error||message;
            }catch{}
        }
        throw Error(message);
    }

    if(data?.error)throw Error(data.error);
    return data;
}

async function saveUser(id=null){
    if(usersBusy)return;
    const values=collectUserForm();
    if(!values)return;

    if(!values.full_name){uStatus("Full name required.",true);return;}
    if(!["customer","seller"].includes(values.role)){uStatus("Invalid role.",true);return;}
    if(!id&&!values.password){uStatus("Password required.",true);return;}

    uBusy(true);
    uStatus("Saving...");

    try{
        await callAdminUsers(id?"update":"create",{id,values});
        uBusy(false);
        uClose();
        await loadUsers();
        uStatus(id?"User updated successfully":"User created successfully");
    }catch(error){
        console.error("Save user:",error);
        uStatus(error.message,true);
    }finally{
        uBusy(false);
    }
}

async function deleteUser(id){
    if(usersBusy)return;
    const user=allUsers.find(u=>u.id===id);
    if(!user||uRole(user)==="admin"||id===currentAdminId)return;

    const name=user.full_name||user.email||"this user";
    const confirmation=prompt(`Permanently delete ${name}?\nType DELETE to confirm.`);
    if(confirmation!=="DELETE")return;

    uBusy(true);
    uStatus("Deleting...");

    try{
        await callAdminUsers("delete",{id});
        uBusy(false);
        await loadUsers();
        uStatus("User deleted successfully");
    }catch(error){
        console.error("Delete user:",error);
        uStatus(error.message,true);
    }finally{
        uBusy(false);
    }
}

usersTable.addEventListener("click",event=>{
    const button=event.target.closest("button[data-action]");
    if(!button||usersBusy)return;
    const {action,id}=button.dataset;
    if(action==="view")showUserDetails(id);
    if(action==="edit")showUserForm(id);
    if(action==="delete")deleteUser(id);
});

document.getElementById("usersAdd").addEventListener("click",()=>showUserForm());
document.getElementById("usersRefresh").addEventListener("click",loadUsers);
document.getElementById("usersSearch").addEventListener("input",()=>{
    currentPage=1;
    filterUsers();
});
document.getElementById("usersRoleFilter").addEventListener("change",()=>{
    currentPage=1;
    filterUsers();
});
document.getElementById("usersPrevious").addEventListener("click",()=>{
    if(currentPage>1){currentPage--;renderUsers();}
});
document.getElementById("usersNext").addEventListener("click",()=>{
    if(currentPage*usersPageSize<filteredUsers.length){currentPage++;renderUsers();}
});
document.getElementById("usersModalClose").addEventListener("click",uClose);
usersModal.addEventListener("click",event=>{
    if(event.target===usersModal)uClose();
});
document.addEventListener("keydown",event=>{
    if(event.key==="Escape")uClose();
});

loadUsers();
