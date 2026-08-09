let marketPriceData = [];
const table = document.getElementById("marketPriceTable");

async function loadMarketPrices() {
    table.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    const { data, error } = await db
        .from("market_prices")
        .select("*")
        .order("product_name", { ascending: true });

    if (error) {
        console.error(error);
        table.innerHTML = "<tr><td colspan='5'>Failed to load data.</td></tr>";
        return;
    }

    marketPriceData = data || [];
    table.innerHTML = "";

    if (marketPriceData.length === 0) {
        table.innerHTML = "<tr><td colspan='5'>No products found.</td></tr>";
        return;
    }

    marketPriceData.forEach(product => {
        const isPerKg = product.pricing_type === "per_kg";
        const hasPricing = isPerKg
            ? product.max_price !== null
            : product.min_price !== null && product.max_price !== null;

        let priceDisplay = "-";
        if (isPerKg && product.max_price !== null) {
            priceDisplay = `₱${Number(product.max_price).toFixed(2)}`;
        } else if (!isPerKg && product.min_price !== null && product.max_price !== null) {
            priceDisplay = `₱${Number(product.min_price).toFixed(2)} - ₱${Number(product.max_price).toFixed(2)}`;
        }

        table.innerHTML += `
            <tr>
                <td>${product.product_name || "-"}</td>
                <td>${isPerKg ? "Per kg" : "Fixed Size"}</td>
                <td>${isPerKg ? "—" : (product.size || "-")}</td>
                <td>${priceDisplay}</td>
                <td>
                    <button class="${hasPricing ? "edit-btn" : "add-pricing-btn"}" onclick="openPricingModal('${product.id}')">
                        ${hasPricing ? "Edit" : "Add pricing"}
                    </button>
                </td>
            </tr>
        `;
    });
}

function searchMarketPrice() {
    const value = document.getElementById("searchPrice").value.toLowerCase();
    table.querySelectorAll("tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(value) ? "" : "none";
    });
}

/* Shared modal shell — reuses .modal / .modal-content / .modal-buttons from style.css
   instead of re-declaring the same layout as inline styles every time. */
function renderModal(bodyHtml) {
    const oldModal = document.getElementById("pricingModal");
    if (oldModal) oldModal.remove();

    const modal = document.createElement("div");
    modal.id = "pricingModal";
    modal.className = "modal";
    modal.style.display = "flex";
    modal.innerHTML = `<div class="modal-content">${bodyHtml}</div>`;
    document.body.appendChild(modal);
    return modal;
}

function closePricingModal() {
    const modal = document.getElementById("pricingModal");
    if (modal) modal.remove();
}

/* Add product */
function openAddModal() {
    renderModal(`
        <h2>Add Product</h2>
        <label>Product Name</label>
        <div style="position:relative">
            <input type="text" id="modalProductName" placeholder="Enter product name" autocomplete="off"
                oninput="showProductSuggestions()" onfocus="showProductSuggestions()">
            <div id="productSuggestions" style="display:none;position:absolute;top:100%;left:0;width:100%;
                background:var(--surface);border:1px solid var(--border);border-radius:0 0 8px 8px;
                max-height:180px;overflow-y:auto;z-index:10001"></div>
        </div>
        <label>Type</label>
        <select id="modalPricingType" onchange="updatePricingFields()">
            <option value="per_kg">Per kg</option>
            <option value="fixed_size" selected>Fixed Size</option>
        </select>
        <div id="pricingFields"></div>
        <div class="modal-buttons">
            <button onclick="closePricingModal()">Cancel</button>
            <button class="save-btn" onclick="saveNewProduct()">Save</button>
        </div>
    `);
    updatePricingFields();
}

function getFixedSizeProductNames() {
    const names = [];
    marketPriceData.forEach(product => {
        if (product.pricing_type === "fixed_size" && product.product_name) {
            const name = product.product_name.trim();
            if (!names.some(item => item.toLowerCase() === name.toLowerCase())) names.push(name);
        }
    });
    return names.sort((a, b) => a.localeCompare(b));
}

