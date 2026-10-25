let marketPriceData = [];
let sellerProductData = [];

const table = document.getElementById("marketPriceTable");
const sellerTable = document.getElementById("sellerProductsTable");

/* Safely display text from the database */
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function normalizeValue(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
}

function formatPrice(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? `₱${number.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`
        : "—";
}

function getProductSize(product) {
    const candidates = [
        product.variant,
        product.size,
        product.weight != null && product.unit
            ? `${product.weight}${product.unit}`
            : null,
        product.weight != null
            ? String(product.weight)
            : null
    ];

    return candidates.filter(
        value => value != null && String(value).trim() !== ""
    );
}

function getProductPricingType(product) {
    if (product.pricing_type === "per_kg") return "per_kg";
    if (product.pricing_type === "fixed_size") return "fixed_size";

    const sizes = getProductSize(product).map(normalizeValue);

    if (sizes.some(size => size === "kg" || size.endsWith("/kg"))) {
        return "per_kg";
    }

    return "fixed_size";
}

/* Find a matching benchmark for a seller product */
function findProductBenchmark(product) {
    const productName = normalizeValue(product.name);

    if (!productName) return null;

    const pricingType = getProductPricingType(product);
    const productCategory = normalizeValue(product.category);

    const benchmarks = marketPriceData.filter(benchmark => {
        if (normalizeValue(benchmark.product_name) !== productName) {
            return false;
        }

        if (
            productCategory &&
            benchmark.category &&
            productCategory !== normalizeValue(benchmark.category)
        ) {
            return false;
        }

        return benchmark.pricing_type === pricingType;
    });

    if (pricingType === "per_kg") {
        return benchmarks.find(
            benchmark => benchmark.max_price != null
        ) || null;
    }

    const productSizes = getProductSize(product).map(normalizeValue);

    if (!productSizes.length) return null;

    return benchmarks.find(benchmark =>
        benchmark.size != null &&
        productSizes.includes(normalizeValue(benchmark.size)) &&
        benchmark.min_price != null &&
        benchmark.max_price != null
    ) || null;
}

/* Compare seller price with the benchmark */
function compareSellerProduct(product) {
    const benchmark = findProductBenchmark(product);
    const sellingPrice = Number(product.price);

    if (
        product.price == null ||
        product.price === "" ||
        !Number.isFinite(sellingPrice) ||
        sellingPrice < 0
    ) {
        return {
            ...product,
            benchmark,
            sellingPrice: null,
            status: "missing",
            overpriceAmount: 0,
            overpricePercent: 0
        };
    }

    if (!benchmark) {
        return {
            ...product,
            benchmark: null,
            sellingPrice,
            status: "unmatched",
            overpriceAmount: 0,
            overpricePercent: 0
        };
    }

    const maxPrice = Number(benchmark.max_price);
    const minPrice = benchmark.min_price == null
        ? null
        : Number(benchmark.min_price);

    if (!Number.isFinite(maxPrice)) {
        return {
            ...product,
            benchmark: null,
            sellingPrice,
            status: "unmatched",
            overpriceAmount: 0,
            overpricePercent: 0
        };
    }

    if (sellingPrice > maxPrice) {
        const overpriceAmount = sellingPrice - maxPrice;

        return {
            ...product,
            benchmark,
            sellingPrice,
            status: "overpriced",
            overpriceAmount,
            overpricePercent: maxPrice > 0
                ? (overpriceAmount / maxPrice) * 100
                : Infinity
        };
    }

    if (minPrice != null && sellingPrice < minPrice) {
        return {
            ...product,
            benchmark,
            sellingPrice,
            status: "underpriced",
            overpriceAmount: 0,
            overpricePercent: 0
        };
    }

    return {
        ...product,
        benchmark,
        sellingPrice,
        status: "compliant",
        overpriceAmount: 0,
        overpricePercent: 0
    };
}

function getAllowedPrice(benchmark) {
    if (!benchmark) return "No benchmark";

    if (benchmark.pricing_type === "per_kg") {
        return `Maximum: ${formatPrice(benchmark.max_price)}/kg`;
    }

    return `${formatPrice(benchmark.min_price)} – ${formatPrice(benchmark.max_price)}`;
}

