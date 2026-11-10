// Product Management: uses existing Supabase client and leaves Market Price logic intact.
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const client=()=>db;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let master=[],requests=[],editing=null;
function status(id,message){$(id).textContent=message||'';}
function setTab(tab){
 for(const key of ['prices','master','requests']){
  const el=$('pm'+key[0].toUpperCase()+key.slice(1));
  el.hidden=key!==tab;
 }
 document.querySelectorAll('.pm-tab').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-selected',String(b.dataset.tab===tab));});
 $('mpHeaderActions').style.display=tab==='prices'?'':'none';
 if(tab==='master')loadMaster();
 if(tab==='requests')loadRequests();
}
async function loadMaster(){
 status('pmMasterStatus','Loading master list...');
 const {data,error}=await client().from('master_products').select('id,name,category,type,unit').order('name');
 if(error){status('pmMasterStatus',`Unable to load master list: ${error.message}. Apply the included SQL migration and policies first.`);return;}
 master=data||[];status('pmMasterStatus',`${master.length} approved products`);renderMaster();
}
function renderMaster(){
 const q=$('pmMasterSearch').value.trim().toLowerCase();
 const rows=master.filter(p=>[p.name,p.category,p.type,p.unit].join(' ').toLowerCase().includes(q));
 $('pmMasterRows').innerHTML=rows.length?rows.map(p=>`<tr><td class="mp-product-name">${esc(p.name)}</td><td>${esc(p.category)}</td><td>${esc(p.type)}</td><td>${esc(p.unit)}</td><td><button class="pm-small-btn" data-edit="${esc(p.id)}">Edit</button><button class="pm-small-btn pm-danger" data-remove="${esc(p.id)}">Remove</button></td></tr>`).join(''):'<tr><td colspan="5" class="mp-empty">No products found.</td></tr>';
}
function openMaster(p){
 editing=p?.id||null;$('pmMasterModalTitle').textContent=p?'Edit Master Product':'Add Master Product';
 $('pmName').value=p?.name||'';$('pmCategory').value=p?.category||'';$('pmType').value=p?.type||'';$('pmUnit').value=p?.unit||'kg';
 $('pmMasterModal').style.display='flex';$('pmName').focus();
}
function closeMaster(){$('pmMasterModal').style.display='none';editing=null;}
async function saveMaster(event){
 event.preventDefault();
 const payload={name:$('pmName').value.trim(),category:$('pmCategory').value.trim(),type:$('pmType').value.trim(),unit:$('pmUnit').value};
 if(!payload.name||!payload.category)return;
 const query=editing?client().from('master_products').update(payload).eq('id',editing):client().from('master_products').insert(payload);
 const {error}=await query;
 if(error){alert(`Unable to save product: ${error.message}`);return;}
 closeMaster();await loadMaster();
}
async function removeMaster(id){
 const p=master.find(x=>String(x.id)===String(id));
 if(!p||!confirm(`Remove ${p.name} from the Master List? Existing linked records may prevent deletion.`))return;
 const {error}=await client().from('master_products').delete().eq('id',id);
 if(error){alert(`Unable to remove: ${error.message}`);return;}
 await loadMaster();
}
async function loadRequests(){
 status('pmRequestStatus','Loading product requests...');
 const {data,error}=await client().from('product_requests').select('id,product_name,category,type,unit,seller_id,status,created_at').order('created_at',{ascending:false});
 if(error){status('pmRequestStatus',`Unable to load requests: ${error.message}. Apply the included SQL migration and policies first.`);return;}
 requests=data||[];
 const pending=requests.filter(x=>x.status==='pending').length;
 $('pmPendingCount').textContent=pending?`(${pending})`:'';
 status('pmRequestStatus',`${pending} pending requests`);renderRequests();
}
function renderRequests(){
 const q=$('pmRequestSearch').value.trim().toLowerCase();
 const rows=requests.filter(p=>Object.values(p).join(' ').toLowerCase().includes(q));
 $('pmRequestRows').innerHTML=rows.length?rows.map(p=>`<tr><td class="mp-product-name">${esc(p.product_name)}</td><td>${esc(p.category)}</td><td>${esc(p.type)}</td><td>${esc(p.unit)}</td><td title="${esc(p.seller_id)}">${esc(String(p.seller_id).slice(0,8))}…</td><td>${esc(p.status)}</td><td>${p.status==='pending'?`<button class="pm-small-btn" data-approve="${esc(p.id)}">Approve</button><button class="pm-small-btn pm-danger" data-reject="${esc(p.id)}">Reject</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="7" class="mp-empty">No requests found.</td></tr>';
}
async function decide(id,approve){
 const p=requests.find(x=>String(x.id)===String(id));
 if(!p||p.status!=='pending')return;
 if(!confirm(`${approve?'Approve':'Reject'} the request for ${p.product_name}?`))return;
 // Atomic database function prevents approved requests without master entries.
 const {error}=await client().rpc('admin_review_product_request',{p_request_id:id,p_approve:approve});
 if(error){alert(`Unable to review request: ${error.message}`);return;}
 await loadRequests();
}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('.pm-tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
 $('pmMasterAdd').addEventListener('click',()=>openMaster(null));
 $('pmMasterClose').addEventListener('click',closeMaster);
 $('pmMasterCancel').addEventListener('click',closeMaster);
 $('pmMasterForm').addEventListener('submit',saveMaster);
 $('pmMasterSearch').addEventListener('input',renderMaster);
 $('pmRequestSearch').addEventListener('input',renderRequests);
 $('pmRequestsRefresh').addEventListener('click',loadRequests);
 $('pmMasterRows').addEventListener('click',e=>{
  const edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');
  if(edit)openMaster(master.find(p=>String(p.id)===edit.dataset.edit));
  if(remove)removeMaster(remove.dataset.remove);
 });
 $('pmRequestRows').addEventListener('click',e=>{
  const approve=e.target.closest('[data-approve]'),reject=e.target.closest('[data-reject]');
  if(approve)decide(approve.dataset.approve,true);
  if(reject)decide(reject.dataset.reject,false);
 });
 setTab('prices');
});
})();
