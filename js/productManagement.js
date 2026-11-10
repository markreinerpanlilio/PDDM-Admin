
(()=>{
'use strict';

const $=id=>document.getElementById(id);
const norm=v=>String(v??'').trim().toLowerCase();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;',
 '<':'&lt;',
 '>':'&gt;',
 '"':'&quot;',
 "'":'&#39;'
}[c]));

const peso=v=>'₱'+Number(v||0).toLocaleString('en-PH',{
 minimumFractionDigits:2,
 maximumFractionDigits:2
});

let client;
let master=[];
let brands=[];
let categories=[];
let links=[];
let requests=[];
let sellers=[];

let editId=null;
let selectedBrands=new Set();
let selectedCategories=new Set();
let saving=false;
let reviewing=false;

function getClient(){
 if(typeof db!=='undefined'&&db?.from)return db;
 if(window.supabaseClient?.from)return window.supabaseClient;
 if(window.supabase?.from)return window.supabase;
 throw new Error('Supabase client not found.');
}

function status(id,message){
 const element=$(id);
 if(element)element.textContent=message||'';
}

function switchTab(tab){
 const sections={
  prices:'pmPrices',
  master:'pmMaster',
  requests:'pmRequests'
 };

 Object.entries(sections).forEach(([key,id])=>{
  if($(id))$(id).hidden=key!==tab;
 });

 document.querySelectorAll('[data-pm-tab]').forEach(button=>{
  const active=button.dataset.pmTab===tab;
  button.classList.toggle('active',active);
  button.setAttribute('aria-selected',String(active));
 });

 if(tab==='master')loadMaster();
 if(tab==='requests')loadRequests();
}

async function fetchAll(table,columns,order){
 const rows=[];
 const limit=500;

 for(let offset=0;offset<100000;offset+=limit){
  let query=client.from(table)
   .select(columns)
   .range(offset,offset+limit-1);

  if(order){
   query=query.order(order,{ascending:true});
  }

  const {data,error}=await query;
  if(error)throw error;

  rows.push(...(data||[]));

  if(!data||data.length<limit)break;
 }

 return rows;
}

/* Master List */

async function loadMaster(){
 status('pmMasterStatus','Loading Master List...');

 try{
  [master,brands,categories,links]=await Promise.all([
   fetchAll(
    'master_products',
    'id,product_name,allow_unbranded,created_at',
    'product_name'
   ),
   fetchAll('brands','id,name','name'),
   fetchAll('categories','id,name','name'),
   fetchAll(
    'brand_products',
    'id,brand_id,master_product_id,category_id'
   )
  ]);

  renderMaster();
  populateSelectors();

  status('pmMasterStatus',`${master.length} master products`);

 }catch(error){
  console.error('Load Master List:',error);
  status('pmMasterStatus','Unable to load: '+error.message);
 }
}

function brandIds(productId){
 return [...new Set(
  links.filter(link=>link.master_product_id===productId)
   .map(link=>link.brand_id)
   .filter(Boolean)
 )];
}

function categoryIds(productId){
 return [...new Set(
  links.filter(link=>link.master_product_id===productId)
   .map(link=>link.category_id)
   .filter(Boolean)
 )];
}

function names(ids,records){
 return ids.map(id=>records.find(r=>r.id===id)?.name)
  .filter(Boolean);
}

function renderMaster(){
 const search=norm($('pmMasterSearch').value);

 const filtered=master.filter(product=>{
  const brandNames=names(brandIds(product.id),brands);
  const categoryNames=names(categoryIds(product.id),categories);

  return norm([
   product.product_name,
   ...brandNames,
   ...categoryNames
  ].join(' ')).includes(search);
 });

 $('pmMasterRows').innerHTML=filtered.length
  ?filtered.map(product=>`
   <tr>
    <td class="name">${esc(product.product_name)}</td>
    <td>${esc(names(brandIds(product.id),brands).join(', ')||'—')}</td>
    <td>${esc(names(categoryIds(product.id),categories).join(', ')||'—')}</td>
    <td>
     <button
      type="button"
      class="pm-row-btn"
      data-master-edit="${esc(product.id)}"
     >Edit</button>
    </td>
   </tr>
  `).join('')
  :'<tr><td colspan="4" class="empty">No master products found.</td></tr>';
}