function showProductSuggestions() {
    const input = document.getElementById("modalProductName");
    const suggestions = document.getElementById("productSuggestions");
    if (!input || !suggestions) return;

    const value = input.value.trim().toLowerCase();
    const filtered = getFixedSizeProductNames().filter(name => name.toLowerCase().includes(value));

    suggestions.innerHTML = "";
    if (filtered.length === 0) {
        suggestions.style.display = "none";
        return;
    }

    filtered.forEach(name => {
        const item = document.createElement("div");
        item.textContent = name;
        item.style.cssText = "padding:10px;cursor:pointer;border-bottom:1px solid var(--border)";
        item.onmouseover = () => item.style.background = "var(--bg)";
        item.onmouseout = () => item.style.background = "var(--surface)";
        item.onclick = () => { input.value = name; suggestions.style.display = "none"; };
        suggestions.appendChild(item);
    });
    suggestions.style.display = "block";
}

/* Edit existing product */
function openPricingModal(id) {
    const product = marketPriceData.find(item => item.id === id);
    if (!product) return console.error("Product not found:", id);

    const isPerKg = product.pricing_type === "per_kg";
    const hasPricing = product.max_price !== null || product.min_price !== null;

    renderModal(`
        <h2>${hasPricing ? "Edit Product Price" : "Set Product Price"}</h2>
        <label>Product Name</label>
        <input type="text" id="modalProductName" value="${product.product_name || ""}" placeholder="Enter product name">
        <label>Type</label>
        <select id="modalPricingType" onchange="updatePricingFields()">
            <option value="per_kg" ${isPerKg ? "selected" : ""}>Per kg</option>
            <option value="fixed_size" ${!isPerKg ? "selected" : ""}>Fixed Size</option>
        </select>
        <div id="pricingFields"></div>
        <div class="modal-buttons">
            <button onclick="closePricingModal()">Cancel</button>
            <button class="save-btn" onclick="savePricing('${product.id}')">Save</button>
        </div>
    `);
    updatePricingFields(product.size || "", product.min_price, product.max_price);
}

/* Pricing fields */
function updatePricingFields(currentSize = "", currentMinPrice = null, currentMaxPrice = null) {
    const typeElement = document.getElementById("modalPricingType");
    const fields = document.getElementById("pricingFields");
    if (!typeElement || !fields) return;

    const isPerKg = typeElement.value === "per_kg";

    if (isPerKg) {
        fields.innerHTML = `
            <label>Size</label>
            <input type="text" value="--" disabled style="background:var(--bg)">
            <label>Maximum Price</label>
            <input type="number" id="modalMaxPrice" value="${currentMaxPrice ?? ""}" placeholder="Enter maximum price" min="0" step="0.01">
        `;
    } else {
        fields.innerHTML = `
            <label>Size</label>
            <input type="text" id="modalSize" value="${currentSize || ""}" placeholder="Example: 35g, 100ml, Small">
            <label>Minimum Price</label>
            <input type="number" id="modalMinPrice" value="${currentMinPrice ?? ""}" placeholder="Enter minimum price" min="0" step="0.01">
            <label>Maximum Price</label>
            <input type="number" id="modalMaxPrice" value="${currentMaxPrice ?? ""}" placeholder="Enter maximum price" min="0" step="0.01">
        `;
    }
}