function getProductStatus(product) {
    switch (product.status) {
        case "overpriced":
            return `<span class="price-status overpriced">Overpriced +${formatPrice(product.overpriceAmount)}</span>`;

        case "underpriced":
            return `<span class="price-status underpriced">Below minimum</span>`;

        case "compliant":
            return `<span class="price-status compliant">Within range</span>`;

        case "missing":
            return `<span class="price-status no-benchmark">Missing price</span>`;

        default:
            return `<span class="price-status no-benchmark">No benchmark</span>`;
    }
}

/* Put products requiring attention first */
function sortSellerProducts(products) {
    const priority = {
        overpriced: 0,
        underpriced: 1,
        compliant: 2,
        missing: 3,
        unmatched: 4
    };

    return products.sort((a, b) => {
        const statusDifference = priority[a.status] - priority[b.status];

        if (statusDifference !== 0) return statusDifference;

        if (a.status === "overpriced") {
            if (b.overpricePercent !== a.overpricePercent) {
                return b.overpricePercent - a.overpricePercent;
            }

            return b.overpriceAmount - a.overpriceAmount;
        }

        return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

/* Load benchmark products */
async function loadMarketPrices() {
    if (!table || !sellerTable) {
        console.error("Market Price table elements are missing.");
        return;
    }

    table.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    try {
        const { data, error } = await db
            .from("market_prices")
            .select("*")
            .order("product_name", { ascending: true });

        if (error) throw error;

        marketPriceData = data || [];

        renderMarketPrices();
        await loadSellerProducts();
    } catch (error) {
        console.error("Failed to load market prices:", error);

        table.innerHTML =
            "<tr><td colspan='5'>Failed to load market prices. Check the console for details.</td></tr>";

        sellerTable.innerHTML =
            "<tr><td colspan='8'>Unable to load seller products.</td></tr>";
    }
}

/* Render benchmark table */
function renderMarketPrices() {
    if (!table) return;

    if (marketPriceData.length === 0) {
        table.innerHTML =
            "<tr><td colspan='5'>No products found.</td></tr>";
        return;
    }

    table.innerHTML = marketPriceData.map(product => {
        const isPerKg = product.pricing_type === "per_kg";

        const hasPricing = isPerKg
            ? product.max_price != null
            : product.min_price != null && product.max_price != null;

        let priceDisplay = "-";

        if (isPerKg && product.max_price != null) {
            priceDisplay = formatPrice(product.max_price);
        } else if (
            !isPerKg &&
            product.min_price != null &&
            product.max_price != null
        ) {
            priceDisplay =
                `${formatPrice(product.min_price)} - ${formatPrice(product.max_price)}`;
        }

        return `
            <tr>
                <td>${escapeHTML(product.product_name || "-")}</td>
                <td>${isPerKg ? "Per kg" : "Fixed Size"}</td>
                <td>${isPerKg ? "—" : escapeHTML(product.size || "-")}</td>
                <td>${priceDisplay}</td>
                <td>
                    <button
                        class="${hasPricing ? "edit-btn" : "add-pricing-btn"}"
                        onclick="openPricingModal('${escapeHTML(product.id)}')">
                        ${hasPricing ? "Edit" : "Add pricing"}
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    searchMarketPrice();
}

function searchMarketPrice() {
    const input = document.getElementById("searchPrice");

    if (!input || !table) return;

    const value = input.value.trim().toLowerCase();

    table.querySelectorAll("tr").forEach(row => {
        row.style.display =
            row.innerText.toLowerCase().includes(value) ? "" : "none";
    });
}

/* Load seller products and seller names */
async function loadSellerProducts() {
    if (!sellerTable) return;

    sellerTable.innerHTML =
        "<tr><td colspan='8'>Loading seller products...</td></tr>";

    try {
        const { data, error } = await db
            .from("products")
            .select("*")
            .order("name", { ascending: true });

        if (error) throw error;

        const products = data || [];

        const missingSellerIds = [...new Set(
            products
                .filter(product => !product.seller_name && product.seller_id)
                .map(product => product.seller_id)
        )];

        const sellerNames = {};

        if (missingSellerIds.length > 0) {
            const { data: sellers, error: sellerError } = await db
                .from("profiles")
                .select("id,full_name,email")
                .in("id", missingSellerIds);

            if (sellerError) {
                console.warn(
                    "Could not load seller names:",
                    sellerError.message
                );
            } else {
                (sellers || []).forEach(seller => {
                    sellerNames[seller.id] =
                        seller.full_name || seller.email || "Unknown seller";
                });
            }
        }

        sellerProductData = products.map(product => {
            const sellerName = product.seller_name ||
                sellerNames[product.seller_id] ||
                "Unknown seller";

            return compareSellerProduct({
                ...product,
                sellerDisplayName: sellerName
            });
        });

        sortSellerProducts(sellerProductData);
        renderSellerProducts();
    } catch (error) {
        console.error("Failed to load seller products:", error);

        sellerProductData = [];

        sellerTable.innerHTML =
            "<tr><td colspan='8'>Failed to load seller products. Check the console for details.</td></tr>";

        updateSellerProductSummary([]);
        populateSellerCategoryFilter();
    }
}

function updateSellerProductSummary(products) {
    const total = document.getElementById("sellerProductTotal");
    const overpriced = document.getElementById("overpricedProductTotal");
    const underpriced = document.getElementById("underpricedProductTotal");
    const unmatched = document.getElementById("unmatchedProductTotal");

    if (total) total.textContent = products.length;

    if (overpriced) {
        overpriced.textContent =
            products.filter(product => product.status === "overpriced").length;
    }

    if (underpriced) {
        underpriced.textContent =
            products.filter(product => product.status === "underpriced").length;
    }

    if (unmatched) {
        unmatched.textContent =
            products.filter(product => product.status === "unmatched").length;
    }
}

/* Populate Category dropdown in the table header */
function populateSellerCategoryFilter() {
    const categoryFilter =
        document.getElementById("sellerCategoryFilter");

    if (!categoryFilter) return;

    const selectedCategory = categoryFilter.value;

    const categories = [
        ...new Set(
            sellerProductData
                .map(product => String(product.category || "").trim())
                .filter(category => category !== "")
        )
    ].sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Category";
    categoryFilter.appendChild(defaultOption);

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });

    if (categories.includes(selectedCategory)) {
        categoryFilter.value = selectedCategory;
    }
}

/* Render seller product table */
function renderSellerProducts() {
    if (!sellerTable) return;

    updateSellerProductSummary(sellerProductData);
    populateSellerCategoryFilter();

    if (sellerProductData.length === 0) {
        sellerTable.innerHTML =
            "<tr><td colspan='8'>No seller products found.</td></tr>";
        return;
    }

    let overpriceRank = 0;

    sellerTable.innerHTML = sellerProductData.map(product => {
        const isOverpriced = product.status === "overpriced";

        if (isOverpriced) overpriceRank++;

        const pricingType = getProductPricingType(product);

        const sizeOrType = pricingType === "per_kg"
            ? "Per kg"
            : getProductSize(product).join(" / ") || "Fixed Size";

        const priceClass = isOverpriced
            ? "overpriced"
            : product.status === "underpriced"
                ? "underpriced"
                : product.status === "compliant"
                    ? "compliant"
                    : "";

        const priorityCell = isOverpriced
            ? `<span class="priority-number">${overpriceRank}</span>`
            : "—";

        const category = product.category || "-";
        const allowedPrice = getAllowedPrice(product.benchmark);

        return `
            <tr data-search="${escapeHTML([
                product.sellerDisplayName,
                product.name,
                category,
                sizeOrType,
                product.status
            ].join(" ").toLowerCase())}">
                <td>${priorityCell}</td>
                <td>${escapeHTML(product.sellerDisplayName)}</td>
                <td>${escapeHTML(product.name || "-")}</td>
                <td>${escapeHTML(category)}</td>
                <td>${escapeHTML(sizeOrType)}</td>
                <td class="seller-price-value ${priceClass}">
                    ${product.sellingPrice == null
                        ? "—"
                        : formatPrice(product.sellingPrice) +
                          (pricingType === "per_kg" ? "/kg" : "")}
                </td>
                <td>${escapeHTML(allowedPrice)}</td>
                <td>${getProductStatus(product)}</td>
            </tr>
        `;
    }).join("");

    searchSellerProducts();
}

/* Search and filter seller products */
function searchSellerProducts() {
    const input = document.getElementById("searchSellerProducts");
    const categoryFilter =
        document.getElementById("sellerCategoryFilter");

    if (!input || !sellerTable) return;

    const searchValue = input.value.trim().toLowerCase();

    const selectedCategory = categoryFilter
        ? categoryFilter.value.trim().toLowerCase()
        : "";

    sellerTable.querySelectorAll("tr[data-search]").forEach(row => {
        const matchesSearch =
            row.dataset.search.includes(searchValue);

        const categoryCell = row.querySelectorAll("td")[3];

        const rowCategory = categoryCell
            ? categoryCell.textContent.trim().toLowerCase()
            : "";

        const matchesCategory =
            !selectedCategory || rowCategory === selectedCategory;

        row.style.display =
            matchesSearch && matchesCategory ? "" : "none";
    });
}

/* FIX: Toggle between benchmark and seller product views */
function toggleMarketPriceView() {
    const benchmarkView = document.getElementById("marketPriceView");
    const sellerView = document.getElementById("sellerProductsView");
    const title = document.getElementById("marketPricePageTitle");
    const button = document.getElementById("toggleSellerProductsBtn");

    if (!benchmarkView || !sellerView || !title || !button) {
        console.error("Market Price view elements were not found.");
        return;
    }

    const showingBenchmarks =
        getComputedStyle(sellerView).display === "none";

    if (showingBenchmarks) {
        benchmarkView.style.display = "none";
        sellerView.style.display = "block";
        title.textContent = "Seller Product Price Monitoring";
        button.textContent = "Market Price";

        loadSellerProducts();
    } else {
        sellerView.style.display = "none";
        benchmarkView.style.display = "block";
        title.textContent = "Market Price";
        button.textContent = "Products";
    }
}

/* Create and display a modal */
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

function closeModal() {
    closePricingModal();
}

/* Add a benchmark product */
function openAddModal() {
    renderModal(`
        <h2>Add Product</h2>

        <label>Product Name</label>

        <div style="position:relative">
            <input
                type="text"
                id="modalProductName"
                placeholder="Enter product name"
                autocomplete="off"
                oninput="showProductSuggestions()"
                onfocus="showProductSuggestions()">

            <div
                id="productSuggestions"
                style="display:none;position:absolute;top:100%;left:0;width:100%;
                background:var(--surface);border:1px solid var(--border);
                border-radius:0 0 8px 8px;max-height:180px;overflow-y:auto;
                z-index:10001">
            </div>
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
        if (
            product.pricing_type === "fixed_size" &&
            product.product_name
        ) {
            const name = product.product_name.trim();

            if (!names.some(
                item => item.toLowerCase() === name.toLowerCase()
            )) {
                names.push(name);
            }
        }
    });

    return names.sort((a, b) => a.localeCompare(b));
}