function populateSelectors(){
 const brandSelect=$('pmBrandSelect');
 const categorySelect=$('pmCategorySelect');

 brandSelect.replaceChildren(
  new Option('Select a brand','')
 );

 brands.forEach(brand=>{
  brandSelect.add(new Option(brand.name,brand.id));
 });

 categorySelect.replaceChildren(
  new Option('Select a category','')
 );

 categories.forEach(category=>{
  categorySelect.add(new Option(category.name,category.id));
 });
}

function renderSelections(){
 $('pmSelectedBrands').innerHTML=brands
  .filter(brand=>selectedBrands.has(brand.id))
  .map(brand=>`
   <span class="pm-chip">
    ${esc(brand.name)}
    <button
     type="button"
     data-remove-brand="${esc(brand.id)}"
     aria-label="Remove ${esc(brand.name)}"
    >×</button>
   </span>
  `).join('');

 $('pmSelectedCategories').innerHTML=categories
  .filter(category=>selectedCategories.has(category.id))
  .map(category=>`
   <span class="pm-chip">
    ${esc(category.name)}
    <button
     type="button"
     data-remove-category="${esc(category.id)}"
     aria-label="Remove ${esc(category.name)}"
    >×</button>
   </span>
  `).join('');
}

function openMaster(product=null){
 if(saving)return;

 editId=product?.id||null;

 selectedBrands=new Set(
  product?brandIds(product.id):[]
 );

 selectedCategories=new Set(
  product?categoryIds(product.id):[]
 );

 $('pmMasterModalTitle').textContent=product
  ?'Edit Product'
  :'Add Product';

 $('pmName').value=product?.product_name||'';

 $('pmAllowUnbranded').checked=product
  ?Boolean(product.allow_unbranded)
  :false;

 populateSelectors();
 renderSelections();

 $('pmMasterModal').classList.add('open');
 $('pmName').focus();
}

function closeMaster(){
 if(saving)return;

 $('pmMasterModal').classList.remove('open');
 editId=null;
}

function addBrand(){
 const value=$('pmBrandSelect').value;

 if(value)selectedBrands.add(value);

 $('pmBrandSelect').value='';
 renderSelections();
}

function addCategory(){
 const value=$('pmCategorySelect').value;

 if(value)selectedCategories.add(value);

 $('pmCategorySelect').value='';
 renderSelections();
}

async function saveMaster(event){
 event.preventDefault();
 if(saving)return;

 const product_name=$('pmName').value.trim();
 const allow_unbranded=$('pmAllowUnbranded').checked;

 if(!product_name){
  alert('Enter a product name.');
  return;
 }

 if(!selectedCategories.size){
  alert('Select at least one category.');
  return;
 }

 if(!selectedBrands.size){
  alert(
   'Select at least one brand. The current database requires '+
   'a brand to link categories to a master product.'
  );
  return;
 }

 const duplicate=master.some(product=>
  norm(product.product_name)===norm(product_name)&&
  product.id!==editId
 );

 if(duplicate){
  alert('This master product already exists.');
  return;
 }

 saving=true;
 $('pmMasterSave').disabled=true;
 $('pmMasterClose').disabled=true;

 try{
  let productId=editId;

  const payload={
   product_name,
   allow_unbranded
  };

  if(productId){
   const {error}=await client
    .from('master_products')
    .update(payload)
    .eq('id',productId);

   if(error)throw error;

  }else{
   const {data,error}=await client
    .from('master_products')
    .insert(payload)
    .select('id')
    .single();

   if(error)throw error;

   productId=data.id;
  }

  const desired=[];

  for(const brand_id of selectedBrands){
   for(const category_id of selectedCategories){
    desired.push({
     brand_id,
     category_id,
     master_product_id:productId
    });
   }
  }

  const {data:current,error:readError}=await client
   .from('brand_products')
   .select('id,brand_id,category_id')
   .eq('master_product_id',productId);

  if(readError)throw readError;

  const same=(a,b)=>
   a.brand_id===b.brand_id&&
   a.category_id===b.category_id;

  const insert=desired.filter(item=>
   !(current||[]).some(row=>same(row,item))
  );

  const remove=(current||[]).filter(row=>
   !desired.some(item=>same(row,item))
  );

  if(insert.length){
   const {error}=await client
    .from('brand_products')
    .insert(insert);

   if(error)throw error;
  }

  if(remove.length){
   const {error}=await client
    .from('brand_products')
    .delete()
    .in('id',remove.map(row=>row.id));

   if(error)throw error;
  }

  $('pmMasterModal').classList.remove('open');
  editId=null;

  await loadMaster();

  alert('Master product saved successfully.');

 }catch(error){
  console.error('Save Master Product:',error);
  alert('Unable to save: '+error.message);

 }finally{
  saving=false;
  $('pmMasterSave').disabled=false;
  $('pmMasterClose').disabled=false;
 }
}

