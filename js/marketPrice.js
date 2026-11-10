
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

const peso=v=>v===null||v===undefined||v===''
 ?'—'
 :'₱'+Number(v).toLocaleString('en-PH',{
  minimumFractionDigits:2,
  maximumFractionDigits:2
 });

let client;
let records=[];
let masterProducts=[];
let brands=[];
let categories=[];
let brandProducts=[];
let editingId=null;
let loading=false;
let saving=false;

function getClient(){
 if(typeof db!=='undefined'&&db?.from)return db;
 if(window.supabaseClient?.from)return window.supabaseClient;
 if(window.supabase?.from)return window.supabase;
 throw new Error('Supabase client not found. Check js/supabase.js.');
}

function setStatus(message){
 $('mpStatus').textContent=message||'';
}

function typeLabel(value){
 if(value==='per_kg')return 'Per kg';
 if(value==='fixed_size')return 'Fixed Size';
 return String(value||'—').replace(/_/g,' ');
}

function formatDate(value){
 if(!value)return '—';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '—';

 return date.toLocaleDateString('en-PH',{
  year:'numeric',
  month:'short',
  day:'numeric'
 });
}

async function fetchAll(table,columns,orderColumn='id'){
 const result=[];
 const batchSize=500;

 for(let offset=0;offset<100000;offset+=batchSize){
  const {data,error}=await client
   .from(table)
   .select(columns)
   .order(orderColumn,{ascending:true})
   .range(offset,offset+batchSize-1);

  if(error)throw error;

  result.push(...(data||[]));

  if(!data||data.length<batchSize)break;
 }

 return result;
}

async function loadCatalog(){
 const results=await Promise.all([
  fetchAll(
   'master_products',
   'id,product_name,allow_unbranded',
   'product_name'
  ),
  fetchAll('brands','id,name','name'),
  fetchAll('categories','id,name','name'),
  fetchAll(
   'brand_products',
   'id,brand_id,master_product_id,category_id'
  )
 ]);

 masterProducts=results[0];
 brands=results[1];
 categories=results[2];
 brandProducts=results[3];
}

async function loadPrices(){
 if(loading)return;

 loading=true;
 $('mpRefresh').disabled=true;
 setStatus('Loading market prices...');

 try{
  await loadCatalog();

  records=await fetchAll(
   'market_prices',
   'id,master_product_id,brand_id,product_name,category,size,min_price,max_price,pricing_type,created_at,updated_at',
   'id'
  );

  records.sort((a,b)=>
   String(a.product_name||'').localeCompare(
    String(b.product_name||'')
   )
  );

  populateProductOptions();
  buildFilters();
  renderPrices();

  setStatus(
   records.length
    ?`${records.length} market price records loaded.`
    :'No market price records found.'
  );

 }catch(error){
  console.error('Market Price load error:',error);

  $('marketPriceTable').innerHTML=`
   <tr>
    <td colspan="9" class="empty">
     ${esc(error.message)}
    </td>
   </tr>
  `;

  $('mpCount').textContent='';
  setStatus('Unable to load Market Price: '+error.message);

 }finally{
  loading=false;
  $('mpRefresh').disabled=false;
 }
}

function populateProductOptions(){
 const select=$('mpProductSelect');
 const selected=select.value;

 select.innerHTML=`
  <option value="">Select a product from Master List</option>
  ${masterProducts.map(product=>`
   <option value="${esc(product.id)}">
    ${esc(product.product_name)}
   </option>
  `).join('')}
 `;

 if(masterProducts.some(p=>p.id===selected)){
  select.value=selected;
 }
}

function getProduct(id){
 return masterProducts.find(p=>p.id===id)||null;
}

function getBrand(id){
 return brands.find(b=>b.id===id)||null;
}

function getCategory(id){
 return categories.find(c=>c.id===id)||null;
}

function getProductLinks(productId){
 return brandProducts.filter(link=>
  link.master_product_id===productId
 );
}

function getAvailableBrands(productId){
 const links=getProductLinks(productId);
 const ids=[...new Set(
  links.map(link=>link.brand_id).filter(Boolean)
 )];

 return brands.filter(brand=>ids.includes(brand.id));
}

