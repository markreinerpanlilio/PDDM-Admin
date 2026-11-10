
(()=>{
"use strict";

const $=id=>document.getElementById(id);
const norm=v=>String(v??"").trim().toLowerCase();
const normalizeVariant=v=>norm(v).replace(/\s+/g,"");

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;",
 "<":"&lt;",
 ">":"&gt;",
 '"':"&quot;",
 "'":"&#39;"
}[c]));

const peso=v=>v===null||v===undefined||v===""
 ?"—"
 :"₱"+Number(v).toLocaleString("en-PH",{
  minimumFractionDigits:2,
  maximumFractionDigits:2
 });

const WEIGHT_CATEGORIES=[
 "meat",
 "meats",
 "fish",
 "fishes",
 "seafood",
 "seafoods",
 "poultry",
 "fresh meat",
 "fresh fish",
 "fresh seafood"
];

let client;
let records=[];
let masterProducts=[];
let brands=[];
let categories=[];
let brandProducts=[];

let selectedProductId=null;
let editingId=null;
let editingRecord=null;

let loading=false;
let saving=false;

function getClient(){
 if(typeof db!=="undefined"&&db?.from)return db;
 if(window.supabaseClient?.from)return window.supabaseClient;
 if(window.supabase?.from)return window.supabase;
 throw new Error("Supabase client not found. Check js/supabase.js.");
}

function setStatus(message){
 $("mpStatus").textContent=message||"";
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
  ?"per_kg"
  :"fixed_size";
}

function pricingLabel(type){
 return type==="per_kg"?"Per 1 kg":"Per Variant";
}

function formatDate(value){
 if(!value)return "—";

 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "—";

 return date.toLocaleDateString("en-PH",{
  year:"numeric",
  month:"short",
  day:"numeric"
 });
}

async function fetchAll(table,columns,orderColumn="id"){
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
   "master_products",
   "id,product_name,allow_unbranded",
   "product_name"
  ),
  fetchAll("brands","id,name","name"),
  fetchAll("categories","id,name","name"),
  fetchAll(
   "brand_products",
   "id,brand_id,master_product_id,category_id"
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
 $("mpRefresh").disabled=true;
 setStatus("Loading market prices...");

 try{
  const [catalogResult,pricesResult]=await Promise.allSettled([
   loadCatalog(),
   fetchAll(
    "market_prices",
    "id,master_product_id,brand_id,product_name,category,variant,min_price,max_price,pricing_type,created_at,updated_at"
   )
  ]);

  if(pricesResult.status==="rejected"){
   throw pricesResult.reason;
  }

  if(catalogResult.status==="rejected"){
   console.warn(
    "Unable to refresh Master List catalog:",
    catalogResult.reason
   );
  }

  records=pricesResult.value;

  records.sort((a,b)=>
   String(a.product_name||"").localeCompare(
    String(b.product_name||"")
   )
  );

  buildFilters();
  renderPrices();

  setStatus(
   records.length
    ?`${records.length} market price records loaded.`
    :"No market price records found."
  );

 }catch(error){
  console.error("Market Price load error:",error);

  $("marketPriceTable").innerHTML=`
   <tr>
    <td colspan="9" class="empty">
     ${esc(error.message)}
    </td>
   </tr>
  `;

  $("mpCount").textContent="";
  setStatus("Unable to load Market Price: "+error.message);

 }finally{
  loading=false;
  $("mpRefresh").disabled=false;
 }
}

function getBrandName(row){
 if(!row.brand_id)return "Unbranded";
 return getBrand(row.brand_id)?.name||"Unknown Brand";
}