/* Product Requests */

async function loadRequests(){
 status('pmRequestStatus','Loading pending product requests...');

 try{
  const {data,error}=await client
   .from('product_requests')
   .select(
    'id,seller_id,product_name,brand_name,category_name,'+
    'price,stock,pricing_type,weight,variant,unit,'+
    'image_url,status,created_at'
   )
   .eq('status','pending')
   .order('created_at',{ascending:false});

  if(error)throw error;

  requests=data||[];

  const sellerIds=[...new Set(
   requests.map(request=>request.seller_id).filter(Boolean)
  )];

  sellers=[];

  if(sellerIds.length){
   const {data:profiles,error:profileError}=await client
    .from('profiles')
    .select('id,full_name,email,role')
    .in('id',sellerIds);

   if(profileError){
    console.warn(
     'Seller profiles unavailable:',
     profileError.message
    );
   }else{
    sellers=profiles||[];
   }
  }

  const count=requests.length;

  $('pmPendingCount').textContent=count?`(${count})`:'';

  status(
   'pmRequestStatus',
   `${count} pending product request${count===1?'':'s'}`
  );

  renderRequests();

 }catch(error){
  console.error('Product Requests:',error);

  status(
   'pmRequestStatus',
   'Unable to load: '+error.message
  );

  $('pmRequestRows').innerHTML=`
   <tr>
    <td colspan="7" class="empty">
     ${esc(error.message)}
    </td>
   </tr>
  `;
 }
}

function renderRequests(){
 const search=norm($('pmRequestSearch').value);

 const filtered=requests.filter(request=>{
  const seller=sellers.find(s=>s.id===request.seller_id);

  return norm([
   request.product_name,
   request.brand_name,
   request.category_name,
   request.variant,
   request.seller_id,
   seller?.full_name,
   seller?.email
  ].join(' ')).includes(search);
 });

 $('pmRequestRows').innerHTML=filtered.length
  ?filtered.map(request=>{
   const seller=sellers.find(s=>s.id===request.seller_id);

   const size=[
    request.variant,
    request.weight!=null
     ?`${request.weight}${request.unit||''}`
     :request.unit
   ].filter(Boolean).join(' · ')||'—';

   const sellerName=
    seller?.full_name||
    seller?.email||
    (request.seller_id
     ?request.seller_id.slice(0,8)+'…'
     :'Unknown Seller');

   return `
    <tr>
     <td>
      <div class="name">
       ${esc(request.product_name)}
      </div>
      <small>
       ${esc(request.brand_name||'Unbranded')}
      </small>
     </td>

     <td>${esc(request.category_name||'—')}</td>

     <td>
      ${esc(size)}
      <br>
      <small>${esc(request.pricing_type||'')}</small>
     </td>

     <td>
      <strong>${peso(request.price)}</strong>
      <br>
      <small>${esc(request.stock)} stock</small>
     </td>

     <td>${esc(sellerName)}</td>

     <td>
      <span class="pm-badge pending">
       Pending
      </span>
     </td>

     <td>
      <button
       type="button"
       class="pm-row-btn"
       data-approve="${esc(request.id)}"
       ${reviewing?'disabled':''}
      >Approve</button>

      <button
       type="button"
       class="pm-row-btn danger"
       data-reject="${esc(request.id)}"
       ${reviewing?'disabled':''}
      >Reject</button>
     </td>
    </tr>
   `;
  }).join('')
  :`
   <tr>
    <td colspan="7" class="empty">
     No pending product requests found.
    </td>
   </tr>
  `;
}

