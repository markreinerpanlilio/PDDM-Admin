
// Product Management uses existing PPDM Supabase tables.
// Market Price is handled by the existing marketPrice.js.

(()=>{
'use strict';

const $=id=>document.getElementById(id);

const esc=v=>String(v??'').replace(
 /[&<>"']/g,
 c=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
 }[c])
);

let master=[];
let brands=[];
let categories=[];
let links=[];
let requests=[];
let editing=null;

const message=(id,text)=>{
 $(id).textContent=text||'';
};

function tab(name){
 const sections={
  prices:'pmPrices',
  master:'pmMaster',
  requests:'pmRequests'
 };

 for(const [key,id] of Object.entries(sections)){
  $(id).hidden=key!==name;
 }

 document.querySelectorAll('.pm-tab').forEach(button=>{
  const active=button.dataset.tab===name;

  button.classList.toggle('active',active);
  button.setAttribute('aria-selected',String(active));
 });

 $('mpHeaderActions').style.display=
  name==='prices'?'':'none';

 if(name==='master')loadMaster();
 if(name==='requests')loadRequests();
}

async function loadMaster(){
 message('pmMasterStatus','Loading...');

 const results=await Promise.all([
  db.from('master_products')
   .select('id,product_name,allow_unbranded,created_at')
   .order('product_name'),

  db.from('brands')
   .select('id,name')
   .order('name'),

  db.from('categories')
   .select('id,name')
   .order('name'),

  db.from('brand_products')
   .select('id,brand_id,master_product_id,category_id')
 ]);

 const error=results.find(r=>r.error)?.error;

 if(error){
  message(
   'pmMasterStatus',
   `Cannot load Master List: ${error.message}`
  );
  return;
 }

 [master,brands,categories,links]=results.map(
  result=>result.data||[]
 );

 message(
  'pmMasterStatus',
  `${master.length} master products · ${brands.length} brands`
 );

 renderMaster();
}

function renderMaster(){
 const search=$('pmMasterSearch').value
  .trim()
  .toLowerCase();

 const rows=master.filter(product=>{
  const related=links.filter(
   link=>link.master_product_id===product.id
  );

  const brandNames=related.map(link=>
   brands.find(brand=>brand.id===link.brand_id)?.name||''
  ).join(' ');

  return `${product.product_name} ${brandNames}`
   .toLowerCase()
   .includes(search);
 });

 $('pmMasterRows').innerHTML=rows.length
  ?rows.map(product=>{
   const related=links.filter(
    link=>link.master_product_id===product.id
   );

   const brandNames=[
    ...new Set(
     related.map(link=>
      brands.find(brand=>brand.id===link.brand_id)?.name
     ).filter(Boolean)
    )
   ];

   const categoryNames=[
    ...new Set(
     related.map(link=>
      categories.find(cat=>cat.id===link.category_id)?.name
     ).filter(Boolean)
    )
   ];

   return `
    <tr>
     <td class="mp-product-name">
      ${esc(product.product_name)}
     </td>

     <td>
      ${esc(brandNames.join(', ')||'—')}
     </td>

     <td>
      ${esc(categoryNames.join(', ')||'—')}
     </td>

     <td>
      ${product.allow_unbranded?'Yes':'No'}
     </td>

     <td>
      <button
       type="button"
       class="pm-small-btn"
       data-edit="${esc(product.id)}"
      >
       Edit
      </button>
     </td>
    </tr>
   `;
  }).join('')
  :'<tr><td colspan="5" class="mp-empty">No master products found.</td></tr>';
}

function openMaster(product){
 editing=product?.id||null;

 $('pmMasterModalTitle').textContent=
  product?'Edit Master Product':'Add Master Product';

 $('pmName').value=product?.product_name||'';

 $('pmAllowUnbranded').checked=
  product?.allow_unbranded??true;

 $('pmMasterModal').style.display='flex';
 $('pmName').focus();
}

function closeMaster(){
 $('pmMasterModal').style.display='none';
 editing=null;
}

async function saveMaster(event){
 event.preventDefault();

 const product_name=$('pmName').value.trim();

 if(!product_name)return;

 const payload={
  product_name,
  allow_unbranded:$('pmAllowUnbranded').checked
 };

 const query=editing
  ?db.from('master_products')
   .update(payload)
   .eq('id',editing)
  :db.from('master_products')
   .insert(payload);

 const {error}=await query;

 if(error){
  alert(`Unable to save: ${error.message}`);
  return;
 }

 closeMaster();
 await loadMaster();
}

async function loadRequests(){
 message('pmRequestStatus','Loading...');

 const {data,error}=await db
  .from('product_requests')
  .select(
   'id,seller_id,product_name,brand_name,category_name,price,stock,pricing_type,weight,variant,unit,image_url,status,created_at'
  )
  .order('created_at',{ascending:false});

 if(error){
  message(
   'pmRequestStatus',
   `Cannot load product requests: ${error.message}`
  );
  return;
 }

 requests=data||[];

 const pending=requests.filter(
  request=>String(request.status).toLowerCase()==='pending'
 ).length;

 $('pmPendingCount').textContent=
  pending?`(${pending})`:'';

 message(
  'pmRequestStatus',
  `${pending} pending requests`
 );

 renderRequests();
}

function renderRequests(){
 const search=$('pmRequestSearch').value
  .trim()
  .toLowerCase();

 const rows=requests.filter(request=>
  Object.values(request)
   .join(' ')
   .toLowerCase()
   .includes(search)
 );

 $('pmRequestRows').innerHTML=rows.length
  ?rows.map(request=>{
   const pending=
    String(request.status).toLowerCase()==='pending';

   return `
    <tr>
     <td class="mp-product-name">
      ${esc(request.product_name)}

      ${request.brand_name
       ?`<br><small>${esc(request.brand_name)}</small>`
       :''}
     </td>

     <td>
      ${esc(request.category_name)}
     </td>

     <td>
      ${esc(request.variant||'—')}
      ${esc(request.weight??'')}
      ${esc(request.unit||'')}
     </td>

     <td>
      ₱${Number(request.price).toFixed(2)}
      / ${esc(request.stock)} stock
     </td>

     <td title="${esc(request.seller_id)}">
      ${esc(String(request.seller_id).slice(0,8))}…
     </td>

     <td>
      ${esc(request.status)}
     </td>

     <td>
      ${pending?`
       <button
        type="button"
        class="pm-small-btn"
        data-approve="${esc(request.id)}"
       >
        Approve
       </button>

       <button
        type="button"
        class="pm-small-btn pm-danger"
        data-reject="${esc(request.id)}"
       >
        Reject
       </button>
      `:'—'}
     </td>
    </tr>
   `;
  }).join('')
  :'<tr><td colspan="7" class="mp-empty">No requests found.</td></tr>';
}

async function decide(id,approve){
 const request=requests.find(
  item=>item.id===id
 );

 if(
  !request||
  String(request.status).toLowerCase()!=='pending'
 ){
  return;
 }

 const description=approve
  ?'add the product to the Master List and publish its seller listing'
  :'reject this request';

 const confirmed=confirm(
  `Do you want to ${description}?\n\n`+
  `${request.brand_name?request.brand_name+' ':''}`+
  request.product_name
 );

 if(!confirmed)return;

 const {error}=await db.rpc(
  'admin_review_product_request',
  {
   p_request_id:id,
   p_approve:approve
  }
 );

 if(error){
  alert(
   `Review failed: ${error.message}\n\n`+
   'Make sure the matching approval SQL function has been installed.'
  );
  return;
 }

 await loadRequests();
}

document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('.pm-tab').forEach(button=>{
  button.addEventListener('click',()=>
   tab(button.dataset.tab)
  );
 });

 $('pmMasterAdd').addEventListener(
  'click',()=>openMaster(null)
 );

 $('pmMasterClose').addEventListener(
  'click',closeMaster
 );

 $('pmMasterCancel').addEventListener(
  'click',closeMaster
 );

 $('pmMasterForm').addEventListener(
  'submit',saveMaster
 );

 $('pmMasterSearch').addEventListener(
  'input',renderMaster
 );

 $('pmRequestSearch').addEventListener(
  'input',renderRequests
 );

 $('pmRequestsRefresh').addEventListener(
  'click',loadRequests
 );

 $('pmMasterRows').addEventListener('click',event=>{
  const button=event.target.closest('[data-edit]');

  if(button){
   openMaster(
    master.find(product=>
     product.id===button.dataset.edit
    )
   );
  }
 });

 $('pmRequestRows').addEventListener('click',event=>{
  const approveButton=event.target.closest(
   '[data-approve]'
  );

  const rejectButton=event.target.closest(
   '[data-reject]'
  );

  if(approveButton){
   decide(approveButton.dataset.approve,true);
  }

  if(rejectButton){
   decide(rejectButton.dataset.reject,false);
  }
 });

 tab('prices');
});
})();