function buildFilters(){
 const categorySelect=$("mpCategoryFilter");
 const brandSelect=$("mpBrandFilter");
 const typeSelect=$("mpTypeFilter");

 const previousCategory=categorySelect.value;
 const previousBrand=brandSelect.value;
 const previousType=typeSelect.value;

 const categoryValues=[...new Set(
  records.map(r=>r.category).filter(Boolean)
 )].sort((a,b)=>a.localeCompare(b));

 const brandValues=[...new Set(
  records.map(r=>r.brand_id||"unbranded")
 )];

 const typeValues=[...new Set(
  records.map(r=>r.pricing_type).filter(Boolean)
 )];

 categorySelect.replaceChildren(
  new Option("All Categories","")
 );

 categoryValues.forEach(value=>{
  categorySelect.add(new Option(value,value));
 });

 brandSelect.replaceChildren(
  new Option("All Brands","")
 );

 brandValues.forEach(id=>{
  const label=id==="unbranded"
   ?"Unbranded"
   :getBrand(id)?.name||"Unknown Brand";

  brandSelect.add(new Option(label,id));
 });

 typeSelect.replaceChildren(
  new Option("All Pricing Units","")
 );

 typeValues.forEach(value=>{
  typeSelect.add(new Option(pricingLabel(value),value));
 });

 categorySelect.value=categoryValues.includes(previousCategory)
  ?previousCategory:"";

 brandSelect.value=brandValues.includes(previousBrand)
  ?previousBrand:"";

 typeSelect.value=typeValues.includes(previousType)
  ?previousType:"";
}

function renderPrices(){
 const search=norm($("mpSearch").value);
 const category=$("mpCategoryFilter").value;
 const brand=$("mpBrandFilter").value;
 const type=$("mpTypeFilter").value;

 const filtered=records.filter(row=>{
  const searchable=norm([
   row.product_name,
   getBrandName(row),
   row.category,
   row.variant,
   row.pricing_type,
   pricingLabel(row.pricing_type)
  ].join(" "));

  return searchable.includes(search)
   &&(!category||row.category===category)
   &&(!brand||(row.brand_id||"unbranded")===brand)
   &&(!type||row.pricing_type===type);
 });

 $("marketPriceTable").innerHTML=filtered.length
  ?filtered.map(row=>`
   <tr>
    <td class="name">${esc(row.product_name)}</td>
    <td>${esc(getBrandName(row))}</td>
    <td>${esc(row.category||"—")}</td>
    <td>${esc(pricingLabel(row.pricing_type))}</td>
    <td>${esc(
     row.pricing_type==="per_kg"
      ?"1 kg"
      :row.variant||"—"
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
  `).join("")
  :`
   <tr>
    <td colspan="9" class="empty">
     No market prices found.
    </td>
   </tr>
  `;

 $("mpCount").textContent=
  `Showing ${filtered.length} of ${records.length} records. `+
  "Scroll inside the table to see more.";
}

function hideSuggestions(){
 $("mpSuggestions").hidden=true;
 $("mpProductSearch").setAttribute("aria-expanded","false");
}