function getAvailableCategories(productId,brandId){
 const links=getProductLinks(productId).filter(link=>
  link.brand_id===brandId
 );

 const ids=[...new Set(
  links.map(link=>link.category_id).filter(Boolean)
 )];

 return categories.filter(category=>ids.includes(category.id));
}

function updateBrandOptions(preferredBrand=''){
 const productId=$('mpProductSelect').value;
 const product=getProduct(productId);
 const select=$('mpBrandSelect');

 select.innerHTML='<option value="">Select a brand</option>';
 select.disabled=true;

 if(!productId){
  updateCategoryOptions();
  return;
 }

 const available=getAvailableBrands(productId);

 if(product?.allow_unbranded){
  select.innerHTML+='<option value="unbranded">Unbranded</option>';
 }

 select.innerHTML+=available.map(brand=>`
  <option value="${esc(brand.id)}">
   ${esc(brand.name)}
  </option>
 `).join('');

 select.disabled=false;

 if(preferredBrand==='unbranded'&&product?.allow_unbranded){
  select.value='unbranded';
 }else if(available.some(b=>b.id===preferredBrand)){
  select.value=preferredBrand;
 }else if(available.length===1&&!product?.allow_unbranded){
  select.value=available[0].id;
 }else if(!available.length&&product?.allow_unbranded){
  select.value='unbranded';
 }

 updateCategoryOptions();
}

function updateCategoryOptions(preferredCategory=''){
 const productId=$('mpProductSelect').value;
 const brandId=$('mpBrandSelect').value;
 const select=$('mpCategorySelect');

 select.innerHTML='<option value="">Select a category</option>';
 select.disabled=true;

 if(!productId||!brandId)return;

 let available=[];

 if(brandId==='unbranded'){
  const ids=[...new Set(
   getProductLinks(productId)
    .map(link=>link.category_id)
    .filter(Boolean)
  )];

  available=categories.filter(c=>ids.includes(c.id));
 }else{
  available=getAvailableCategories(productId,brandId);
 }

 select.innerHTML+=available.map(category=>`
  <option value="${esc(category.id)}">
   ${esc(category.name)}
  </option>
 `).join('');

 select.disabled=available.length===0;

 if(available.some(c=>c.id===preferredCategory)){
  select.value=preferredCategory;
 }else if(available.length===1){
  select.value=available[0].id;
 }

 if(!available.length){
  select.innerHTML=`
   <option value="">No registered category available</option>
  `;
 }
}

function getBrandName(row){
 if(!row.brand_id)return 'Unbranded';
 return getBrand(row.brand_id)?.name||'Unknown Brand';
}

function buildFilters(){
 const categorySelect=$('mpCategoryFilter');
 const brandSelect=$('mpBrandFilter');
 const typeSelect=$('mpTypeFilter');

 const selectedCategory=categorySelect.value;
 const selectedBrand=brandSelect.value;
 const selectedType=typeSelect.value;

 const categoryValues=[...new Set(
  records.map(r=>r.category).filter(Boolean)
 )].sort((a,b)=>a.localeCompare(b));

 const brandValues=[...new Set(
  records.map(r=>r.brand_id||'unbranded')
 )];

 const typeValues=[...new Set(
  records.map(r=>r.pricing_type).filter(Boolean)
 )];

 categorySelect.innerHTML=`
  <option value="">All Categories</option>
  ${categoryValues.map(value=>`
   <option value="${esc(value)}">${esc(value)}</option>
  `).join('')}
 `;

 brandSelect.innerHTML=`
  <option value="">All Brands</option>
  ${brandValues.map(id=>`
   <option value="${esc(id)}">
    ${esc(id==='unbranded'?'Unbranded':getBrand(id)?.name||'Unknown Brand')}
   </option>
  `).join('')}
 `;

 typeSelect.innerHTML=`
  <option value="">All Types</option>
  ${typeValues.map(value=>`
   <option value="${esc(value)}">${esc(typeLabel(value))}</option>
  `).join('')}
 `;

 categorySelect.value=categoryValues.includes(selectedCategory)
  ?selectedCategory:'';

 brandSelect.value=brandValues.includes(selectedBrand)
  ?selectedBrand:'';

 typeSelect.value=typeValues.includes(selectedType)
  ?selectedType:'';
}