function showProductSuggestions() {
    const input = document.getElementById("modalProductName");
    const suggestions = document.getElementById("productSuggestions");

    if (!input || !suggestions) return;

    const value = input.value.trim().toLowerCase();

    const filtered = getFixedSizeProductNames().filter(name =>
        name.toLowerCase().includes(value)
    );

    suggestions.innerHTML = "";

    if (filtered.length === 0) {
        suggestions.style.display = "none";
        return;
    }

    filtered.forEach(name => {
        const item = document.createElement("div");

        item.textContent = name;
        item.style.cssText =
            "padding:10px;cursor:pointer;border-bottom:1px solid var(--border)";

        item.onmouseover = () => {
            item.style.background = "var(--bg)";
        };

        item.onmouseout = () => {
            item.style.background = "var(--surface)";
        };

        item.onclick = () => {
            input.value = name;
            suggestions.style.display = "none";
        };

        suggestions.appendChild(item);
    });

    suggestions.style.display = "block";
}

/* Edit an existing benchmark */
function openPricingModal(id) {
    const product = marketPriceData.find(
        item => String(item.id) === String(id)
    );

    if (!product) {
        console.error("Product not found:", id);
        return;
    }

    const isPerKg = product.pricing_type === "per_kg";
    const hasPricing =
        product.max_price != null || product.min_price != null;

    renderModal(`
        <h2>${hasPricing ? "Edit Product Price" : "Set Product Price"}</h2>

        <label>Product Name</label>
        <input
            type="text"
            id="modalProductName"
            value="${escapeHTML(product.product_name || "")}"
            placeholder="Enter product name">

        <label>Type</label>

        <select id="modalPricingType" onchange="updatePricingFields()">
            <option value="per_kg" ${isPerKg ? "selected" : ""}>Per kg</option>
            <option value="fixed_size" ${!isPerKg ? "selected" : ""}>Fixed Size</option>
        </select>

        <div id="pricingFields"></div>

        <div class="modal-buttons">
            <button onclick="closePricingModal()">Cancel</button>
            <button
                class="save-btn"
                onclick="savePricing('${escapeHTML(product.id)}')">
                Save
            </button>
        </div>
    `);

    updatePricingFields(
        product.size || "",
        product.min_price,
        product.max_price
    );
}

