(()=>{
'use strict';

const $=id=>document.getElementById(id);
const norm=v=>String(v??'').trim().toLowerCase();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;',
 '"':'&quot;',"'":'&#39;'
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
let newBrands=[];
let newCategories=[];
let saving=false;
let reviewing=false;

function getClient(){
 if(typeof db!=='undefined'&&db?.from)return db;
 if(window.supabaseClient?.from)return window.supabaseClient;
 if(window.supabase?.from)return window.supabase;
 throw new Error('Supabase client not found.');
}

function status(id,message){
 $(id).textContent=message||'';
}

function switchTab(tab){
 const sections={
  prices:'pmPrices',
  master:'pmMaster',
  requests:'pmRequests'
 };

 Object.entries(sections).forEach(([key,id])=>{
  $(id).hidden=key!==tab;
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

  status('pmMasterStatus',`${master.length} master products`);
  renderMaster();
  populateSelectors();

 }catch(error){
  console.error(error);
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
 $('pmBrandSelect').innerHTML=`
  <option value="">Select a brand</option>
  ${brands.map(b=>`
   <option value="${esc(b.id)}">${esc(b.name)}</option>
  `).join('')}
 `;

 $('pmCategorySelect').innerHTML=`
  <option value="">Select a category</option>
  ${categories.map(c=>`
   <option value="${esc(c.id)}">${esc(c.name)}</option>
  `).join('')}
 `;
}

function renderSelections(){
 $('pmSelectedBrands').innerHTML=[
  ...brands.filter(b=>selectedBrands.has(b.id)).map(b=>`
   <span class="pm-chip">
    ${esc(b.name)}
    <button type="button" data-remove-brand="${esc(b.id)}">×</button>
   </span>
  `),
  ...newBrands.map((name,i)=>`
   <span class="pm-chip">
    ${esc(name)}
    <button type="button" data-remove-new-brand="${i}">×</button>
   </span>
  `)
 ].join('');

 $('pmSelectedCategories').innerHTML=[
  ...categories.filter(c=>selectedCategories.has(c.id)).map(c=>`
   <span class="pm-chip">
    ${esc(c.name)}
    <button type="button" data-remove-category="${esc(c.id)}">×</button>
   </span>
  `),
  ...newCategories.map((name,i)=>`
   <span class="pm-chip">
    ${esc(name)}
    <button type="button" data-remove-new-category="${i}">×</button>
   </span>
  `)
 ].join('');
}

function openMaster(product=null){
 editId=product?.id||null;
 selectedBrands=new Set(product?brandIds(product.id):[]);
 selectedCategories=new Set(product?categoryIds(product.id):[]);
 newBrands=[];
 newCategories=[];

 $('pmMasterModalTitle').textContent=
  product?'Edit Product':'Add Product';

 $('pmName').value=product?.product_name||'';
 $('pmAllowUnbranded').checked=
  product?Boolean(product.allow_unbranded):false;

 $('pmNewBrand').value='';
 $('pmNewCategory').value='';

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

function addNewBrand(){
 const value=$('pmNewBrand').value.trim();
 if(!value)return;

 const existing=brands.find(b=>norm(b.name)===norm(value));

 if(existing){
  selectedBrands.add(existing.id);
 }else if(!newBrands.some(v=>norm(v)===norm(value))){
  newBrands.push(value);
 }

 $('pmNewBrand').value='';
 renderSelections();
}

function addNewCategory(){
 const value=$('pmNewCategory').value.trim();
 if(!value)return;

 const existing=categories.find(c=>norm(c.name)===norm(value));

 if(existing){
  selectedCategories.add(existing.id);
 }else if(!newCategories.some(v=>norm(v)===norm(value))){
  newCategories.push(value);
 }

 $('pmNewCategory').value='';
 renderSelections();
}

async function findOrCreate(table,name){
 const records=table==='brands'?brands:categories;
 const existing=records.find(r=>norm(r.name)===norm(name));
 if(existing)return existing.id;

 const {data,error}=await client.from(table)
  .insert({name})
  .select('id')
  .single();

 if(error)throw error;
 return data.id;
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

 if(!selectedCategories.size&&!newCategories.length){
  alert('Select at least one category.');
  return;
 }

 if(!selectedBrands.size&&!newBrands.length){
  alert(
   'Select at least one brand. The current database cannot '+
   'link a category directly to an unbranded master product.'
  );
  return;
 }

 const duplicate=master.some(p=>
  norm(p.product_name)===norm(product_name)&&p.id!==editId
 );

 if(duplicate){
  alert('This master product already exists.');
  return;
 }

 saving=true;
 $('pmMasterSave').disabled=true;

 try{
  let productId=editId;

  const payload={product_name,allow_unbranded};

  if(productId){
   const {error}=await client.from('master_products')
    .update(payload).eq('id',productId);
   if(error)throw error;
  }else{
   const {data,error}=await client.from('master_products')
    .insert(payload).select('id').single();
   if(error)throw error;
   productId=data.id;
  }

  const allBrands=[...selectedBrands];
  const allCategories=[...selectedCategories];

  for(const name of newBrands){
   allBrands.push(await findOrCreate('brands',name));
  }

  for(const name of newCategories){
   allCategories.push(await findOrCreate('categories',name));
  }

  const desired=[];

  for(const brand_id of new Set(allBrands)){
   for(const category_id of new Set(allCategories)){
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
   a.brand_id===b.brand_id&&a.category_id===b.category_id;

  const insert=desired.filter(d=>
   !(current||[]).some(c=>same(c,d))
  );

  const remove=(current||[]).filter(c=>
   !desired.some(d=>same(c,d))
  );

  if(insert.length){
   const {error}=await client.from('brand_products')
    .insert(insert);
   if(error)throw error;
  }

  if(remove.length){
   const {error}=await client.from('brand_products')
    .delete().in('id',remove.map(r=>r.id));
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
 }
}

async function loadRequests(){
 status('pmRequestStatus','Loading product requests...');

 try{
  // Main data comes directly from product_requests.
  requests=await fetchAll(
   'product_requests',
   'id,seller_id,product_name,brand_name,category_name,price,stock,pricing_type,weight,variant,unit,image_url,status,created_at',
   'created_at'
  );

  requests.sort((a,b)=>
   new Date(b.created_at)-new Date(a.created_at)
  );

  // Seller profiles are optional for display.
  // RLS on profiles must not hide the requests themselves.
  const {data,error}=await client.from('profiles')
   .select('id,full_name,email,role')
   .eq('role','seller');

  if(error){
   console.warn('Seller names unavailable:',error.message);
   sellers=[];
  }else{
   sellers=data||[];
  }

  const pending=requests.filter(r=>
   norm(r.status)==='pending'
  ).length;

  $('pmPendingCount').textContent=pending?`(${pending})`:'';
  status(
   'pmRequestStatus',
   `${requests.length} requests · ${pending} pending`
  );

  renderRequests();

 }catch(error){
  console.error('Product Requests:',error);
  status('pmRequestStatus','Unable to load: '+error.message);
  $('pmRequestRows').innerHTML=`
   <tr>
    <td colspan="7" class="empty">${esc(error.message)}</td>
   </tr>
  `;
 }
}

function renderRequests(){
 const search=norm($('pmRequestSearch').value);
 const filter=$('pmRequestFilter').value;

 const filtered=requests.filter(r=>{
  const seller=sellers.find(s=>s.id===r.seller_id);

  const match=norm([
   r.product_name,r.brand_name,r.category_name,
   r.variant,r.seller_id,seller?.full_name,seller?.email
  ].join(' ')).includes(search);

  return match&&(filter==='all'||norm(r.status)===filter);
 });

 $('pmRequestRows').innerHTML=filtered.length
  ?filtered.map(r=>{
   const seller=sellers.find(s=>s.id===r.seller_id);
   const state=norm(r.status);
   const size=[
    r.variant,
    r.weight!=null?`${r.weight}${r.unit||''}`:r.unit
   ].filter(Boolean).join(' · ')||'—';

   return `
    <tr>
     <td>
      <div class="name">${esc(r.product_name)}</div>
      <small>${esc(r.brand_name||'Unbranded')}</small>
     </td>
     <td>${esc(r.category_name)}</td>
     <td>
      ${esc(size)}
      <br><small>${esc(r.pricing_type||'')}</small>
     </td>
     <td>
      <strong>${peso(r.price)}</strong>
      <br><small>${esc(r.stock)} stock</small>
     </td>
     <td>
      ${esc(
       seller?.full_name||
       seller?.email||
       r.seller_id.slice(0,8)+'…'
      )}
     </td>
     <td>
      <span class="pm-badge ${esc(state)}">
       ${esc(r.status)}
      </span>
     </td>
     <td>
      ${state==='pending'?`
       <button
        type="button"
        class="pm-row-btn"
        data-approve="${esc(r.id)}"
       >Approve</button>
       <button
        type="button"
        class="pm-row-btn danger"
        data-reject="${esc(r.id)}"
       >Reject</button>
      `:'—'}
     </td>
    </tr>
   `;
  }).join('')
  :'<tr><td colspan="7" class="empty">No product requests found.</td></tr>';
}

async function reviewRequest(id,approve){
 if(reviewing)return;

 const request=requests.find(r=>r.id===id);
 if(!request||norm(request.status)!=='pending')return;

 if(!confirm(
  `${approve?'Approve and publish':'Reject'} ${request.product_name}?`
 ))return;

 reviewing=true;

 try{
  const {error}=await client.rpc(
   'admin_review_product_request',
   {
    p_request_id:id,
    p_approve:approve
   }
  );

  if(error)throw error;

  await loadRequests();

  alert(
   approve
    ?'Product approved and published.'
    :'Product request rejected.'
  );

 }catch(error){
  console.error('Review Product Request:',error);
  alert('Unable to review request: '+error.message);

 }finally{
  reviewing=false;
 }
}

document.addEventListener('DOMContentLoaded',()=>{
 try{
  client=getClient();

  document.querySelectorAll('[data-pm-tab]').forEach(button=>{
   button.addEventListener('click',()=>
    switchTab(button.dataset.pmTab)
   );
  });

  $('pmMasterAdd').addEventListener('click',()=>openMaster());
  $('pmMasterRefresh').addEventListener('click',loadMaster);
  $('pmMasterSearch').addEventListener('input',renderMaster);
  $('pmMasterClose').addEventListener('click',closeMaster);
  $('pmMasterCancel').addEventListener('click',closeMaster);
  $('pmMasterForm').addEventListener('submit',saveMaster);

  $('pmBrandSelect').addEventListener('change',addBrand);
  $('pmCategorySelect').addEventListener('change',addCategory);
  $('pmAddBrand').addEventListener('click',addNewBrand);
  $('pmAddCategory').addEventListener('click',addNewCategory);

  $('pmSelectedBrands').addEventListener('click',event=>{
   const old=event.target.closest('[data-remove-brand]');
   const fresh=event.target.closest('[data-remove-new-brand]');

   if(old)selectedBrands.delete(old.dataset.removeBrand);
   if(fresh)newBrands.splice(Number(fresh.dataset.removeNewBrand),1);

   renderSelections();
  });

  $('pmSelectedCategories').addEventListener('click',event=>{
   const old=event.target.closest('[data-remove-category]');
   const fresh=event.target.closest('[data-remove-new-category]');

   if(old)selectedCategories.delete(old.dataset.removeCategory);
   if(fresh)newCategories.splice(
    Number(fresh.dataset.removeNewCategory),1
   );

   renderSelections();
  });

  $('pmMasterRows').addEventListener('click',event=>{
   const button=event.target.closest('[data-master-edit]');
   if(!button)return;

   const product=master.find(p=>p.id===button.dataset.masterEdit);
   if(product)openMaster(product);
  });

  $('pmRequestSearch').addEventListener('input',renderRequests);
  $('pmRequestFilter').addEventListener('change',renderRequests);
  $('pmRequestsRefresh').addEventListener('click',loadRequests);

  $('pmRequestRows').addEventListener('click',event=>{
   const approve=event.target.closest('[data-approve]');
   const reject=event.target.closest('[data-reject]');

   if(approve)reviewRequest(approve.dataset.approve,true);
   else if(reject)reviewRequest(reject.dataset.reject,false);
  });

  $('pmMasterModal').addEventListener('click',event=>{
   if(event.target===$('pmMasterModal'))closeMaster();
  });

  switchTab('prices');

 }catch(error){
  console.error('Product Management:',error);
  status('pmMasterStatus',error.message);
  status('pmRequestStatus',error.message);
 }
});
})();