function renderPrices(){
 const search=norm($('mpSearch').value);
 const category=$('mpCategoryFilter').value;
 const brand=$('mpBrandFilter').value;
 const type=$('mpTypeFilter').value;

 const filtered=records.filter(row=>{
  const brandName=getBrandName(row);

  const matchesSearch=norm([
   row.product_name,
   brandName,
   row.category,
   row.size,
   row.pricing_type
  ].join(' ')).includes(search);

  return matchesSearch
   &&(!category||row.category===category)
   &&(!brand||(row.brand_id||'unbranded')===brand)
   &&(!type||row.pricing_type===type);
 });

 $('marketPriceTable').innerHTML=filtered.length
  ?filtered.map(row=>`
   <tr>
    <td class="name">${esc(row.product_name)}</td>
    <td>${esc(getBrandName(row))}</td>
    <td>${esc(row.category||'—')}</td>
    <td>${esc(typeLabel(row.pricing_type))}</td>
    <td>${esc(row.size||'—')}</td>
    <td>${peso(row.min_price)}</td>
    <td><strong>${peso(row.max_price)}</strong></td>
    <td>${esc(formatDate(row.updated_at||row.created_at))}</td>
    <td>
     <button class="pm-row-btn" type="button"
      data-mp-edit="${esc(row.id)}">Edit</button>
     <button class="pm-row-btn danger" type="button"
      data-mp-delete="${esc(row.id)}">Delete</button>
    </td>
   </tr>
  `).join('')
  :`
   <tr>
    <td colspan="9" class="empty">
     No market prices found.
    </td>
   </tr>
  `;

 $('mpCount').textContent=
  `Showing ${filtered.length} of ${records.length} records. `+
  'Scroll inside the table to see more.';

 $('mpScrollArea').scrollTop=0;
}

function updateTypeFields(){
 const perKg=$('mpPricingType').value==='per_kg';

 $('mpSizeField').style.display=perKg?'none':'';
 $('mpMinField').style.display=perKg?'none':'';

 $('mpSize').required=!perKg;
 $('mpMinPrice').required=!perKg;

 $('mpPriceHint').textContent=perKg
  ?'Enter the maximum reference price per kilogram.'
  :'Enter the product size, minimum price, and maximum price.';
}

function openModal(row=null){
 editingId=row?.id||null;

 $('mpModalTitle').textContent=
  row?'Edit Market Price':'Add Market Price';

 populateProductOptions();

 $('mpProductSelect').value=row?.master_product_id||'';

 updateBrandOptions(
  row?(row.brand_id||'unbranded'):''
 );

 if(row?.category){
  const match=categories.find(c=>
   norm(c.name)===norm(row.category)
  );

  updateCategoryOptions(match?.id||'');
 }

 $('mpPricingType').value=row?.pricing_type||'fixed_size';
 $('mpSize').value=row?.size||'';
 $('mpMinPrice').value=row?.min_price??'';
 $('mpMaxPrice').value=row?.max_price??'';

 updateTypeFields();

 $('mpModal').classList.add('open');
 $('mpProductSelect').focus();
}

function closeModal(){
 if(saving)return;

 $('mpModal').classList.remove('open');
 editingId=null;
 $('mpForm').reset();
}

