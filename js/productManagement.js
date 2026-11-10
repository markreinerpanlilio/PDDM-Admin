
(()=>{
'use strict';

const $=id=>document.getElementById(id);
const normalize=value=>String(value??'').trim().toLowerCase();

const escapeHTML=value=>String(value??'').replace(
 /[&<>"']/g,
 char=>({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  '"':'&quot;',
  "'":'&#39;'
 }[char])
);

const money=value=>
 '₱'+Number(value||0).toLocaleString('en-PH',{
  minimumFractionDigits:2,
  maximumFractionDigits:2
 });

let client=null;
let activeTab='prices';

let masterProducts=[];
let brands=[];
let categories=[];
let brandProducts=[];
let requests=[];
let sellers=[];

let editingProductId=null;
let selectedBrandIds=new Set();
let selectedCategoryIds=new Set();
let pendingBrands=[];
let pendingCategories=[];
let saving=false;
let reviewing=false;

function status(id,text){
 const element=$(id);
 if(element)element.textContent=text||'';
}

function getClient(){
 if(typeof db!=='undefined' && db?.from){
  return db;
 }

 if(window.supabaseClient?.from){
  return window.supabaseClient;
 }

 if(window.supabase?.from){
  return window.supabase;
 }

 throw new Error(
  'Supabase client not found. Check js/supabase.js.'
 );
}

function setTab(tab){
 activeTab=tab;

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

async function fetchAll(table,columns,orderColumn){
 const rows=[];
 const pageSize=500;

 for(let from=0;from<100000;from+=pageSize){
  let query=client
   .from(table)
   .select(columns)
   .range(from,from+pageSize-1);

  if(orderColumn){
   query=query.order(orderColumn,{ascending:true});
  }

  const {data,error}=await query;

  if(error)throw error;

  rows.push(...(data||[]));

  if(!data||data.length<pageSize)break;
 }

 return rows;
}

async function loadMaster(){
 status('pmMasterStatus','Loading Master List...');

 try{
  const results=await Promise.all([
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

  [
   masterProducts,
   brands,
   categories,
   brandProducts
  ]=results;

  status(
   'pmMasterStatus',
   `${masterProducts.length} master products`
  );

  renderMaster();
  populateSelectors();

 }catch(error){
  console.error('Master List:',error);
  status('pmMasterStatus',error.message);
 }
}

function linkedBrandIds(productId){
 return [
  ...new Set(
   brandProducts
    .filter(link=>link.master_product_id===productId)
    .map(link=>link.brand_id)
    .filter(Boolean)
  )
 ];
}

function linkedCategoryIds(productId){
 return [
  ...new Set(
   brandProducts
    .filter(link=>link.master_product_id===productId)
    .map(link=>link.category_id)
    .filter(Boolean)
  )
 ];
}

function namesFromIds(ids,records){
 return ids
  .map(id=>records.find(record=>record.id===id)?.name)
  .filter(Boolean);
}

function renderMaster(){
 const search=normalize($('pmMasterSearch').value);

 const filtered=masterProducts.filter(product=>{
  const brandNames=namesFromIds(
   linkedBrandIds(product.id),
   brands
  );

  const categoryNames=namesFromIds(
   linkedCategoryIds(product.id),
   categories
  );

  return normalize([
   product.product_name,
   ...brandNames,
   ...categoryNames
  ].join(' ')).includes(search);
 });

 $('pmMasterRows').innerHTML=filtered.length
  ?filtered.map(product=>{
   const brandNames=namesFromIds(
    linkedBrandIds(product.id),
    brands
   );

   const categoryNames=namesFromIds(
    linkedCategoryIds(product.id),
    categories
   );

   return `
    <tr>
     <td class="name">
      ${escapeHTML(product.product_name)}
     </td>

     <td>
      ${escapeHTML(brandNames.join(', ')||'—')}
     </td>

     <td>
      ${escapeHTML(categoryNames.join(', ')||'—')}
     </td>

     <td>
      <button
       class="pm-row-btn"
       type="button"
       data-master-edit="${escapeHTML(product.id)}"
      >
       Edit
      </button>
     </td>
    </tr>
   `;
  }).join('')
  :`
   <tr>
    <td colspan="4" class="empty">
     No master products found.
    </td>
   </tr>
  `;
}

function populateSelectors(){
 $('pmBrandSelect').innerHTML=`
  <option value="">Select a brand</option>
  ${brands.map(brand=>`
   <option value="${escapeHTML(brand.id)}">
    ${escapeHTML(brand.name)}
   </option>
  `).join('')}
 `;

 $('pmCategorySelect').innerHTML=`
  <option value="">Select a category</option>
  ${categories.map(category=>`
   <option value="${escapeHTML(category.id)}">
    ${escapeHTML(category.name)}
   </option>
  `).join('')}
 `;
}

function renderSelections(){
 const selectedBrands=brands.filter(brand=>
  selectedBrandIds.has(brand.id)
 );

 const selectedCategories=categories.filter(category=>
  selectedCategoryIds.has(category.id)
 );

 $('pmSelectedBrands').innerHTML=[
  ...selectedBrands.map(brand=>`
   <span class="pm-chip">
    ${escapeHTML(brand.name)}
    <button
     type="button"
     data-remove-brand="${escapeHTML(brand.id)}"
     aria-label="Remove ${escapeHTML(brand.name)}"
    >×</button>
   </span>
  `),
  ...pendingBrands.map((name,index)=>`
   <span class="pm-chip">
    ${escapeHTML(name)}
    <button
     type="button"
     data-remove-new-brand="${index}"
    >×</button>
   </span>
  `)
 ].join('');

 $('pmSelectedCategories').innerHTML=[
  ...selectedCategories.map(category=>`
   <span class="pm-chip">
    ${escapeHTML(category.name)}
    <button
     type="button"
     data-remove-category="${escapeHTML(category.id)}"
    >×</button>
   </span>
  `),
  ...pendingCategories.map((name,index)=>`
   <span class="pm-chip">
    ${escapeHTML(name)}
    <button
     type="button"
     data-remove-new-category="${index}"
    >×</button>
   </span>
  `)
 ].join('');
}

function openMaster(product=null){
 editingProductId=product?.id||null;

 selectedBrandIds=new Set(
  product?linkedBrandIds(product.id):[]
 );

 selectedCategoryIds=new Set(
  product?linkedCategoryIds(product.id):[]
 );

 pendingBrands=[];
 pendingCategories=[];

 $('pmMasterModalTitle').textContent=
  product?'Edit Product':'Add Product';

 $('pmName').value=product?.product_name||'';

 // Default is NO for new products.
 // Existing records retain their saved setting.
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

 editingProductId=null;
 selectedBrandIds.clear();
 selectedCategoryIds.clear();
 pendingBrands=[];
 pendingCategories=[];
}

function addSelectedBrand(){
 const id=$('pmBrandSelect').value;

 if(id){
  selectedBrandIds.add(id);
  $('pmBrandSelect').value='';
  renderSelections();
 }
}

function addSelectedCategory(){
 const id=$('pmCategorySelect').value;

 if(id){
  selectedCategoryIds.add(id);
  $('pmCategorySelect').value='';
  renderSelections();
 }
}

function addNewBrand(){
 const name=$('pmNewBrand').value.trim();

 if(!name)return;

 const existing=brands.find(
  brand=>normalize(brand.name)===normalize(name)
 );

 if(existing){
  selectedBrandIds.add(existing.id);
 }else if(
  !pendingBrands.some(
   value=>normalize(value)===normalize(name)
  )
 ){
  pendingBrands.push(name);
 }

 $('pmNewBrand').value='';
 renderSelections();
}

function addNewCategory(){
 const name=$('pmNewCategory').value.trim();

 if(!name)return;

 const existing=categories.find(
  category=>normalize(category.name)===normalize(name)
 );

 if(existing){
  selectedCategoryIds.add(existing.id);
 }else if(
  !pendingCategories.some(
   value=>normalize(value)===normalize(name)
  )
 ){
  pendingCategories.push(name);
 }

 $('pmNewCategory').value='';
 renderSelections();
}

async function findOrCreate(table,name){
 const records=table==='brands'?brands:categories;

 const existing=records.find(
  record=>normalize(record.name)===normalize(name)
 );

 if(existing)return existing.id;

 const {data,error}=await client
  .from(table)
  .insert({name})
  .select('id')
  .single();

 if(error)throw error;

 return data.id;
}

async function saveMaster(event){
 event.preventDefault();

 if(saving)return;

 const name=$('pmName').value.trim();
 const allowUnbranded=$('pmAllowUnbranded').checked;

 if(!name){
  alert('Please enter a product name.');
  return;
 }

 const brandCount=
  selectedBrandIds.size+pendingBrands.length;

 const categoryCount=
  selectedCategoryIds.size+pendingCategories.length;

 if(!categoryCount){
  alert('Please select at least one category.');
  return;
 }

 if(!brandCount&&!allowUnbranded){
  alert(
   'Select at least one brand, or enable Allow unbranded listing.'
  );
  return;
 }

 // Current schema stores category associations only
 // in brand_products. A brand is therefore needed
 // to save a category relationship.
 if(!brandCount){
  alert(
   'Your current database cannot link categories directly '+
   'to an unbranded master product. Add a brand for now, '+
   'or update the database schema first.'
  );
  return;
 }

 const duplicate=masterProducts.find(product=>
  normalize(product.product_name)===normalize(name)&&
  product.id!==editingProductId
 );

 if(duplicate){
  alert('This master product already exists.');
  return;
 }

 saving=true;
 $('pmMasterSave').disabled=true;

 try{
  const payload={
   product_name:name,
   allow_unbranded:allowUnbranded
  };

  let productId=editingProductId;

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

  const finalBrandIds=[...selectedBrandIds];
  const finalCategoryIds=[...selectedCategoryIds];

  for(const name of pendingBrands){
   finalBrandIds.push(
    await findOrCreate('brands',name)
   );
  }

  for(const name of pendingCategories){
   finalCategoryIds.push(
    await findOrCreate('categories',name)
   );
  }

  const uniqueBrandIds=[...new Set(finalBrandIds)];
  const uniqueCategoryIds=[...new Set(finalCategoryIds)];

  // Each selected brand is associated with each
  // selected category for this master product.
  const desiredLinks=[];

  for(const brandId of uniqueBrandIds){
   for(const categoryId of uniqueCategoryIds){
    desiredLinks.push({
     brand_id:brandId,
     master_product_id:productId,
     category_id:categoryId
    });
   }
  }

  const {data:currentLinks,error:linksError}=
   await client
    .from('brand_products')
    .select('id,brand_id,category_id')
    .eq('master_product_id',productId);

  if(linksError)throw linksError;

  const sameLink=(a,b)=>
   a.brand_id===b.brand_id&&
   a.category_id===b.category_id;

  const toInsert=desiredLinks.filter(desired=>
   !(currentLinks||[]).some(current=>
    sameLink(current,desired)
   )
  );

  const toDelete=(currentLinks||[]).filter(current=>
   !desiredLinks.some(desired=>
    sameLink(current,desired)
   )
  );

  if(toInsert.length){
   const {error}=await client
    .from('brand_products')
    .insert(toInsert);

   if(error)throw error;
  }

  if(toDelete.length){
   const {error}=await client
    .from('brand_products')
    .delete()
    .in('id',toDelete.map(link=>link.id));

   if(error)throw error;
  }

  alert(
   editingProductId
    ?'Master product updated successfully.'
    :'Master product added successfully.'
  );

  $('pmMasterModal').classList.remove('open');

  await loadMaster();

 }catch(error){
  console.error('Save master product:',error);

  alert(
   'Unable to save product: '+error.message
  );

  // Note: these are separate database writes.
  // A failure can leave some changes saved.
 }finally{
  saving=false;
  $('pmMasterSave').disabled=false;
 }
}

async function loadRequests(){
 status('pmRequestStatus','Loading product requests...');

 try{
  const results=await Promise.all([
   fetchAll(
    'product_requests',
    'id,seller_id,product_name,brand_name,category_name,price,stock,pricing_type,weight,variant,unit,image_url,status,created_at',
    'created_at'
   ),
   fetchAll(
    'profiles',
    'id,full_name,email,role'
   )
  ]);

  requests=results[0].sort((a,b)=>
   new Date(b.created_at)-new Date(a.created_at)
  );

  sellers=results[1];

  const pending=requests.filter(
   request=>normalize(request.status)==='pending'
  ).length;

  $('pmPendingCount').textContent=
   pending?`(${pending})`:'';

  status(
   'pmRequestStatus',
   `${requests.length} requests · ${pending} pending`
  );

  renderRequests();

 }catch(error){
  console.error('Product Requests:',error);
  status('pmRequestStatus',error.message);
 }
}

function renderRequests(){
 const search=normalize($('pmRequestSearch').value);
 const filter=$('pmRequestFilter').value;

 const filtered=requests.filter(request=>{
  const seller=sellers.find(
   profile=>profile.id===request.seller_id
  );

  const matchesSearch=normalize([
   request.product_name,
   request.brand_name,
   request.category_name,
   request.variant,
   request.seller_id,
   seller?.full_name,
   seller?.email
  ].join(' ')).includes(search);

  const matchesStatus=
   filter==='all'||
   normalize(request.status)===filter;

  return matchesSearch&&matchesStatus;
 });

 $('pmRequestRows').innerHTML=filtered.length
  ?filtered.map(request=>{
   const seller=sellers.find(
    profile=>profile.id===request.seller_id
   );

   const state=normalize(request.status);
   const pending=state==='pending';

   const size=[
    request.variant,
    request.weight!=null
     ?`${request.weight}${request.unit||''}`
     :request.unit
   ].filter(Boolean).join(' · ')||'—';

   return `
    <tr>
     <td>
      <div class="name">
       ${escapeHTML(request.product_name)}
      </div>
      <small>
       ${escapeHTML(request.brand_name||'Unbranded')}
      </small>
     </td>

     <td>
      ${escapeHTML(request.category_name)}
     </td>

     <td>
      ${escapeHTML(size)}
      <br>
      <small>
       ${escapeHTML(request.pricing_type||'')}
      </small>
     </td>

     <td>
      <strong>${money(request.price)}</strong>
      <br>
      <small>${escapeHTML(request.stock)} stock</small>
     </td>

     <td>
      ${escapeHTML(
       seller?.full_name||
       seller?.email||
       request.seller_id.slice(0,8)+'…'
      )}
     </td>

     <td>
      <span class="pm-badge ${escapeHTML(state)}">
       ${escapeHTML(request.status)}
      </span>
     </td>

     <td>
      ${pending?`
       <div class="pm-actions">
        <button
         class="pm-row-btn"
         type="button"
         data-approve="${escapeHTML(request.id)}"
        >
         Approve
        </button>

        <button
         class="pm-row-btn danger"
         type="button"
         data-reject="${escapeHTML(request.id)}"
        >
         Reject
        </button>
       </div>
      `:'—'}
     </td>
    </tr>
   `;
  }).join('')
  :`
   <tr>
    <td colspan="7" class="empty">
     No product requests found.
    </td>
   </tr>
  `;
}

async function reviewRequest(id,approve){
 if(reviewing)return;

 const request=requests.find(item=>item.id===id);

 if(!request||normalize(request.status)!=='pending'){
  return;
 }

 const action=approve?'approve and publish':'reject';

 const confirmed=confirm(
  `Are you sure you want to ${action} this product?\n\n`+
  `${request.product_name}\n`+
  `Brand: ${request.brand_name||'Unbranded'}\n`+
  `Category: ${request.category_name}\n`+
  `Price: ${money(request.price)}`
 );

 if(!confirmed)return;

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

  alert(
   approve
    ?'Product approved and published successfully.'
    :'Product request rejected successfully.'
  );

  await loadRequests();

 }catch(error){
  console.error('Review request:',error);

  alert(
   'Unable to review request: '+error.message
  );

 }finally{
  reviewing=false;
 }
}

function bindEvents(){
 document.querySelectorAll('[data-pm-tab]').forEach(button=>{
  button.addEventListener('click',()=>{
   setTab(button.dataset.pmTab);
  });
 });

 $('pmMasterAdd').addEventListener('click',()=>{
  openMaster();
 });

 $('pmMasterRefresh').addEventListener(
  'click',loadMaster
 );

 $('pmMasterSearch').addEventListener(
  'input',renderMaster
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

 $('pmBrandSelect').addEventListener(
  'change',addSelectedBrand
 );

 $('pmCategorySelect').addEventListener(
  'change',addSelectedCategory
 );

 $('pmAddBrand').addEventListener(
  'click',addNewBrand
 );

 $('pmAddCategory').addEventListener(
  'click',addNewCategory
 );

 $('pmSelectedBrands').addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove-brand]');
  const removeNew=event.target.closest('[data-remove-new-brand]');

  if(remove){
   selectedBrandIds.delete(remove.dataset.removeBrand);
  }

  if(removeNew){
   pendingBrands.splice(
    Number(removeNew.dataset.removeNewBrand),1
   );
  }

  renderSelections();
 });

 $('pmSelectedCategories').addEventListener('click',event=>{
  const remove=event.target.closest('[data-remove-category]');
  const removeNew=event.target.closest('[data-remove-new-category]');

  if(remove){
   selectedCategoryIds.delete(remove.dataset.removeCategory);
  }

  if(removeNew){
   pendingCategories.splice(
    Number(removeNew.dataset.removeNewCategory),1
   );
  }

  renderSelections();
 });

 $('pmMasterRows').addEventListener('click',event=>{
  const button=event.target.closest('[data-master-edit]');

  if(!button)return;

  const product=masterProducts.find(
   item=>item.id===button.dataset.masterEdit
  );

  if(product)openMaster(product);
 });

 $('pmRequestSearch').addEventListener(
  'input',renderRequests
 );

 $('pmRequestFilter').addEventListener(
  'change',renderRequests
 );

 $('pmRequestsRefresh').addEventListener(
  'click',loadRequests
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

 $('pmMasterModal').addEventListener('click',event=>{
  if(event.target===$('pmMasterModal')){
   closeMaster();
  }
 });

 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   closeMaster();
  }
 });
}

document.addEventListener('DOMContentLoaded',()=>{
 try{
  client=getClient();
  bindEvents();
  setTab('prices');
 }catch(error){
  console.error('Product Management:',error);
  status('pmMasterStatus',error.message);
  status('pmRequestStatus',error.message);
 }
});

})();
