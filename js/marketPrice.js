let marketPriceData = [];
let sellerProductData = [];
let sellerProductsLoaded = false;

const table = document.getElementById("marketPriceTable");
const sellerTable = document.getElementById("sellerProductsTable");

/* ------------------------------
   General helpers
------------------------------ */

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
    if (value == null || value === "") return "—";

    const number = Number(value);

    return Number.isFinite(number)
        ? `₱${number.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`
        : "—";
}

function showTableMessage(target, colspan, message) {
    if (!target) return;

    target.innerHTML = `
        <tr>
            <td colspan="${colspan}" class="mp-empty">
                ${escapeHTML(message)}
            </td>
        </tr>
    `;
}

/* ------------------------------
   Sidebar toggle
------------------------------ */

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const content = document.getElementById("content");
    const button = document.getElementById("menuToggleBtn");

    if (!sidebar || !content) return;

    const isCollapsed = sidebar.classList.contains("collapsed");

    sidebar.classList.toggle("collapsed", !isCollapsed);
    content.classList.toggle("collapsed-content", !isCollapsed);

    if (button) {
        button.setAttribute("aria-expanded", String(isCollapsed));
        button.setAttribute(
            "aria-label",
            isCollapsed ? "Close sidebar" : "Open sidebar"
        );
        button.title = isCollapsed ? "Close sidebar" : "Open sidebar";
    }
}

/* ------------------------------
   Switch between the two views
------------------------------ */

function toggleMarketPriceView() {
    const benchmarkView = document.getElementById("marketPriceView");
    const productsView = document.getElementById("sellerProductsView");
    const toggleButton = document.getElementById("toggleSellerProductsBtn");
    const title = document.getElementById("marketPricePageTitle");

    if (!benchmarkView || !productsView || !toggleButton) return;

    const showingProducts = productsView.style.display !== "none";

    if (showingProducts) {
        productsView.style.display = "none";
        benchmarkView.style.display = "";

        toggleButton.classList.remove("active");
        toggleButton.setAttribute("aria-pressed", "false");

        if (title) title.textContent = "Market Price";
        return;
    }

    benchmarkView.style.display = "none";
    productsView.style.display = "";

    toggleButton.classList.add("active");
    toggleButton.setAttribute("aria-pressed", "true");

    if (title) title.textContent = "Seller Products";

    if (!sellerProductsLoaded) {
        loadSellerProducts();
    }
}

