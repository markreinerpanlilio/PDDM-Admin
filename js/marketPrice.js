(()=>{
'use strict';

const $=id=>document.getElementById(id);
const norm=v=>String(v??'').trim().toLowerCase();

const html=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;',
 '"':'&quot;',"'":'&#39;'
}[c]));

const peso=v=>v==null||v===''
 ?'—'
 :'₱'+Number(v).toLocaleString('en-PH',{
  minimumFractionDigits:2,
  maximumFractionDigits:2
 });

let client;
let records=[];
let editingId=null;
let loading=false;
let saving=false;

function getClient(){
 if(typeof db!=='undefined'&&db?.from)return db;
 if(window.supabaseClient?.from)return window.supabaseClient;
 if(window.supabase?.from)return window.supabase;
 throw new Error('Supabase client not found. Check js/supabase.js.');
}

function setStatus(text){
 $('mpStatus').textContent=text||'';
}

async function fetchAll(){
 const all=[];
 const limit=500;

 for(let offset=0;offset<100000;offset+=limit){
  const {data,error}=await client
   .from('market_prices')
   .select(
    'id,product_name,size,category,min_price,max_price,pricing_type,created_at,updated_at'
   )
   .order('product_name',{ascending:true})
   .order('id',{ascending:true})
   .range(offset,offset+limit-1);

  if(error)throw error;

  all.push(...(data||[]));

  if(!data||data.length<limit)break;
 }

 return all;
}