async function reviewRequest(id,approve){
 if(reviewing)return;

 const request=requests.find(row=>row.id===id);

 if(!request||norm(request.status)!=='pending')return;

 const message=approve
  ?`Approve and publish "${request.product_name}"?`
  :`Reject "${request.product_name}"?`;

 if(!confirm(message))return;

 reviewing=true;
 renderRequests();

 try{
  const {data,error}=await client.rpc(
   'admin_review_product_request',
   {
    p_request_id:id,
    p_approve:approve
   }
  );

  if(error)throw error;

  // Confirm the request was actually reviewed.
  const {data:updated,error:verifyError}=await client
   .from('product_requests')
   .select('id,status')
   .eq('id',id)
   .single();

  if(verifyError)throw verifyError;

  const expected=approve?'approved':'rejected';

  if(norm(updated?.status)!==expected){
   throw new Error(
    'The request status was not updated as expected.'
   );
  }

  if(approve){
   // Verify that the approved listing exists.
   // The database RPC is responsible for creating it.
   const {data:products,error:productError}=await client
    .from('products')
    .select('id,name,seller_id,is_active,created_at')
    .eq('seller_id',request.seller_id)
    .ilike('name',request.product_name)
    .order('created_at',{ascending:false})
    .limit(20);

   if(productError){
    console.warn(
     'Unable to verify published product:',
     productError.message
    );
   }else{
    const published=(products||[]).some(product=>
     norm(product.name)===norm(request.product_name)&&
     product.is_active===true
    );

    if(!published){
     await loadRequests();

     alert(
      'The request was approved, but an active product '+
      'listing could not be confirmed. Check the products '+
      'table and the approval database function.'
     );

     return;
    }
   }
  }

  await loadRequests();

  alert(
   approve
    ?'Product request approved. Check Product Listings to confirm publication.'
    :'Product request rejected successfully.'
  );

 }catch(error){
  console.error('Review Product Request:',error);

  alert('Unable to review request: '+error.message);

  await loadRequests();

 }finally{
  reviewing=false;
  renderRequests();
 }
}

/* Events */

document.addEventListener('DOMContentLoaded',()=>{
 try{
  client=getClient();

  document.querySelectorAll('[data-pm-tab]').forEach(button=>{
   button.addEventListener('click',()=>{
    switchTab(button.dataset.pmTab);
   });
  });

  // Master List
  $('pmMasterAdd').addEventListener('click',()=>openMaster());
  $('pmMasterRefresh').addEventListener('click',loadMaster);
  $('pmMasterSearch').addEventListener('input',renderMaster);
  $('pmMasterClose').addEventListener('click',closeMaster);
  $('pmMasterForm').addEventListener('submit',saveMaster);

  // Existing dropdown selection
  $('pmBrandSelect').addEventListener('change',addBrand);
  $('pmCategorySelect').addEventListener('change',addCategory);

  // Remove selected brand
  $('pmSelectedBrands').addEventListener('click',event=>{
   const button=event.target.closest('[data-remove-brand]');

   if(!button)return;

   selectedBrands.delete(button.dataset.removeBrand);
   renderSelections();
  });

  // Remove selected category
  $('pmSelectedCategories').addEventListener('click',event=>{
   const button=event.target.closest('[data-remove-category]');

   if(!button)return;

   selectedCategories.delete(button.dataset.removeCategory);
   renderSelections();
  });

  // Edit master product
  $('pmMasterRows').addEventListener('click',event=>{
   const button=event.target.closest('[data-master-edit]');

   if(!button)return;

   const product=master.find(row=>
    row.id===button.dataset.masterEdit
   );

   if(product)openMaster(product);
  });

  // Product Requests
  $('pmRequestSearch').addEventListener('input',renderRequests);

  $('pmRequestsRefresh').addEventListener(
   'click',
   loadRequests
  );

  $('pmRequestRows').addEventListener('click',event=>{
   const approve=event.target.closest('[data-approve]');
   const reject=event.target.closest('[data-reject]');

   if(approve){
    reviewRequest(approve.dataset.approve,true);
   }else if(reject){
    reviewRequest(reject.dataset.reject,false);
   }
  });

  // Close Master List modal
  $('pmMasterModal').addEventListener('click',event=>{
   if(event.target===$('pmMasterModal')){
    closeMaster();
   }
  });

  document.addEventListener('keydown',event=>{
   if(
    event.key==='Escape'&&
    $('pmMasterModal').classList.contains('open')
   ){
    closeMaster();
   }
  });

  switchTab('prices');

 }catch(error){
  console.error('Product Management:',error);

  status('pmMasterStatus',error.message);
  status('pmRequestStatus',error.message);
 }
});
})();