/* Update fields when pricing type changes */
function updatePricingFields(
    currentSize = "",
    currentMinPrice = null,
    currentMaxPrice = null
) {
    const typeElement = document.getElementById("modalPricingType");
    const fields = document.getElementById("pricingFields");

    if (!typeElement || !fields) return;

    const isPerKg = typeElement.value === "per_kg";

    if (isPerKg) {
        fields.innerHTML = `
            <label>Size</label>
            <input
                type="text"
                value="--"
                disabled
                style="background:var(--bg)">

            <label>Maximum Price</label>
            <input
                type="number"
                id="modalMaxPrice"
                value="${currentMaxPrice ?? ""}"
                placeholder="Enter maximum price"
                min="0"
                step="0.01">
        `;
    } else {
        fields.innerHTML = `
            <label>Size</label>
            <input
                type="text"
                id="modalSize"
                value="${escapeHTML(currentSize || "")}"
                placeholder="Example: 35g, 100ml, Small">

            <label>Minimum Price</label>
            <input
                type="number"
                id="modalMinPrice"
                value="${currentMinPrice ?? ""}"
                placeholder="Enter minimum price"
                min="0"
                step="0.01">

            <label>Maximum Price</label>
            <input
                type="number"
                id="modalMaxPrice"
                value="${currentMaxPrice ?? ""}"
                placeholder="Enter maximum price"
                min="0"
                step="0.01">
        `;
    }
}