/* Save new product */
async function saveNewProduct() {
    const productName = document.getElementById("modalProductName").value.trim();
    const pricingType = document.getElementById("modalPricingType").value;
    if (!productName) return alert("Please enter the product name.");

    const normalizedName = productName.toLowerCase();

    if (pricingType === "per_kg") {
        const maxPrice = document.getElementById("modalMaxPrice").value;
        if (!maxPrice) return alert("Please enter the maximum price.");

        const duplicate = marketPriceData.find(item =>
            item.product_name && item.product_name.trim().toLowerCase() === normalizedName
        );
        if (duplicate) return alert(`${productName} already exists in the pricing list.`);

        const { error } = await db.from("market_prices").insert([{
            product_name: productName, pricing_type: "per_kg",
            size: null, min_price: null, max_price: Number(maxPrice)
        }]);
        if (error) { console.error(error); return alert("Failed to add product: " + error.message); }

        alert("Product added successfully.");
        closePricingModal();
        await loadMarketPrices();
        return;
    }

    const size = document.getElementById("modalSize").value.trim();
    const minPrice = document.getElementById("modalMinPrice").value;
    const maxPrice = document.getElementById("modalMaxPrice").value;

    if (!size) return alert("Please enter the product size.");
    if (!minPrice || !maxPrice) return alert("Please enter both minimum and maximum prices.");
    if (Number(minPrice) > Number(maxPrice)) return alert("Minimum price cannot be higher than maximum price.");

    const normalizedSize = size.toLowerCase();
    const duplicate = marketPriceData.find(item =>
        item.product_name && item.product_name.trim().toLowerCase() === normalizedName &&
        item.size && item.size.trim().toLowerCase() === normalizedSize
    );
    if (duplicate) return alert(`${productName} with size ${size} already exists in the pricing list.`);

    const { error } = await db.from("market_prices").insert([{
        product_name: productName, pricing_type: "fixed_size",
        size, min_price: Number(minPrice), max_price: Number(maxPrice)
    }]);
    if (error) { console.error(error); return alert("Failed to add product: " + error.message); }

    alert("Product added successfully.");
    closePricingModal();
    await loadMarketPrices();
}

/* Save existing product */
async function savePricing(id) {
    const product = marketPriceData.find(item => item.id === id);
    if (!product) return alert("Product not found.");

    const productName = document.getElementById("modalProductName").value.trim();
    const pricingType = document.getElementById("modalPricingType").value;
    if (!productName) return alert("Please enter the product name.");

    const normalizedName = productName.toLowerCase();

    if (pricingType === "per_kg") {
        const maxPrice = document.getElementById("modalMaxPrice").value;
        if (!maxPrice) return alert("Please enter the maximum price.");

        const duplicate = marketPriceData.find(item =>
            item.id !== id && item.product_name && item.product_name.trim().toLowerCase() === normalizedName
        );
        if (duplicate) return alert(`${productName} already exists in the pricing list.`);

        const { error } = await db.from("market_prices").update({
            product_name: productName, pricing_type: "per_kg",
            size: null, min_price: null, max_price: Number(maxPrice)
        }).eq("id", id);
        if (error) { console.error(error); return alert("Failed to save pricing: " + error.message); }

        alert("Pricing saved successfully.");
        closePricingModal();
        await loadMarketPrices();
        return;
    }

    const size = document.getElementById("modalSize").value.trim();
    const minPrice = document.getElementById("modalMinPrice").value;
    const maxPrice = document.getElementById("modalMaxPrice").value;

    if (!size) return alert("Please enter the product size.");
    if (!minPrice || !maxPrice) return alert("Please enter both minimum and maximum prices.");
    if (Number(minPrice) > Number(maxPrice)) return alert("Minimum price cannot be higher than maximum price.");

    const normalizedSize = size.toLowerCase();
    const duplicate = marketPriceData.find(item =>
        item.id !== id && item.product_name && item.product_name.trim().toLowerCase() === normalizedName &&
        item.size && item.size.trim().toLowerCase() === normalizedSize
    );
    if (duplicate) return alert(`${productName} with size ${size} already exists in the pricing list.`);

    const { error } = await db.from("market_prices").update({
        product_name: productName, pricing_type: "fixed_size",
        size, min_price: Number(minPrice), max_price: Number(maxPrice)
    }).eq("id", id);
    if (error) { console.error(error); return alert("Failed to save pricing: " + error.message); }

    alert("Pricing saved successfully.");
    closePricingModal();
    await loadMarketPrices();
}

document.addEventListener("DOMContentLoaded", loadMarketPrices);
