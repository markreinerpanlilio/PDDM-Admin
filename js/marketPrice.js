
(()=>{
'use strict';

const $=id=>document.getElementById(id);
const norm=v=>String(v??'').trim().toLowerCase();
const normalizeVariant=v=>norm(v).replace(/\s+/g,'');

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

const WEIGHT_CATEGORIES=[
 'meat',
 'meats',
 'fish',
 'fishes',
 'seafood',
 'seafoods',
 'poultry',
 'fresh meat',
 'fresh fish',
 'fresh seafood'
];

let client;
let records=[];
let masterProducts=[];
let brands=[];
let categories=[];
let brandProducts=[];
let selectedProductId=null;
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

function getProduct(id){
 return masterProducts.find(p=>p.id===id)||null;
}

function getBrand(id){
 return brands.find(b=>b.id===id)||null;
}

function getCategory(id){
 return categories.find(c=>c.id===id)||null;
}

function getLinks(productId){
 return brandProducts.filter(link=>
  link.master_product_id===productId
 );
}

function getPricingType(categoryName){
 return WEIGHT_CATEGORIES.includes(norm(categoryName))
  ?'per_kg'
  :'fixed_size';
}

function pricingLabel(type){
 return type==='per_kg'?'Per 1 kg':'Per Variant';
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
 const rows=[];
 const batchSize=500;

 for(let offset=0;offset<100000;offset+=batchSize){
  const {data,error}=await client
   .from(table)
   .select(columns)
   .order(orderColumn,{ascending:true})
   .range(offset,offset+batchSize-1);

  if(error)throw error;

  rows.push(...(data||[]));

  if(!data||data.length<batchSize)break;
 }

 return rows;
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
   'id,master_product_id,brand_id,product_name,category,variant,min_price,max_price,pricing_type,created_at,updated_at'
  );

  records.sort((a,b)=>
   String(a.product_name||'').localeCompare(
    String(b.product_name||'')
   )
  );

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

function getBrandName(row){
 if(!row.brand_id)return 'Unbranded';

 return getBrand(row.brand_id)?.name||'Unknown Brand';
}

function buildFilters(){
 const categorySelect=$('mpCategoryFilter');
 const brandSelect=$('mpBrandFilter');
 const typeSelect=$('mpTypeFilter');

 const previousCategory=categorySelect.value;
 const previousBrand=brandSelect.value;
 const previousType=typeSelect.value;

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
    ${esc(
     id==='unbranded'
      ?'Unbranded'
      :getBrand(id)?.name||'Unknown Brand'
    )}
   </option>
  `).join('')}
 `;

 typeSelect.innerHTML=`
  <option value="">All Pricing Units</option>
  ${typeValues.map(value=>`
   <option value="${esc(value)}">
    ${esc(pricingLabel(value))}
   </option>
  `).join('')}
 `;

 categorySelect.value=categoryValues.includes(previousCategory)
  ?previousCategory:'';

 brandSelect.value=brandValues.includes(previousBrand)
  ?previousBrand:'';

 typeSelect.value=typeValues.includes(previousType)
  ?previousType:'';
}

function renderPrices(){
 const search=norm($('mpSearch').value);
 const category=$('mpCategoryFilter').value;
 const brand=$('mpBrandFilter').value;
 const type=$('mpTypeFilter').value;

 const filtered=records.filter(row=>{
  const searchable=norm([
   row.product_name,
   getBrandName(row),
   row.category,
   row.variant,
   row.pricing_type,
   pricingLabel(row.pricing_type)
  ].join(' '));

  return searchable.includes(search)
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
    <td>${esc(pricingLabel(row.pricing_type))}</td>
    <td>${esc(
     row.pricing_type==='per_kg'
      ?'1 kg'
      :row.variant||'—'
    )}</td>
    <td>${peso(row.min_price)}</td>
    <td><strong>${peso(row.max_price)}</strong></td>
    <td>${esc(formatDate(row.updated_at||row.created_at))}</td>
    <td>
     <button
      class="pm-row-btn"
      type="button"
      data-mp-edit="${esc(row.id)}"
     >Edit</button>
     <button
      class="pm-row-btn danger"
      type="button"
      data-mp-delete="${esc(row.id)}"
     >Delete</button>
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

function hideSuggestions(){
 $('mpSuggestions').hidden=true;
 $('mpProductSearch').setAttribute('aria-expanded','false');
}

function showSuggestions(){
 const query=norm($('mpProductSearch').value);

 const matches=masterProducts
  .filter(product=>
   !query||norm(product.product_name).includes(query)
  )
  .sort((a,b)=>{
   const aStart=norm(a.product_name).startsWith(query)?0:1;
   const bStart=norm(b.product_name).startsWith(query)?0:1;

   return aStart-bStart||
    a.product_name.localeCompare(b.product_name);
  })
  .slice(0,12);

 const container=$('mpSuggestions');

 if(!masterProducts.length){
  container.innerHTML=`
   <div class="mp-suggestion-empty">
    No products in Master List.
   </div>
  `;
 }else if(!matches.length){
  container.innerHTML=`
   <div class="mp-suggestion-empty">
    No matching product in Master List.
   </div>
  `;
 }else{
  container.innerHTML=matches.map(product=>`
   <button
    class="mp-suggestion"
    type="button"
    role="option"
    data-product-id="${esc(product.id)}"
   >
    ${esc(product.product_name)}
    <small>Master List product</small>
   </button>
  `).join('');
 }

 container.hidden=false;
 $('mpProductSearch').setAttribute('aria-expanded','true');
}

function resetProductSelection(){
 selectedProductId=null;

 $('mpProductSelected').textContent='';
 $('mpProductSelected').classList.remove('error');

 $('mpBrandSelect').innerHTML=`
  <option value="">Select a product first</option>
 `;
 $('mpBrandSelect').disabled=true;

 $('mpCategorySelect').innerHTML=`
  <option value="">Select a brand first</option>
 `;
 $('mpCategorySelect').disabled=true;

 updatePricingFields();
}

function selectProduct(productId){
 const product=getProduct(productId);

 if(!product)return;

 selectedProductId=product.id;
 $('mpProductSearch').value=product.product_name;
 $('mpProductSelected').textContent='Selected from Master List';
 $('mpProductSelected').classList.remove('error');

 hideSuggestions();
 updateBrandOptions();
}

function getAvailableBrands(productId){
 const ids=new Set(
  getLinks(productId)
   .map(link=>link.brand_id)
   .filter(Boolean)
 );

 return brands.filter(brand=>ids.has(brand.id));
}

function getAvailableCategories(productId,brandValue){
 let links=getLinks(productId);

 if(brandValue!=='unbranded'){
  links=links.filter(link=>link.brand_id===brandValue);
 }

 const ids=new Set(
  links.map(link=>link.category_id).filter(Boolean)
 );

 return categories.filter(category=>ids.has(category.id));
}

function updateBrandOptions(preferred=''){
 const product=getProduct(selectedProductId);
 const select=$('mpBrandSelect');

 select.innerHTML='<option value="">Select a brand</option>';
 select.disabled=true;

 if(!product){
  updateCategoryOptions();
  return;
 }

 const available=getAvailableBrands(product.id);

 if(product.allow_unbranded){
  select.innerHTML+=`
   <option value="unbranded">Unbranded</option>
  `;
 }

 select.innerHTML+=available.map(brand=>`
  <option value="${esc(brand.id)}">
   ${esc(brand.name)}
  </option>
 `).join('');

 select.disabled=false;

 if(preferred==='unbranded'&&product.allow_unbranded){
  select.value='unbranded';
 }else if(available.some(b=>b.id===preferred)){
  select.value=preferred;
 }else if(available.length===1&&!product.allow_unbranded){
  select.value=available[0].id;
 }else if(!available.length&&product.allow_unbranded){
  select.value='unbranded';
 }

 updateCategoryOptions();
}

function updateCategoryOptions(preferred=''){
 const select=$('mpCategorySelect');
 const brandValue=$('mpBrandSelect').value;

 select.innerHTML=`
  <option value="">Select a category</option>
 `;
 select.disabled=true;

 if(!selectedProductId||!brandValue){
  updatePricingFields();
  return;
 }

 const available=getAvailableCategories(
  selectedProductId,
  brandValue
 );

 select.innerHTML+=available.map(category=>`
  <option value="${esc(category.id)}">
   ${esc(category.name)}
  </option>
 `).join('');

 select.disabled=!available.length;

 if(available.some(c=>c.id===preferred)){
  select.value=preferred;
 }else if(available.length===1){
  select.value=available[0].id;
 }

 if(!available.length){
  select.innerHTML=`
   <option value="">No registered category</option>
  `;
 }

 updatePricingFields();
}

function updatePricingFields(){
 const category=getCategory($('mpCategorySelect').value);
 const type=category?getPricingType(category.name):null;
 const perKg=type==='per_kg';

 $('mpVariantField').style.display=perKg?'none':'';
 $('mpMinField').style.display=perKg?'none':'';

 $('mpVariant').required=Boolean(category&&!perKg);
 $('mpMinPrice').required=Boolean(category&&!perKg);

 $('mpUnitDisplay').textContent=!category
  ?'Select a category to determine the pricing unit.'
  :perKg
   ?'Per kilogram — 1 kg reference quantity'
   :'Per variant — fixed quantity or package';

 $('mpMaxLabel').textContent=perKg
  ?'Reference Price per 1 kg (₱)'
  :'Maximum Price (₱)';

 $('mpPriceHint').textContent=!category
  ?''
  :perKg
   ?'Example: Pork at ₱100 means ₱100 for 1 kg.'
   :'Enter a variant, minimum price, and maximum price.';
}

function openModal(row=null){
 editingId=row?.id||null;

 $('mpForm').reset();
 resetProductSelection();

 $('mpModalTitle').textContent=
  row?'Edit Market Price':'Add Market Price';

 if(row){
  const product=getProduct(row.master_product_id);

  if(product){
   selectProduct(product.id);

   updateBrandOptions(row.brand_id||'unbranded');

   const category=categories.find(c=>
    norm(c.name)===norm(row.category)
   );

   updateCategoryOptions(category?.id||'');
  }

  $('mpVariant').value=row.variant||'';
  $('mpMinPrice').value=row.min_price??'';
  $('mpMaxPrice').value=row.max_price??'';
 }

 updatePricingFields();

 $('mpModal').classList.add('open');
 $('mpProductSearch').focus();
}

function closeModal(){
 if(saving)return;

 $('mpModal').classList.remove('open');
 hideSuggestions();

 editingId=null;
 selectedProductId=null;

 $('mpForm').reset();
}

async function savePrice(event){
 event.preventDefault();

 if(saving)return;

 const product=getProduct(selectedProductId);
 const typedName=norm($('mpProductSearch').value);

 if(!product||typedName!==norm(product.product_name)){
  $('mpProductSelected').textContent=
   'Select an existing product from the suggestions.';

  $('mpProductSelected').classList.add('error');

  alert(
   'This product is not selected from Master List. '+
   'Choose an existing product before saving.'
  );
  return;
 }

 const brandValue=$('mpBrandSelect').value;
 const brandId=brandValue==='unbranded'?null:brandValue;
 const categoryId=$('mpCategorySelect').value;
 const category=getCategory(categoryId);

 if(!brandValue){
  alert('Select a brand.');
  return;
 }

 if(!brandId&&!product.allow_unbranded){
  alert('This product does not allow unbranded listings.');
  return;
 }

 if(brandId&&!getAvailableBrands(product.id)
  .some(b=>b.id===brandId)){
  alert('The selected brand does not belong to this product.');
  return;
 }

 if(!category){
  alert('Select a registered category.');
  return;
 }

 const validCategories=getAvailableCategories(
  product.id,
  brandValue
 );

 if(!validCategories.some(c=>c.id===category.id)){
  alert(
   'This category is not registered for the selected product and brand.'
  );
  return;
 }

 const pricingType=getPricingType(category.name);
 const perKg=pricingType==='per_kg';

 const variant=perKg?'1 kg':$('mpVariant').value.trim();
 const minPrice=perKg?null:Number($('mpMinPrice').value);
 const maxPrice=Number($('mpMaxPrice').value);

 if(!variant){
  alert('Enter the product variant.');
  return;
 }

 if(
  $('mpMaxPrice').value===''||
  !Number.isFinite(maxPrice)||
  maxPrice<0
 ){
  alert('Enter a valid reference price.');
  return;
 }

 if(!perKg&&(
  $('mpMinPrice').value===''||
  !Number.isFinite(minPrice)||
  minPrice<0||
  minPrice>maxPrice
 )){
  alert(
   'Enter a valid minimum price that does not exceed the maximum.'
  );
  return;
 }

 const duplicate=records.some(row=>
  row.id!==editingId&&
  row.master_product_id===product.id&&
  (row.brand_id||null)===(brandId||null)&&
  norm(row.category)===norm(category.name)&&
  row.pricing_type===pricingType&&
  normalizeVariant(row.variant)===normalizeVariant(variant)
 );

 if(duplicate){
  alert(
   'A reference price already exists for this product, '+
   'brand, category, and variant.'
  );
  return;
 }

 const payload={
  master_product_id:product.id,
  brand_id:brandId,
  product_name:product.product_name,
  category:category.name,
  pricing_type:pricingType,
  variant:variant,
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
  selectedProductId=null;

  $('mpForm').reset();

  await loadPrices();

 }catch(error){
  console.error('Market Price save error:',error);

  alert(
   'Unable to save market price: '+error.message
  );

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

  alert(
   'Unable to delete market price: '+error.message
  );
 }
}

function setupAutocomplete(){
 const input=$('mpProductSearch');
 const suggestions=$('mpSuggestions');

 input.addEventListener('focus',showSuggestions);

 input.addEventListener('input',()=>{
  const product=getProduct(selectedProductId);

  if(!product||norm(input.value)!==norm(product.product_name)){
   resetProductSelection();
  }

  showSuggestions();
 });

 input.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   hideSuggestions();
   return;
  }

  if(event.key==='Enter'&&!suggestions.hidden){
   const first=suggestions.querySelector('[data-product-id]');

   if(first){
    event.preventDefault();
    selectProduct(first.dataset.productId);
   }
  }
 });

 suggestions.addEventListener('click',event=>{
  const button=event.target.closest('[data-product-id]');

  if(button){
   selectProduct(button.dataset.productId);
  }
 });

 document.addEventListener('click',event=>{
  if(!$('mpProductAutocomplete').contains(event.target)){
   hideSuggestions();
  }
 });
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

  $('mpBrandSelect').addEventListener('change',()=>{
   updateCategoryOptions();
  });

  $('mpCategorySelect').addEventListener('change',()=>{
   updatePricingFields();
  });

  $('mpForm').addEventListener('submit',savePrice);

  $('mpModalClose').addEventListener('click',closeModal);
  $('mpCancel').addEventListener('click',closeModal);

  $('mpModal').addEventListener('click',event=>{
   if(event.target===$('mpModal')){
    closeModal();
   }
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

  setupAutocomplete();
  loadPrices();

 }catch(error){
  console.error(error);
  setStatus(error.message);
 }
});
})();