/* Save a new benchmark */
async function saveNewProduct() {
    const productName =
        document.getElementById("modalProductName").value.trim();

    const pricingType =
        document.getElementById("modalPricingType").value;

    if (!productName) {
        return alert("Please enter the product name.");
    }

    const normalizedName = productName.toLowerCase();

    if (pricingType === "per_kg") {
        const maxPrice =
            document.getElementById("modalMaxPrice").value;

        if (maxPrice === "" || !Number.isFinite(Number(maxPrice)) ||
            Number(maxPrice) < 0) {
            return alert("Please enter a valid maximum price.");
        }

        const duplicate = marketPriceData.find(item =>
            item.product_name &&
            item.product_name.trim().toLowerCase() === normalizedName
        );

        if (duplicate) {
            return alert(`${productName} already exists in the pricing list.`);
        }

        const { error } = await db.from("market_prices").insert([{
            product_name: productName,
            pricing_type: "per_kg",
            size: null,
            min_price: null,
            max_price: Number(maxPrice)
        }]);

        if (error) {
            console.error(error);
            return alert("Failed to add product: " + error.message);
        }

        alert("Product added successfully.");
        closePricingModal();
        await loadMarketPrices();
        return;
    }

    const size = document.getElementById("modalSize").value.trim();
    const minPrice = document.getElementById("modalMinPrice").value;
    const maxPrice = document.getElementById("modalMaxPrice").value;

    if (!size) {
        return alert("Please enter the product size.");
    }

    if (
        minPrice === "" ||
        maxPrice === "" ||
        !Number.isFinite(Number(minPrice)) ||
        !Number.isFinite(Number(maxPrice))
    ) {
        return alert("Please enter valid minimum and maximum prices.");
    }

    if (Number(minPrice) < 0 || Number(maxPrice) < 0) {
        return alert("Prices cannot be negative.");
    }

    if (Number(minPrice) > Number(maxPrice)) {
        return alert("Minimum price cannot be higher than maximum price.");
    }

    const normalizedSize = size.toLowerCase();

    const duplicate = marketPriceData.find(item =>
        item.product_name &&
        item.product_name.trim().toLowerCase() === normalizedName &&
        item.size &&
        item.size.trim().toLowerCase() === normalizedSize
    );

    if (duplicate) {
        return alert(
            `${productName} with size ${size} already exists in the pricing list.`
        );
    }

    const { error } = await db.from("market_prices").insert([{
        product_name: productName,
        pricing_type: "fixed_size",
        size,
        min_price: Number(minPrice),
        max_price: Number(maxPrice)
    }]);

    if (error) {
        console.error(error);
        return alert("Failed to add product: " + error.message);
    }

    alert("Product added successfully.");
    closePricingModal();
    await loadMarketPrices();
}