/* ------------------------------
   Product size and pricing type
------------------------------ */

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

    return candidates.filter(value =>
        value != null && String(value).trim() !== ""
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

/* ------------------------------
   Match seller products to benchmarks
------------------------------ */

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
        return benchmarks.find(benchmark =>
            benchmark.max_price != null
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

function compareSellerProduct(product) {
    const benchmark = findProductBenchmark(product);

    const sellingPrice =
        product.price == null || product.price === ""
            ? null
            : Number(product.price);

    if (
        sellingPrice == null ||
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
            return `
                <span class="price-status overpriced">
                    Overpriced +${formatPrice(product.overpriceAmount)}
                </span>
            `;

        case "underpriced":
            return `
                <span class="price-status underpriced">
                    Below minimum
                </span>
            `;

        case "compliant":
            return `
                <span class="price-status compliant">
                    Within range
                </span>
            `;

        case "missing":
            return `
                <span class="price-status no-benchmark">
                    Missing price
                </span>
            `;

        default:
            return `
                <span class="price-status no-benchmark">
                    No benchmark
                </span>
            `;
    }
}

/* ------------------------------
   Sort seller products
------------------------------ */

function sortSellerProducts(products) {
    const priority = {
        overpriced: 0,
        underpriced: 1,
        compliant: 2,
        missing: 3,
        unmatched: 4
    };

    return products.sort((a, b) => {
        const statusDifference =
            priority[a.status] - priority[b.status];

        if (statusDifference !== 0) {
            return statusDifference;
        }

        if (a.status === "overpriced") {
            if (b.overpricePercent !== a.overpricePercent) {
                return b.overpricePercent - a.overpricePercent;
            }

            return b.overpriceAmount - a.overpriceAmount;
        }

        return String(a.name || "").localeCompare(String(b.name || ""));
    });
}

/* ------------------------------
   Load market benchmarks
------------------------------ */

async function loadMarketPrices() {
    if (!table || !sellerTable) return;

    showTableMessage(table, 5, "Loading market price benchmarks...");

    const { data, error } = await db
        .from("market_prices")
        .select("*")
        .order("product_name", { ascending: true });

    if (error) {
        console.error("Failed to load market benchmarks:", error);

        marketPriceData = [];
        showTableMessage(table, 5, "Failed to load market prices.");

        sellerProductsLoaded = false;
        return;
    }

    marketPriceData = data || [];

    renderMarketPrices();

    /*
     * Refresh seller comparisons when the benchmark list changes.
     * If the seller view has already been opened, update it too.
     */
    if (sellerProductsLoaded) {
        await loadSellerProducts();
    }
}

function renderMarketPrices() {
    if (!table) return;

    if (marketPriceData.length === 0) {
        showTableMessage(table, 5, "No market price benchmarks found.");
        return;
    }

    table.innerHTML = marketPriceData.map(product => {
        const isPerKg = product.pricing_type === "per_kg";

        const hasPricing = isPerKg
            ? product.max_price != null
            : product.min_price != null && product.max_price != null;

        let priceDisplay = "—";

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
                <td>${escapeHTML(product.product_name || "—")}</td>
                <td>${isPerKg ? "Per kg" : "Fixed Size"}</td>
                <td>${isPerKg ? "—" : escapeHTML(product.size || "—")}</td>
                <td>${priceDisplay}</td>
                <td>
                    <button
                        type="button"
                        class="${hasPricing ? "edit-btn" : "add-pricing-btn"}"
                        onclick="openPricingModal('${escapeHTML(product.id)}')"
                    >
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

/* ------------------------------
   Load seller products
------------------------------ */

async function loadSellerProducts() {
    if (!sellerTable) return;

    showTableMessage(sellerTable, 8, "Loading seller products...");

    const { data, error } = await db
        .from("products")
        .select("*")
        .order("name", { ascending: true });

    if (error) {
        console.error("Failed to load seller products:", error);

        sellerProductData = [];
        sellerProductsLoaded = false;

        showTableMessage(
            sellerTable,
            8,
            "Failed to load seller products. Check Supabase permissions."
        );

        updateSellerProductSummary([]);
        return;
    }

    const products = data || [];

    const missingSellerIds = [
        ...new Set(
            products
                .filter(product => !product.seller_name && product.seller_id)
                .map(product => product.seller_id)
        )
    ];

    const sellerNames = {};

    if (missingSellerIds.length) {
        const { data: sellers, error: sellerError } = await db
            .from("profiles")
            .select("id,full_name,email")
            .in("id", missingSellerIds);

        if (sellerError) {
            console.warn(
                "Could not load seller profile names:",
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
        const sellerName =
            product.seller_name ||
            sellerNames[product.seller_id] ||
            "Unknown seller";

        return compareSellerProduct({
            ...product,
            sellerDisplayName: sellerName
        });
    });

    sortSellerProducts(sellerProductData);

    sellerProductsLoaded = true;
    renderSellerProducts();
}

/* ------------------------------
   Seller summary and filters
------------------------------ */

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
            products.filter(product =>
                product.status === "unmatched" || product.status === "missing"
            ).length;
    }
}

function populateSellerCategoryFilter() {
    const select = document.getElementById("sellerCategoryFilter");
    if (!select) return;

    const currentValue = select.value;

    const categories = [
        ...new Set(
            sellerProductData
                .map(product => String(product.category || "").trim())
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    select.innerHTML =
        '<option value="">Category</option>' +
        categories.map(category => `
            <option value="${escapeHTML(category)}">
                ${escapeHTML(category)}
            </option>
        `).join("");

    if (categories.includes(currentValue)) {
        select.value = currentValue;
    }
}

/* ------------------------------
   Render seller product table
------------------------------ */

function renderSellerProducts() {
    if (!sellerTable) return;

    updateSellerProductSummary(sellerProductData);
    populateSellerCategoryFilter();

    if (sellerProductData.length === 0) {
        showTableMessage(sellerTable, 8, "No seller products found.");
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

        const allowedPrice = getAllowedPrice(product.benchmark);
        const category = product.category || "";

        const searchText = [
            product.sellerDisplayName,
            product.name,
            category,
            sizeOrType,
            product.status
        ].join(" ").toLowerCase();

        return `
            <tr
                data-search="${escapeHTML(searchText)}"
                data-category="${escapeHTML(category)}"
                data-status="${escapeHTML(product.status)}"
            >
                <td>${priorityCell}</td>
                <td>${escapeHTML(product.sellerDisplayName || "Unknown seller")}</td>
                <td>${escapeHTML(product.name || "—")}</td>
                <td>${escapeHTML(category || "—")}</td>
                <td>${escapeHTML(sizeOrType)}</td>
                <td class="seller-price-value ${priceClass}">
                    ${
                        product.sellingPrice == null
                            ? "—"
                            : formatPrice(product.sellingPrice) +
                              (pricingType === "per_kg" ? "/kg" : "")
                    }
                </td>
                <td>${escapeHTML(allowedPrice)}</td>
                <td>${getProductStatus(product)}</td>
            </tr>
        `;
    }).join("");

    searchSellerProducts();
}

function searchSellerProducts() {
    const input = document.getElementById("searchSellerProducts");
    const categoryFilter = document.getElementById("sellerCategoryFilter");
    const statusFilter = document.getElementById("sellerStatusFilter");

    if (!sellerTable) return;

    const searchValue = input
        ? input.value.trim().toLowerCase()
        : "";

    const selectedCategory = categoryFilter
        ? categoryFilter.value
        : "";

    const selectedStatus = statusFilter
        ? statusFilter.value
        : "";

    sellerTable.querySelectorAll("tr[data-search]").forEach(row => {
        const matchesSearch =
            row.dataset.search.includes(searchValue);

        const matchesCategory =
            !selectedCategory ||
            row.dataset.category === selectedCategory;

        const matchesStatus =
            !selectedStatus ||
            row.dataset.status === selectedStatus;

        row.style.display =
            matchesSearch && matchesCategory && matchesStatus
                ? ""
                : "none";
    });
}

/* ------------------------------
   Modal helpers
------------------------------ */

function renderModal(bodyHtml) {
    const oldModal = document.getElementById("pricingModal");

    if (oldModal) oldModal.remove();

    const modal = document.createElement("div");
    modal.id = "pricingModal";
    modal.className = "modal";
    modal.style.display = "flex";

    modal.innerHTML = `
        <div class="modal-content">
            ${bodyHtml}
        </div>
    `;

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closePricingModal();
        }
    });

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

/* ------------------------------
   Add a benchmark product
------------------------------ */

function openAddModal() {
    renderModal(`
        <h2>Add Product</h2>

        <label for="modalProductName">Product Name</label>
        <div style="position:relative;">
            <input
                type="text"
                id="modalProductName"
                placeholder="Enter product name"
                autocomplete="off"
                oninput="showProductSuggestions()"
                onfocus="showProductSuggestions()"
            >

            <div
                id="productSuggestions"
                style="
                    display:none;
                    position:absolute;
                    top:100%;
                    left:0;
                    width:100%;
                    background:var(--surface,#fff);
                    border:1px solid var(--border,#e5e7eb);
                    border-radius:0 0 8px 8px;
                    max-height:180px;
                    overflow-y:auto;
                    z-index:10001;
                "
            ></div>
        </div>

        <label for="modalPricingType">Type</label>
        <select id="modalPricingType" onchange="updatePricingFields()">
            <option value="per_kg">Per kg</option>
            <option value="fixed_size" selected>Fixed Size</option>
        </select>

        <div id="pricingFields"></div>

        <div class="modal-buttons">
            <button type="button" onclick="closePricingModal()">Cancel</button>
            <button type="button" class="save-btn" onclick="saveNewProduct()">Save</button>
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

            if (!names.some(item =>
                item.toLowerCase() === name.toLowerCase()
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

    if (!filtered.length) {
        suggestions.style.display = "none";
        return;
    }

    filtered.forEach(name => {
        const item = document.createElement("div");

        item.textContent = name;
        item.style.cssText = `
            padding: 10px;
            cursor: pointer;
            border-bottom: 1px solid var(--border,#e5e7eb);
        `;

        item.addEventListener("mouseenter", () => {
            item.style.background = "var(--bg,#f3f4f6)";
        });

        item.addEventListener("mouseleave", () => {
            item.style.background = "transparent";
        });

        item.addEventListener("click", () => {
            input.value = name;
            suggestions.style.display = "none";
        });

        suggestions.appendChild(item);
    });

    suggestions.style.display = "block";
}

/* ------------------------------
   Edit an existing benchmark
------------------------------ */

function openPricingModal(id) {
    const product = marketPriceData.find(item =>
        String(item.id) === String(id)
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

        <label for="modalProductName">Product Name</label>
        <input
            type="text"
            id="modalProductName"
            value="${escapeHTML(product.product_name || "")}"
            placeholder="Enter product name"
        >

        <label for="modalPricingType">Type</label>
        <select id="modalPricingType" onchange="updatePricingFields()">
            <option value="per_kg" ${isPerKg ? "selected" : ""}>Per kg</option>
            <option value="fixed_size" ${!isPerKg ? "selected" : ""}>Fixed Size</option>
        </select>

        <div id="pricingFields"></div>

        <div class="modal-buttons">
            <button type="button" onclick="closePricingModal()">Cancel</button>
            <button
                type="button"
                class="save-btn"
                onclick="savePricing('${escapeHTML(product.id)}')"
            >Save</button>
        </div>
    `);

    updatePricingFields(
        product.size || "",
        product.min_price,
        product.max_price
    );
}

/* ------------------------------
   Pricing form fields
------------------------------ */

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
            <input type="text" value="Per kg" disabled>

            <label for="modalMaxPrice">Maximum Price</label>
            <input
                type="number"
                id="modalMaxPrice"
                value="${currentMaxPrice ?? ""}"
                placeholder="Enter maximum price"
                min="0"
                step="0.01"
            >
        `;

        return;
    }

    fields.innerHTML = `
        <label for="modalSize">Size</label>
        <input
            type="text"
            id="modalSize"
            value="${escapeHTML(currentSize)}"
            placeholder="Example: 35g, 100ml, Small"
        >

        <label for="modalMinPrice">Minimum Price</label>
        <input
            type="number"
            id="modalMinPrice"
            value="${currentMinPrice ?? ""}"
            placeholder="Enter minimum price"
            min="0"
            step="0.01"
        >

        <label for="modalMaxPrice">Maximum Price</label>
        <input
            type="number"
            id="modalMaxPrice"
            value="${currentMaxPrice ?? ""}"
            placeholder="Enter maximum price"
            min="0"
            step="0.01"
        >
    `;
}

/* ------------------------------
   Validate pricing form
------------------------------ */

function readPricingForm() {
    const productName = document
        .getElementById("modalProductName")
        .value.trim();

    const pricingType = document.getElementById("modalPricingType").value;

    if (!productName) {
        alert("Please enter the product name.");
        return null;
    }

    if (pricingType === "per_kg") {
        const maxValue = document.getElementById("modalMaxPrice").value;

        if (
            maxValue === "" ||
            !Number.isFinite(Number(maxValue)) ||
            Number(maxValue) < 0
        ) {
            alert("Please enter a valid maximum price.");
            return null;
        }

        return {
            product_name: productName,
            pricing_type: "per_kg",
            size: null,
            min_price: null,
            max_price: Number(maxValue)
        };
    }

    const size = document.getElementById("modalSize").value.trim();
    const minValue = document.getElementById("modalMinPrice").value;
    const maxValue = document.getElementById("modalMaxPrice").value;

    if (!size) {
        alert("Please enter the product size.");
        return null;
    }

    if (minValue === "" || maxValue === "") {
        alert("Please enter both minimum and maximum prices.");
        return null;
    }

    const minPrice = Number(minValue);
    const maxPrice = Number(maxValue);

    if (
        !Number.isFinite(minPrice) ||
        !Number.isFinite(maxPrice) ||
        minPrice < 0 ||
        maxPrice < 0
    ) {
        alert("Please enter valid prices. Prices cannot be negative.");
        return null;
    }

    if (minPrice > maxPrice) {
        alert("Minimum price cannot be higher than maximum price.");
        return null;
    }

    return {
        product_name: productName,
        pricing_type: "fixed_size",
        size,
        min_price: minPrice,
        max_price: maxPrice
    };
}

function hasDuplicateBenchmark(values, excludeId = null) {
    const name = normalizeValue(values.product_name);
    const size = normalizeValue(values.size);

    return marketPriceData.some(item => {
        if (
            excludeId != null &&
            String(item.id) === String(excludeId)
        ) {
            return false;
        }

        if (normalizeValue(item.product_name) !== name) {
            return false;
        }

        if (values.pricing_type === "per_kg") {
            return item.pricing_type === "per_kg";
        }

        return (
            item.pricing_type === "fixed_size" &&
            normalizeValue(item.size) === size
        );
    });
}

/* ------------------------------
   Save a new benchmark
------------------------------ */

async function saveNewProduct() {
    const values = readPricingForm();

    if (!values) return;

    if (hasDuplicateBenchmark(values)) {
        alert(
            values.pricing_type === "per_kg"
                ? `${values.product_name} already has a per-kg benchmark.`
                : `${values.product_name} with size ${values.size} already exists.`
        );
        return;
    }

    const { error } = await db
        .from("market_prices")
        .insert([values]);

    if (error) {
        console.error("Failed to add benchmark:", error);
        alert("Failed to add product: " + error.message);
        return;
    }

    alert("Product added successfully.");
    closePricingModal();
    await loadMarketPrices();
}

/* ------------------------------
   Save edits to an existing benchmark
------------------------------ */

async function savePricing(id) {
    const product = marketPriceData.find(item =>
        String(item.id) === String(id)
    );

    if (!product) {
        alert("Product not found.");
        return;
    }

    const values = readPricingForm();

    if (!values) return;

    if (hasDuplicateBenchmark(values, id)) {
        alert(
            values.pricing_type === "per_kg"
                ? `${values.product_name} already has a per-kg benchmark.`
                : `${values.product_name} with size ${values.size} already exists.`
        );
        return;
    }

    const { error } = await db
        .from("market_prices")
        .update(values)
        .eq("id", id);

    if (error) {
        console.error("Failed to save benchmark:", error);
        alert("Failed to save pricing: " + error.message);
        return;
    }

    alert("Pricing saved successfully.");
    closePricingModal();
    await loadMarketPrices();
}

/* ------------------------------
   Initialize
------------------------------ */

document.addEventListener("DOMContentLoaded", () => {
    const sidebar = document.getElementById("sidebar");
    const content = document.getElementById("content");
    const menuButton = document.getElementById("menuToggleBtn");

    /*
     * Keep the initial collapsed sidebar and content classes in sync.
     * toggleSidebar() handles opening and closing the sidebar afterwards.
     */
    if (sidebar && content) {
        const collapsed = sidebar.classList.contains("collapsed");

        content.classList.toggle("collapsed-content", collapsed);

        if (menuButton) {
            menuButton.setAttribute("aria-expanded", String(!collapsed));
        }
    }

    loadMarketPrices();
});