function showSuggestions(){
 if(editingId)return;

 const query=norm($("mpProductSearch").value);

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

 const container=$("mpSuggestions");

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
  `).join("");
 }

 container.hidden=false;
 $("mpProductSearch").setAttribute("aria-expanded","true");
}

function resetProductSelection(){
 selectedProductId=null;

 $("mpProductSelected").textContent="";
 $("mpProductSelected").classList.remove("error");

 $("mpBrandSelect").replaceChildren(
  new Option("Select a product first","")
 );
 $("mpBrandSelect").disabled=true;

 $("mpCategorySelect").replaceChildren(
  new Option("Select a brand first","")
 );
 $("mpCategorySelect").disabled=true;

 updatePricingFields();
}

function selectProduct(productId){
 if(editingId)return;

 const product=getProduct(productId);
 if(!product)return;

 selectedProductId=product.id;
 $("mpProductSearch").value=product.product_name;
 $("mpProductSelected").textContent="Selected from Master List";
 $("mpProductSelected").classList.remove("error");

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

 if(brandValue!=="unbranded"){
  links=links.filter(link=>link.brand_id===brandValue);
 }

 const ids=new Set(
  links.map(link=>link.category_id).filter(Boolean)
 );

 return categories.filter(category=>ids.has(category.id));
}

function updateBrandOptions(preferred=""){
 const product=getProduct(selectedProductId);
 const select=$("mpBrandSelect");

 select.replaceChildren(new Option("Select a brand",""));
 select.disabled=true;

 if(!product){
  updateCategoryOptions();
  return;
 }

 const available=getAvailableBrands(product.id);

 if(product.allow_unbranded){
  select.add(new Option("Unbranded","unbranded"));
 }

 available.forEach(brand=>{
  select.add(new Option(brand.name,brand.id));
 });

 select.disabled=false;

 if(preferred==="unbranded"&&product.allow_unbranded){
  select.value="unbranded";
 }else if(available.some(b=>b.id===preferred)){
  select.value=preferred;
 }else if(available.length===1&&!product.allow_unbranded){
  select.value=available[0].id;
 }else if(!available.length&&product.allow_unbranded){
  select.value="unbranded";
 }

 updateCategoryOptions();
}

function updateCategoryOptions(preferred=""){
 const select=$("mpCategorySelect");
 const brandValue=$("mpBrandSelect").value;

 select.replaceChildren(new Option("Select a category",""));
 select.disabled=true;

 if(!selectedProductId||!brandValue){
  updatePricingFields();
  return;
 }

 const available=getAvailableCategories(
  selectedProductId,
  brandValue
 );

 available.forEach(category=>{
  select.add(new Option(category.name,category.id));
 });

 select.disabled=!available.length;

 if(available.some(c=>c.id===preferred)){
  select.value=preferred;
 }else if(available.length===1){
  select.value=available[0].id;
 }

 if(!available.length){
  select.replaceChildren(
   new Option("No registered category","")
  );
 }

 updatePricingFields();
}

function currentPricingType(){
 if(editingId&&editingRecord){
  return editingRecord.pricing_type||
   getPricingType(editingRecord.category);
 }

 const category=getCategory($("mpCategorySelect").value);
 return category?getPricingType(category.name):null;
}

function updatePricingFields(){
 const type=currentPricingType();
 const perKg=type==="per_kg";
 const fixed=type==="fixed_size";

 $("mpVariantField").hidden=!fixed;
 $("mpMinField").hidden=!fixed;

 $("mpVariant").disabled=!fixed;
 $("mpMinPrice").disabled=!fixed;

 $("mpVariant").required=fixed;
 $("mpMinPrice").required=fixed;

 if(perKg){
  $("mpVariant").value="1 kg";
  $("mpMinPrice").value="";
 }else if(!type){
  $("mpVariant").value="";
  $("mpMinPrice").value="";
 }else if(!editingId&&$("mpVariant").value==="1 kg"){
  $("mpVariant").value="";
 }

 $("mpMaxLabel").textContent=perKg
  ?"Reference Price per 1 kg (₱) *"
  :"Maximum Price (₱) *";

 $("mpPriceHint").textContent=!type
  ?"Select a product, brand, and category."
  :perKg
   ?"Enter the reference price for 1 kg."
   :"Enter the variant, minimum price, and maximum price.";
}

function openModal(row=null){
 if(saving)return;

 editingId=row?.id||null;
 editingRecord=row?{...row}:null;

 $("mpForm").reset();
 $("mpProductSearch").readOnly=false;

 resetProductSelection();
 hideSuggestions();

 $("mpModalTitle").textContent=row
  ?"Edit Market Price"
  :"Add Market Price";

 $("mpSave").textContent=row
  ?"Save Changes"
  :"Save Product";

 if(row){
  selectedProductId=row.master_product_id||null;

  $("mpProductSearch").value=row.product_name||"";
  $("mpProductSearch").readOnly=true;

  $("mpProductSelected").textContent="";
  $("mpProductHelp").textContent="";

  const brandValue=row.brand_id||"unbranded";
  const brandName=row.brand_id
   ?getBrand(row.brand_id)?.name||"Saved Brand"
   :"Unbranded";

  $("mpBrandSelect").replaceChildren(
   new Option(brandName,brandValue)
  );
  $("mpBrandSelect").value=brandValue;
  $("mpBrandSelect").disabled=true;

  $("mpCategorySelect").replaceChildren(
   new Option(row.category||"Uncategorized",row.category||"")
  );
  $("mpCategorySelect").value=row.category||"";
  $("mpCategorySelect").disabled=true;

  $("mpVariant").value=row.variant??"";
  $("mpMinPrice").value=row.min_price??"";
  $("mpMaxPrice").value=row.max_price??"";

 }else{
  $("mpProductSearch").value="";
  $("mpProductHelp").textContent=
   "Select a registered product from the Master List.";
  $("mpMaxPrice").value="";
 }

 updatePricingFields();

 $("mpModal").classList.add("open");

 if(row){
  $("mpMaxPrice").focus();
 }else{
  $("mpProductSearch").focus();
 }
}

function closeModal(){
 if(saving)return;

 $("mpModal").classList.remove("open");
 hideSuggestions();

 editingId=null;
 editingRecord=null;
 selectedProductId=null;

 $("mpForm").reset();
 $("mpProductSearch").readOnly=false;
 resetProductSelection();
}

function validatePrices(type){
 const perKg=type==="per_kg";

 const variant=perKg
  ?"1 kg"
  :$("mpVariant").value.trim();

 const maxText=$("mpMaxPrice").value;
 const minText=$("mpMinPrice").value;

 const maxPrice=Number(maxText);
 const minPrice=perKg?null:Number(minText);

 if(!variant){
  throw new Error("Enter the product variant.");
 }

 if(
  maxText===""||
  !Number.isFinite(maxPrice)||
  maxPrice<0
 ){
  throw new Error("Enter a valid reference price.");
 }

 if(!perKg&&(
  minText===""||
  !Number.isFinite(minPrice)||
  minPrice<0||
  minPrice>maxPrice
 )){
  throw new Error(
   "Minimum price must be valid and must not exceed maximum price."
  );
 }

 return {variant,minPrice,maxPrice};
}

function isDuplicate(identity,variant,excludeId=null){
 return records.some(row=>
  row.id!==excludeId&&
  row.master_product_id===identity.master_product_id&&
  (row.brand_id||null)===(identity.brand_id||null)&&
  norm(row.category)===norm(identity.category)&&
  row.pricing_type===identity.pricing_type&&
  normalizeVariant(row.variant)===normalizeVariant(variant)
 );
}

async function savePrice(event){
 event.preventDefault();
 if(saving)return;

 let payload;

 try{
  if(editingId){
   if(!editingRecord){
    throw new Error("The saved market price record was not found.");
   }

   const type=editingRecord.pricing_type||
    getPricingType(editingRecord.category);

   const values=validatePrices(type);

   const identity={
    master_product_id:editingRecord.master_product_id,
    brand_id:editingRecord.brand_id,
    category:editingRecord.category,
    pricing_type:type
   };

   if(isDuplicate(identity,values.variant,editingId)){
    throw new Error(
     "Another market price already exists for this product, brand, category, and variant."
    );
   }

   payload={
    variant:values.variant,
    min_price:values.minPrice,
    max_price:values.maxPrice,
    updated_at:new Date().toISOString()
   };

  }else{
   const product=getProduct(selectedProductId);
   const typedName=norm($("mpProductSearch").value);

   if(!product||typedName!==norm(product.product_name)){
    $("mpProductSelected").textContent=
     "Select an existing product from Master List.";
    $("mpProductSelected").classList.add("error");

    throw new Error(
     "You can only add products registered in the Master List."
    );
   }

   const brandValue=$("mpBrandSelect").value;
   const brandId=brandValue==="unbranded"
    ?null
    :brandValue;

   const categoryId=$("mpCategorySelect").value;
   const category=getCategory(categoryId);

   if(!brandValue){
    throw new Error("Select a brand.");
   }

   if(!brandId&&!product.allow_unbranded){
    throw new Error(
     "This product does not allow unbranded listings."
    );
   }

   if(
    brandId&&
    !getAvailableBrands(product.id)
     .some(brand=>brand.id===brandId)
   ){
    throw new Error(
     "The selected brand does not belong to this product."
    );
   }

   if(!category){
    throw new Error("Select a registered category.");
   }

   const validCategories=getAvailableCategories(
    product.id,
    brandValue
   );

   if(!validCategories.some(c=>c.id===category.id)){
    throw new Error(
     "This category is not registered for the selected product and brand."
    );
   }

   const type=getPricingType(category.name);
   const values=validatePrices(type);

   const identity={
    master_product_id:product.id,
    brand_id:brandId,
    category:category.name,
    pricing_type:type
   };

   if(isDuplicate(identity,values.variant)){
    throw new Error(
     "A reference price already exists for this product, brand, category, and variant."
    );
   }

   payload={
    ...identity,
    product_name:product.product_name,
    variant:values.variant,
    min_price:values.minPrice,
    max_price:values.maxPrice,
    updated_at:new Date().toISOString()
   };
  }

 }catch(error){
  alert(error.message);
  return;
 }

 saving=true;
 $("mpSave").disabled=true;
 $("mpModalClose").disabled=true;

 try{
  const wasEditing=Boolean(editingId);

  if(wasEditing){
   const {data,error}=await client
    .from("market_prices")
    .update(payload)
    .eq("id",editingId)
    .select("id")
    .single();

   if(error)throw error;
   if(!data?.id){
    throw new Error("Market price was not updated.");
   }

  }else{
   const {data,error}=await client
    .from("market_prices")
    .insert(payload)
    .select("id")
    .single();

   if(error)throw error;
   if(!data?.id){
    throw new Error("Market price was not created.");
   }
  }

  $("mpModal").classList.remove("open");
  hideSuggestions();

  editingId=null;
  editingRecord=null;
  selectedProductId=null;

  $("mpForm").reset();

  await loadPrices();

  setStatus(
   wasEditing
    ?"Market price updated successfully."
    :"Market price added successfully."
  );

 }catch(error){
  console.error("Market Price save error:",error);

  alert(
   "Unable to save market price: "+error.message
  );

 }finally{
  saving=false;
  $("mpSave").disabled=false;
  $("mpModalClose").disabled=false;
 }
}

async function deletePrice(id){
 if(saving)return;

 const row=records.find(r=>r.id===id);
 if(!row)return;

 if(!confirm(
  `Delete the market price for "${row.product_name}" (${getBrandName(row)})?`
 ))return;

 try{
  const {data,error}=await client
   .from("market_prices")
   .delete()
   .eq("id",id)
   .select("id");

  if(error)throw error;

  if(!data?.length){
   throw new Error("Market price was not deleted.");
  }

  await loadPrices();
  setStatus("Market price deleted successfully.");

 }catch(error){
  console.error("Market Price delete error:",error);

  alert(
   "Unable to delete market price: "+error.message
  );
 }
}

function setupAutocomplete(){
 const input=$("mpProductSearch");
 const suggestions=$("mpSuggestions");

 input.addEventListener("focus",()=>{
  if(!editingId)showSuggestions();
 });

 input.addEventListener("input",()=>{
  if(editingId)return;

  const product=getProduct(selectedProductId);

  if(!product||norm(input.value)!==norm(product.product_name)){
   resetProductSelection();
  }

  showSuggestions();
 });

 input.addEventListener("keydown",event=>{
  if(event.key==="Escape"){
   hideSuggestions();
   return;
  }

  if(event.key==="Enter"&&!suggestions.hidden){
   const first=suggestions.querySelector("[data-product-id]");

   if(first){
    event.preventDefault();
    selectProduct(first.dataset.productId);
   }
  }
 });

 suggestions.addEventListener("click",event=>{
  const button=event.target.closest("[data-product-id]");

  if(button){
   selectProduct(button.dataset.productId);
  }
 });

 document.addEventListener("click",event=>{
  if(!$("mpProductAutocomplete").contains(event.target)){
   hideSuggestions();
  }
 });
}

document.addEventListener("DOMContentLoaded",()=>{
 try{
  client=getClient();

  $("mpRefresh").addEventListener("click",loadPrices);
  $("mpAdd").addEventListener("click",()=>openModal());

  $("mpSearch").addEventListener("input",renderPrices);
  $("mpCategoryFilter").addEventListener("change",renderPrices);
  $("mpBrandFilter").addEventListener("change",renderPrices);
  $("mpTypeFilter").addEventListener("change",renderPrices);

  $("mpBrandSelect").addEventListener("change",()=>{
   if(!editingId)updateCategoryOptions();
  });

  $("mpCategorySelect").addEventListener("change",()=>{
   if(!editingId)updatePricingFields();
  });

  $("mpForm").addEventListener("submit",savePrice);

  $("mpModalClose").addEventListener("click",closeModal);

  $("mpModal").addEventListener("click",event=>{
   if(event.target===$("mpModal")){
    closeModal();
   }
  });

  document.addEventListener("keydown",event=>{
   if(
    event.key==="Escape"&&
    $("mpModal").classList.contains("open")
   ){
    if(!$("mpSuggestions").hidden){
     hideSuggestions();
    }else{
     closeModal();
    }
   }
  });

  $("marketPriceTable").addEventListener("click",event=>{
   const edit=event.target.closest("[data-mp-edit]");
   const remove=event.target.closest("[data-mp-delete]");

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