async function loadPrices(){
 if(loading)return;

 loading=true;
 $('mpRefresh').disabled=true;
 setStatus('Loading market prices...');

 try{
  records=await fetchAll();

  buildFilters();
  renderPrices();

  if(!records.length){
   setStatus(
    'No market price records were returned. '+
    'Check whether the table has records and whether admin RLS allows SELECT.'
   );
  }else{
   setStatus(`${records.length} market price records loaded.`);
  }

 }catch(error){
  console.error('Market Price load error:',error);

  $('marketPriceTable').innerHTML=`
   <tr>
    <td colspan="8" class="empty">
     ${html(error.message)}
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

function buildFilters(){
 const categoryValue=$('mpCategoryFilter').value;
 const typeValue=$('mpTypeFilter').value;

 const categories=[
  ...new Set(records.map(r=>r.category).filter(Boolean))
 ].sort((a,b)=>a.localeCompare(b));

 const types=[
  ...new Set(records.map(r=>r.pricing_type).filter(Boolean))
 ].sort((a,b)=>a.localeCompare(b));

 $('mpCategoryFilter').innerHTML=`
  <option value="">All Categories</option>
  ${categories.map(v=>`
   <option value="${html(v)}">${html(v)}</option>
  `).join('')}
 `;

 $('mpTypeFilter').innerHTML=`
  <option value="">All Types</option>
  ${types.map(v=>`
   <option value="${html(v)}">${html(typeLabel(v))}</option>
  `).join('')}
 `;

 $('mpCategoryFilter').value=categories.includes(categoryValue)
  ?categoryValue:'';

 $('mpTypeFilter').value=types.includes(typeValue)
  ?typeValue:'';

 $('mpCategorySuggestions').innerHTML=categories.map(v=>
  `<option value="${html(v)}"></option>`
 ).join('');
}

function typeLabel(value){
 const type=norm(value);

 if(type==='per_kg')return 'Per kg';
 if(type==='fixed_size')return 'Fixed Size';

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

function renderPrices(){
 const search=norm($('mpSearch').value);
 const category=$('mpCategoryFilter').value;
 const type=$('mpTypeFilter').value;

 const filtered=records.filter(row=>{
  const matchesSearch=norm([
   row.product_name,
   row.category,
   row.size,
   row.pricing_type
  ].join(' ')).includes(search);

  return matchesSearch&&
   (!category||row.category===category)&&
   (!type||row.pricing_type===type);
 });

 $('marketPriceTable').innerHTML=filtered.length
  ?filtered.map(row=>`
   <tr>
    <td class="name">${html(row.product_name)}</td>
    <td>${html(row.category||'—')}</td>
    <td>${html(typeLabel(row.pricing_type))}</td>
    <td>${html(row.size||'—')}</td>
    <td>${peso(row.min_price)}</td>
    <td><strong>${peso(row.max_price)}</strong></td>
    <td>${html(formatDate(row.updated_at||row.created_at))}</td>
    <td>
     <button
      class="pm-row-btn"
      type="button"
      data-mp-edit="${html(row.id)}"
     >Edit</button>
     <button
      class="pm-row-btn danger"
      type="button"
      data-mp-delete="${html(row.id)}"
     >Delete</button>
    </td>
   </tr>
  `).join('')
  :`
   <tr>
    <td colspan="8" class="empty">
     No market prices found.
    </td>
   </tr>
  `;

 $('mpCount').textContent=
  `Showing ${filtered.length} of ${records.length} records. `+
  'Scroll inside the table to see more.';

 // Return to the first row after searching or filtering.
 $('mpScrollArea').scrollTop=0;
}

function updateTypeFields(){
 const perKg=$('mpPricingType').value==='per_kg';

 $('mpSizeField').style.display=perKg?'none':'';
 $('mpMinField').style.display=perKg?'none':'';

 $('mpSize').required=!perKg;
 $('mpMinPrice').required=!perKg;

 $('mpPriceHint').textContent=perKg
  ?'Per kg: enter the maximum reference price for one kilogram.'
  :'Fixed Size: enter size, minimum price, and maximum price.';
}

function openModal(row=null){
 editingId=row?.id||null;

 $('mpModalTitle').textContent=
  row?'Edit Market Price':'Add Market Price';

 $('mpProductName').value=row?.product_name||'';
 $('mpCategory').value=row?.category||'';
 $('mpSize').value=row?.size||'';
 $('mpMinPrice').value=row?.min_price??'';
 $('mpMaxPrice').value=row?.max_price??'';
 $('mpPricingType').value=row?.pricing_type||'fixed_size';

 // Preserve any older pricing type not listed in the form.
 if(row?.pricing_type&&
    $('mpPricingType').value!==row.pricing_type){
  const option=document.createElement('option');
  option.value=row.pricing_type;
  option.textContent=typeLabel(row.pricing_type);
  $('mpPricingType').appendChild(option);
  $('mpPricingType').value=row.pricing_type;
 }

 updateTypeFields();
 $('mpModal').classList.add('open');
 $('mpProductName').focus();
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

 const product_name=$('mpProductName').value.trim();
 const category=$('mpCategory').value.trim();
 const pricing_type=$('mpPricingType').value;
 const perKg=pricing_type==='per_kg';

 const size=perKg?null:($('mpSize').value.trim()||null);

 const min_price=perKg
  ?null
  :($('mpMinPrice').value===''?null:Number($('mpMinPrice').value));

 const max_price=Number($('mpMaxPrice').value);

 if(!product_name){
  alert('Product name is required.');
  return;
 }

 if(!Number.isFinite(max_price)||max_price<0){
  alert('Enter a valid maximum price.');
  return;
 }

 if(!perKg){
  if(!size){
   alert('Size is required for Fixed Size products.');
   return;
  }

  if(min_price===null||!Number.isFinite(min_price)||min_price<0){
   alert('Enter a valid minimum price.');
   return;
  }

  if(min_price>max_price){
   alert('Minimum price cannot exceed maximum price.');
   return;
  }
 }

 const payload={
  product_name,
  category:category||null,
  pricing_type,
  size,
  min_price,
  max_price,
  updated_at:new Date().toISOString()
 };

 saving=true;
 $('mpSave').disabled=true;

 try{
  const query=editingId
   ?client.from('market_prices')
    .update(payload).eq('id',editingId)
   :client.from('market_prices').insert(payload);

  const {error}=await query;
  if(error)throw error;

  $('mpModal').classList.remove('open');
  editingId=null;
  $('mpForm').reset();

  await loadPrices();

 }catch(error){
  console.error('Market Price save:',error);
  alert('Unable to save market price: '+error.message);

 }finally{
  saving=false;
  $('mpSave').disabled=false;
 }
}

async function deletePrice(id){
 const row=records.find(item=>item.id===id);
 if(!row)return;

 if(!confirm(
  `Delete the market price for "${row.product_name}"?`
 ))return;

 try{
  const {error}=await client
   .from('market_prices')
   .delete()
   .eq('id',id);

  if(error)throw error;

  await loadPrices();

 }catch(error){
  console.error('Market Price delete:',error);
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
  $('mpTypeFilter').addEventListener('change',renderPrices);

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

   if(remove)deletePrice(remove.dataset.mpDelete);
  });

  loadPrices();

 }catch(error){
  console.error(error);
  setStatus(error.message);
 }
});
})();