/* Save changes to an existing benchmark */
async function savePricing(id) {
    const product = marketPriceData.find(
        item => String(item.id) === String(id)
    );

    if (!product) {
        return alert("Product not found.");
    }

    const productName =
        document.getElementById("modalProductName").value.trim();

    const pricingType =
        document.getElementById("modalPricingType").value;

    if (!productName) {
        return alert("Please enter the product name.");
    }

    const normalizedName = productName.toLowerCase();

    if (pricingType === "per_kg") {
        const maxPrice =
            document.getElementById("modalMaxPrice").value;

        if (
            maxPrice === "" ||
            !Number.isFinite(Number(maxPrice)) ||
            Number(maxPrice) < 0
        ) {
            return alert("Please enter a valid maximum price.");
        }

        const duplicate = marketPriceData.find(item =>
            String(item.id) !== String(id) &&
            item.product_name &&
            item.product_name.trim().toLowerCase() === normalizedName
        );

        if (duplicate) {
            return alert(`${productName} already exists in the pricing list.`);
        }

        const { error } = await db
            .from("market_prices")
            .update({
                product_name: productName,
                pricing_type: "per_kg",
                size: null,
                min_price: null,
                max_price: Number(maxPrice)
            })
            .eq("id", id);

        if (error) {
            console.error(error);
            return alert("Failed to save pricing: " + error.message);
        }

        alert("Pricing saved successfully.");
        closePricingModal();
        await loadMarketPrices();
        return;
    }

    const size = document.getElementById("modalSize").value.trim();
    const minPrice = document.getElementById("modalMinPrice").value;
    const maxPrice = document.getElementById("modalMaxPrice").value;

    if (!size) {
        return alert("Please enter the product size.");
    }

    if (
        minPrice === "" ||
        maxPrice === "" ||
        !Number.isFinite(Number(minPrice)) ||
        !Number.isFinite(Number(maxPrice))
    ) {
        return alert("Please enter valid minimum and maximum prices.");
    }

    if (Number(minPrice) < 0 || Number(maxPrice) < 0) {
        return alert("Prices cannot be negative.");
    }

    if (Number(minPrice) > Number(maxPrice)) {
        return alert("Minimum price cannot be higher than maximum price.");
    }

    const normalizedSize = size.toLowerCase();

    const duplicate = marketPriceData.find(item =>
        String(item.id) !== String(id) &&
        item.product_name &&
        item.product_name.trim().toLowerCase() === normalizedName &&
        item.size &&
        item.size.trim().toLowerCase() === normalizedSize
    );

    if (duplicate) {
        return alert(
            `${productName} with size ${size} already exists in the pricing list.`
        );
    }

    const { error } = await db
        .from("market_prices")
        .update({
            product_name: productName,
            pricing_type: "fixed_size",
            size,
            min_price: Number(minPrice),
            max_price: Number(maxPrice)
        })
        .eq("id", id);

    if (error) {
        console.error(error);
        return alert("Failed to save pricing: " + error.message);
    }

    alert("Pricing saved successfully.");
    closePricingModal();
    await loadMarketPrices();
}

/* Initialize after the page loads */
document.addEventListener("DOMContentLoaded", () => {
    loadMarketPrices();
});