async function savePrice(event){
 event.preventDefault();
 if(saving)return;

 const productId=$('mpProductSelect').value;
 const brandValue=$('mpBrandSelect').value;
 const categoryId=$('mpCategorySelect').value;
 const pricingType=$('mpPricingType').value;

 const product=getProduct(productId);
 const category=getCategory(categoryId);
 const brandId=brandValue==='unbranded'?null:brandValue;

 if(!product){
  alert('Select a product from the Master List.');
  return;
 }

 if(!brandValue){
  alert('Select a brand.');
  return;
 }

 if(!brandId&&!product.allow_unbranded){
  alert('This product does not allow unbranded listings.');
  return;
 }

 if(!category){
  alert('Select a registered category.');
  return;
 }

 if(brandId){
  const valid=brandProducts.some(link=>
   link.master_product_id===productId&&
   link.brand_id===brandId&&
   link.category_id===categoryId
  );

  if(!valid){
   alert('This brand and category are not registered for the selected product.');
   return;
  }
 }

 const perKg=pricingType==='per_kg';
 const size=perKg?null:$('mpSize').value.trim();
 const minPrice=perKg
  ?null
  :Number($('mpMinPrice').value);
 const maxPrice=Number($('mpMaxPrice').value);

 if(!perKg&&!size){
  alert('Enter the product size.');
  return;
 }

 if(!Number.isFinite(maxPrice)||maxPrice<0){
  alert('Enter a valid maximum price.');
  return;
 }

 if(!perKg&&(
  $('mpMinPrice').value===''||
  !Number.isFinite(minPrice)||
  minPrice<0||
  minPrice>maxPrice
 )){
  alert('Enter a valid minimum price that does not exceed the maximum.');
  return;
 }

 const duplicate=records.some(row=>
  row.id!==editingId&&
  row.master_product_id===productId&&
  (row.brand_id||null)===(brandId||null)&&
  norm(row.category)===norm(category.name)&&
  norm(row.pricing_type)===norm(pricingType)&&
  norm(row.size)===norm(size)
 );

 if(duplicate){
  alert('A market price already exists for this product, brand, category, type, and size.');
  return;
 }

 const payload={
  master_product_id:productId,
  brand_id:brandId,
  product_name:product.product_name,
  category:category.name,
  pricing_type:pricingType,
  size:perKg?null:size,
  min_price:minPrice,
  max_price:maxPrice,
  updated_at:new Date().toISOString()
 };

 saving=true;
 $('mpSave').disabled=true;

 try{
  const query=editingId
   ?client.from('market_prices')
    .update(payload).eq('id',editingId)
   :client.from('market_prices')
    .insert(payload);

  const {error}=await query;
  if(error)throw error;

  $('mpModal').classList.remove('open');
  editingId=null;
  $('mpForm').reset();

  await loadPrices();

 }catch(error){
  console.error('Market Price save error:',error);
  alert('Unable to save market price: '+error.message);

 }finally{
  saving=false;
  $('mpSave').disabled=false;
 }
}

async function deletePrice(id){
 const row=records.find(r=>r.id===id);
 if(!row)return;

 if(!confirm(
  `Delete the market price for "${row.product_name}" (${getBrandName(row)})?`
 ))return;

 try{
  const {error}=await client
   .from('market_prices')
   .delete()
   .eq('id',id);

  if(error)throw error;

  await loadPrices();

 }catch(error){
  console.error('Market Price delete error:',error);
  alert('Unable to delete market price: '+error.message);
 }
}

document.addEventListener('DOMContentLoaded',()=>{
 try{
  client=getClient();

  $('mpRefresh').addEventListener('click',loadPrices);
  $('mpAdd').addEventListener('click',()=>openModal());

  $('mpSearch').addEventListener('input',renderPrices);
  $('mpCategoryFilter').addEventListener('change',renderPrices);
  $('mpBrandFilter').addEventListener('change',renderPrices);
  $('mpTypeFilter').addEventListener('change',renderPrices);

  $('mpProductSelect').addEventListener('change',()=>{
   updateBrandOptions();
  });

  $('mpBrandSelect').addEventListener('change',()=>{
   updateCategoryOptions();
  });

  $('mpPricingType').addEventListener('change',updateTypeFields);
  $('mpForm').addEventListener('submit',savePrice);

  $('mpModalClose').addEventListener('click',closeModal);
  $('mpCancel').addEventListener('click',closeModal);

  $('mpModal').addEventListener('click',event=>{
   if(event.target===$('mpModal'))closeModal();
  });

  $('marketPriceTable').addEventListener('click',event=>{
   const edit=event.target.closest('[data-mp-edit]');
   const remove=event.target.closest('[data-mp-delete]');

   if(edit){
    const row=records.find(r=>r.id===edit.dataset.mpEdit);
    if(row)openModal(row);
   }

   if(remove){
    deletePrice(remove.dataset.mpDelete);
   }
  });

  loadPrices();

 }catch(error){
  console.error(error);
  setStatus(error.message);
 }
});
})();
