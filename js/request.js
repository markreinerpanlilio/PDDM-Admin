
const requestTable=document.getElementById("requestTable");
const pendingCount=document.getElementById("pendingCount");
const detailsModal=document.getElementById("sellerDetailsModal");
const requestStatus=document.getElementById("requestStatus");
const BUCKET_NAME="seller-application-documents";

let requests=[],selectedSellerId=null,requestBusy=false,permitRequest=0;

function escapeHTML(value){
    return String(value??"").replace(/[&<>"']/g,c=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
}

function formatDate(value){
    if(!value)return "—";
    const d=new Date(value);
    return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-PH");
}

function setRequestStatus(message,error=false){
    requestStatus.textContent=message;
    requestStatus.style.color=error?"#c62828":"";
}

function setRequestBusy(busy){
    requestBusy=busy;
    document.querySelectorAll(".request-actions button,#modalApproveBtn,#modalRejectBtn")
        .forEach(button=>button.disabled=busy);
}

async function verifyAdmin(){
    const {data:{user},error}=await db.auth.getUser();
    if(error||!user)throw Error("Admin sign-in required.");
    const {data:profile,error:profileError}=await db.from("profiles")
        .select("id,email,role").eq("id",user.id).single();
    if(profileError||String(profile?.role).toLowerCase()!=="admin")
        throw Error("Admin access required.");
    return {user,profile};
}

async function loadRequests(){
    if(requestBusy)return;
    pendingCount.textContent="Loading...";
    requestTable.innerHTML='<tr><td colspan="6" class="request-empty-message">Loading...</td></tr>';

    try{
        await verifyAdmin();
        const {data,error}=await db.from("profiles").select("*")
            .eq("seller_application","pending")
            .order("created_at",{ascending:false});
        if(error)throw error;
        requests=data||[];
        renderRequests();
        setRequestStatus("");
    }catch(error){
        console.error(error);
        pendingCount.textContent="Unavailable";
        requestTable.innerHTML='<tr><td colspan="6" class="request-empty-message">Unable to load applications.</td></tr>';
        setRequestStatus(error.message,true);
    }
}

function renderRequests(){
    pendingCount.textContent=`${requests.length} Pending`;
    if(!requests.length){
        requestTable.innerHTML='<tr><td colspan="6" class="request-empty-message">No pending applications</td></tr>';
        return;
    }

    requestTable.innerHTML=requests.map(user=>`
        <tr>
            <td>
                <div class="request-applicant">
                    <div class="request-avatar">${escapeHTML((user.full_name||user.email||"?").trim().charAt(0).toUpperCase())}</div>
                    <div class="request-applicant-info">
                        <span class="request-applicant-name">${escapeHTML(user.full_name||"Unnamed Applicant")}</span>
                        <span class="request-applicant-label">Applicant</span>
                    </div>
                </div>
            </td>
            <td><span class="request-email">${escapeHTML(user.email||"—")}</span></td>
            <td>${escapeHTML(user.phone_number||user.phone||"—")}</td>
            <td><span class="request-date">${formatDate(user.created_at)}</span></td>
            <td><span class="request-stall-badge">${user.stall_number!=null?"Stall "+escapeHTML(user.stall_number):"Not specified"}</span></td>
            <td>
                <div class="request-actions">
                    <button type="button" class="request-view-btn" data-action="view" data-id="${escapeHTML(user.id)}">View</button>
                    <button type="button" class="request-action-btn request-approve-btn" data-action="approve" data-id="${escapeHTML(user.id)}" title="Approve">✓</button>
                    <button type="button" class="request-action-btn request-reject-btn" data-action="reject" data-id="${escapeHTML(user.id)}" title="Reject">✕</button>
                </div>
            </td>
        </tr>
    `).join("");

    searchRequests();
}

function searchRequests(){
    const value=document.getElementById("searchRequest").value.trim().toLowerCase();
    requestTable.querySelectorAll("tr").forEach(row=>{
        row.hidden=!!value&&!row.textContent.toLowerCase().includes(value);
    });
}

function renderSellerDetails(seller){
    const fields=[
        ["Full Name",seller.full_name],
        ["Email",seller.email],
        ["Phone",seller.phone_number||seller.phone],
        ["Stall",seller.stall_number!=null?`Stall ${seller.stall_number}`:"Not specified"],
        ["Store Description",seller.store_description],
        ["Registered",formatDate(seller.created_at)]
    ];

    document.getElementById("sellerProfileDetails").innerHTML=fields.map(([label,value])=>`
        <div class="request-detail-item">
            <span class="request-detail-label">${escapeHTML(label)}</span>
            <span class="request-detail-value">${escapeHTML(value||"—")}</span>
        </div>
    `).join("");

    document.getElementById("sellerDetailsTitle").textContent=seller.full_name||"Seller Details";
    document.getElementById("sellerDetailsSubtitle").textContent="Application Details";
}

async function viewSellerDetails(id){
    const seller=requests.find(item=>item.id===id);
    if(!seller)return;

    selectedSellerId=id;
    renderSellerDetails(seller);
    detailsModal.style.display="flex";

    const area=document.getElementById("permitArea");
    area.textContent="Loading...";
    const token=++permitRequest;

    if(!seller.business_permit_path){
        area.textContent="No permit submitted";
        return;
    }

    try{
        const path=String(seller.business_permit_path).trim();
        let url;

        if(/^https:\/\//i.test(path)){
            url=path;
        }else{
            const {data,error}=await db.storage.from(BUCKET_NAME)
                .createSignedUrl(path,120);
            if(error)throw error;
            url=data.signedUrl;
        }

        if(token!==permitRequest)return;
        area.replaceChildren();

        const isPDF=/\.pdf(?:$|\?)/i.test(path);
        if(isPDF){
            const frame=document.createElement("iframe");
            frame.src=url;
            frame.title="Business Permit";
            area.append(frame);
        }else{
            const image=document.createElement("img");
            image.alt="Business Permit";
            image.onerror=()=>{area.textContent="Unable to display permit";};
            image.src=url;
            area.append(image);
        }
    }catch(error){
        console.error("Permit:",error);
        if(token===permitRequest)area.textContent="Permit unavailable";
    }
}

function closeSellerDetails(){
    permitRequest++;
    selectedSellerId=null;
    detailsModal.style.display="none";
    document.getElementById("permitArea").replaceChildren();
}

async function checkStallAvailability(seller){
    if(seller.stall_number==null||String(seller.stall_number).trim()==="")
        throw Error("No stall assigned.");

    const {data,error}=await db.from("profiles")
        .select("id,full_name")
        .eq("stall_number",seller.stall_number)
        .eq("role","seller")
        .neq("id",seller.id)
        .limit(1);

    if(error)throw error;
    if(data?.length)throw Error("Stall already assigned.");
}

async function sendDecisionNotification(userId,approved){
    const notification={
        user_id:userId,
        type:"seller_application",
        title:approved?"Application Approved":"Application Rejected",
        message:approved
            ?"Your seller application has been approved."
            :"Your seller application has been rejected.",
        is_read:false
    };

    const {error}=await db.from("notifications").insert(notification);
    if(error)throw error;
}

async function logSellerDecision(admin,seller,approved){
    const {error}=await db.from("audit_logs").insert({
        user_id:admin.user.id,
        user:`${admin.profile.email} (admin)`,
        action:approved?"Approve Seller":"Reject Seller",
        module:"Seller Requests",
        description:`${seller.email||seller.id} - ${approved?"Approved":"Rejected"}`
    });
    if(error)console.error("Audit log:",error.message);
}

async function decideSeller(id,approved){
    if(requestBusy)return;
    const seller=requests.find(item=>item.id===id);
    if(!seller)return;

    const action=approved?"approve":"reject";
    if(!confirm(`${approved?"Approve":"Reject"} ${seller.full_name||seller.email}?`))return;

    setRequestBusy(true);
    setRequestStatus("Processing...");

    try{
        const admin=await verifyAdmin();
        if(approved)await checkStallAvailability(seller);

        const changes=approved
            ?{role:"seller",seller_application:"approved"}
            :{seller_application:"rejected",stall_number:null};

        const {data,error}=await db.from("profiles")
            .update(changes)
            .eq("id",id)
            .eq("seller_application","pending")
            .select("id");

        if(error)throw error;
        if(!data?.length)throw Error("Application is no longer pending.");

        let notified=true;
        try{
            await sendDecisionNotification(id,approved);
        }catch(error){
            notified=false;
            console.error("Notification insert:",error);
            setRequestStatus("Decision saved · Notification failed",true);
        }

        await logSellerDecision(admin,seller,approved);
        requests=requests.filter(item=>item.id!==id);
        closeSellerDetails();
        renderRequests();

        if(notified)setRequestStatus(approved?"Approved · Notified":"Rejected · Notified");
    }catch(error){
        console.error(`${action} seller:`,error);
        setRequestStatus(error.message||"Request failed",true);
        alert(error.message||"Unable to process application.");
        await loadRequests();
    }finally{
        setRequestBusy(false);
    }
}

function approveSeller(id){return decideSeller(id,true);}
function rejectSeller(id){return decideSeller(id,false);}

requestTable.addEventListener("click",event=>{
    const button=event.target.closest("button[data-action]");
    if(!button||requestBusy)return;
    const {action,id}=button.dataset;
    if(action==="view")viewSellerDetails(id);
    if(action==="approve")approveSeller(id);
    if(action==="reject")rejectSeller(id);
});

document.getElementById("modalApproveBtn").addEventListener("click",()=>{
    if(selectedSellerId)approveSeller(selectedSellerId);
});
document.getElementById("modalRejectBtn").addEventListener("click",()=>{
    if(selectedSellerId)rejectSeller(selectedSellerId);
});
document.getElementById("closeDetailsBtn").addEventListener("click",closeSellerDetails);
document.getElementById("modalCloseBtn").addEventListener("click",closeSellerDetails);
document.getElementById("refreshRequests").addEventListener("click",loadRequests);
document.getElementById("searchRequest").addEventListener("input",searchRequests);

detailsModal.addEventListener("click",event=>{
    if(event.target===detailsModal)closeSellerDetails();
});
document.addEventListener("keydown",event=>{
    if(event.key==="Escape"&&detailsModal.style.display==="flex")closeSellerDetails();
});

loadRequests();
