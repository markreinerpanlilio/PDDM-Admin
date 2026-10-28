const plTable = document.getElementById("plTable");
const plModal = document.getElementById("plModal");
const plForm = document.getElementById("plForm");
const plViewContent = document.getElementById("plViewContent");

let plProducts = [];
let plSellers = [];
let plBenchmarks = [];
let plFiltered = [];
let plAdmin = null;
let plPage = 1;
let plEditingId = null;
let plBusy = false;
let plCategoryFilter = "all";
let plTypeFilter = "all";
let plStatusFilter = "all";

const plPageSize = 10;

function plEsc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function plNormalize(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function plMoney(value) {
    if (value === null || value === undefined || value === "") return "—";

    const n = Number(value);

    return Number.isFinite(n)
        ? "₱" + n.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })
        : "—";
}

function plDate(value) {
    if (!value) return "—";

    const d = new Date(value);

    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-PH");
}

function plMessage(message, error = false) {
    const el = document.getElementById("plStatus");
    el.textContent = message;
    el.style.color = error ? "#c62828" : "";
}

function plSetBusy(busy) {
    plBusy = busy;

    document.querySelectorAll(
        "#plRefresh,#plAdd,#plSave,#plCancel,.pl-actions button"
    ).forEach(button => {
        button.disabled = busy;
    });
}

async function plVerifyAdmin() {
    const { data: { user }, error } = await db.auth.getUser();

    if (error || !user) {
        throw Error("Please sign in.");
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id,role,email,full_name")
        .eq("id", user.id)
        .single();

    if (profileError || String(profile?.role).toLowerCase() !== "admin") {
        throw Error("Admin access required.");
    }

    plAdmin = { user, profile };
}

async function plFetchAll(table, columns, sort = "created_at", filters = null) {
    const rows = [];
    const size = 1000;

    for (let start = 0; start < 100000; start += size) {
        let query = db
            .from(table)
            .select(columns)
            .order(sort, { ascending: false })
            .range(start, start + size - 1);

        if (filters) {
            for (const [column, value] of Object.entries(filters)) {
                query = query.eq(column, value);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        rows.push(...(data || []));

        if (!data || data.length < size) return rows;
    }

    throw Error("Too many records.");
}

async function plLoadSellers() {
    plSellers = await plFetchAll(
        "profiles",
        "id,full_name,email,role",
        "created_at",
        { role: "seller" }
    );

    plSellers.sort((a, b) =>
        String(a.full_name || a.email || "").localeCompare(
            String(b.full_name || b.email || "")
        )
    );
}

function plSellerName(id, fallback = "") {
    const seller = plSellers.find(s => s.id === id);
    return seller?.full_name || seller?.email || fallback || "Unknown Seller";
}

// Match benchmark names, categories, pricing types, and product sizes.
function plGetProductSizes(product) {
    return [
        product.variant,
        product.size,
        product.weight != null && product.unit
            ? `${product.weight}${product.unit}`
            : null,
        product.weight != null ? String(product.weight) : null
    ].filter(value =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );
}

function plGetPricingType(product) {
    if (product.pricing_type === "per_kg") return "per_kg";
    if (product.pricing_type === "fixed_size") return "fixed_size";

    const sizes = plGetProductSizes(product).map(plNormalize);

    return sizes.some(size => size === "kg" || size.endsWith("/kg"))
        ? "per_kg"
        : "fixed_size";
}

function plFindBenchmark(product) {
    const name = plNormalize(product.name);

    if (!name) return null;

    const type = plGetPricingType(product);
    const category = plNormalize(product.category);

    const matches = plBenchmarks.filter(benchmark => {
        if (plNormalize(benchmark.product_name) !== name) return false;

        if (
            category &&
            benchmark.category &&
            category !== plNormalize(benchmark.category)
        ) {
            return false;
        }

        return benchmark.pricing_type === type;
    });

    if (type === "per_kg") {
        return matches[0] || null;
    }

    const sizes = plGetProductSizes(product).map(plNormalize);

    if (!sizes.length) {
        return matches[0] || null;
    }

    return matches.find(benchmark =>
        benchmark.size != null &&
        sizes.includes(plNormalize(benchmark.size))
    ) || null;
}

function plComparePrice(product) {
    const benchmark = plFindBenchmark(product);

    const hasMax = benchmark &&
        benchmark.max_price !== null &&
        benchmark.max_price !== undefined &&
        String(benchmark.max_price).trim() !== "" &&
        Number.isFinite(Number(benchmark.max_price));

    if (!hasMax) {
        return {
            benchmark: null,
            status: "unmatched",
            label: "No Benchmark",
            srp: "—"
        };
    }

    const max = Number(benchmark.max_price);

    const hasMin = benchmark.min_price !== null &&
        benchmark.min_price !== undefined &&
        String(benchmark.min_price).trim() !== "" &&
        Number.isFinite(Number(benchmark.min_price));

    const min = hasMin ? Number(benchmark.min_price) : null;

    const srp = min === null
        ? plMoney(max)
        : `${plMoney(min)}–${plMoney(max)}`;

    const price = Number(product.price);

    if (
        product.price === null ||
        product.price === undefined ||
        product.price === "" ||
        !Number.isFinite(price) ||
        price < 0
    ) {
        return {
            benchmark,
            status: "unmatched",
            label: "No Price",
            srp
        };
    }

    if (price > max) {
        return {
            benchmark,
            status: "overpriced",
            label: "Overpriced",
            srp
        };
    }

    if (min !== null && price < min) {
        return {
            benchmark,
            status: "underpriced",
            label: "Below Minimum",
            srp
        };
    }

    return {
        benchmark,
        status: "compliant",
        label: "Within Range",
        srp
    };
}

async function loadProducts() {
    if (plBusy) return;

    plSetBusy(true);
    plMessage("Loading products...");

    try {
        await plVerifyAdmin();

        const [sellers, benchmarks, products] = await Promise.all([
            plFetchAll(
                "profiles",
                "id,full_name,email,role",
                "created_at",
                { role: "seller" }
            ),
            plFetchAll(
                "market_prices",
                "id,product_name,category,pricing_type,size,min_price,max_price",
                "created_at"
            ),
            plFetchAll(
                "products",
                "id,name,price,stock,category,seller_id,seller_name,image_url,created_at,is_active,variant,unit,price_status,weight,pricing_type"
            )
        ]);

        plSellers = sellers.sort((a, b) =>
            String(a.full_name || a.email || "").localeCompare(
                String(b.full_name || b.email || "")
            )
        );

        plBenchmarks = benchmarks;
        plProducts = products;

        plPage = 1;
        plBuildFilters();
        plFilter();
        plMessage("");
    } catch (error) {
        console.error("Load products:", error);
        plMessage(error.message || "Unable to load products.", true);
        plTable.innerHTML =
            '<tr><td colspan="9" class="pl-empty">Unable to load products</td></tr>';
    } finally {
        plSetBusy(false);
    }
}

function plCloseFilters() {
    document.querySelectorAll(".pl-filter-menu").forEach(menu =>
        menu.classList.remove("open")
    );

    document.querySelectorAll(".pl-filter-trigger").forEach(button =>
        button.setAttribute("aria-expanded", "false")
    );
}

function plToggleFilter(menuId, triggerId) {
    const menu = document.getElementById(menuId);
    const trigger = document.getElementById(triggerId);
    const wasOpen = menu.classList.contains("open");

    plCloseFilters();

    if (!wasOpen) {
        menu.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
    }
}

function plOption(label, value, kind) {
    const button = document.createElement("button");

    const selected = kind === "category"
        ? plCategoryFilter
        : kind === "type"
            ? plTypeFilter
            : plStatusFilter;

    button.type = "button";
    button.className = "pl-filter-option";
    button.textContent = label;

    if (selected === value) {
        button.classList.add("selected");
    }

    button.addEventListener("click", () => {
        if (kind === "category") {
            plCategoryFilter = value;
        } else if (kind === "type") {
            plTypeFilter = value;
        } else {
            plStatusFilter = value;
        }

        plPage = 1;
        plBuildFilters();
        plCloseFilters();
        plFilter();
    });

    return button;
}

function plBuildFilters() {
    const categories = [...new Set(
        plProducts
            .map(p => String(p.category || "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    if (
        plCategoryFilter !== "all" &&
        !categories.includes(plCategoryFilter)
    ) {
        plCategoryFilter = "all";
    }

    const categoryMenu = document.getElementById("plCategoryMenu");
    const typeMenu = document.getElementById("plTypeMenu");
    const statusMenu = document.getElementById("plStatusMenu");
    const suggestions = document.getElementById("plCategorySuggestions");

    categoryMenu.replaceChildren(
        plOption("All Categories", "all", "category")
    );

    categories.forEach(category =>
        categoryMenu.appendChild(plOption(category, category, "category"))
    );

    typeMenu.replaceChildren(
        plOption("All Types", "all", "type"),
        plOption("Per kg", "per_kg", "type"),
        plOption("Fixed Size", "fixed_size", "type")
    );

    statusMenu.replaceChildren(
        plOption("All Statuses", "all", "status"),
        plOption("Within Range", "compliant", "status"),
        plOption("Overpriced", "overpriced", "status"),
        plOption("Below Minimum", "underpriced", "status"),
        plOption("No Benchmark", "unmatched", "status")
    );

    suggestions.replaceChildren();

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        suggestions.appendChild(option);
    });

    document.getElementById("plCategoryTrigger")
        .classList.toggle("selected", plCategoryFilter !== "all");

    document.getElementById("plTypeTrigger")
        .classList.toggle("selected", plTypeFilter !== "all");

    document.getElementById("plStatusTrigger")
        .classList.toggle("selected", plStatusFilter !== "all");
}

function plFilter() {
    const search = document.getElementById("plSearch")
        .value.trim().toLowerCase();

    plFiltered = plProducts.filter(product => {
        const seller = plSellerName(product.seller_id, product.seller_name);
        const priceInfo = plComparePrice(product);

        const searchable = [
            product.name,
            product.category,
            product.variant,
            seller,
            product.id,
            priceInfo.label
        ].map(value => String(value ?? "")).join(" ").toLowerCase();

        return (!search || searchable.includes(search)) &&
            (plCategoryFilter === "all" ||
                product.category === plCategoryFilter) &&
            (plTypeFilter === "all" ||
                plGetPricingType(product) === plTypeFilter) &&
            (plStatusFilter === "all" ||
                priceInfo.status === plStatusFilter);
    });

    plPage = Math.min(
        plPage,
        Math.max(1, Math.ceil(plFiltered.length / plPageSize))
    );

    plRender();
}

function plRender() {
    const start = (plPage - 1) * plPageSize;
    const page = plFiltered.slice(start, start + plPageSize);

    plTable.innerHTML = page.length
        ? page.map(product => {
            const kg = plGetPricingType(product) === "per_kg";
            const priceInfo = plComparePrice(product);

            const image = product.image_url &&
                /^https?:\/\//i.test(product.image_url)
                ? `<img class="pl-thumbnail"
                    src="${plEsc(product.image_url)}"
                    alt="" loading="lazy" referrerpolicy="no-referrer">`
                : '<div class="pl-thumbnail-empty">No image</div>';

            return `
                <tr>
                    <td>
                        <div class="pl-product">
                            ${image}
                            <div>
                                <div class="pl-name">
                                    ${plEsc(product.name || "Unnamed Product")}
                                </div>
                                <div class="pl-sub">
                                    ${plEsc(product.variant || "—")}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="pl-seller">
                        ${plEsc(plSellerName(product.seller_id, product.seller_name))}
                    </td>
                    <td>${plEsc(product.category || "—")}</td>
                    <td>
                        <span class="pl-pill ${kg ? "kg" : "fixed"}">
                            ${kg ? "Per kg" : "Fixed Size"}
                        </span>
                    </td>
                    <td class="pl-price">${plMoney(product.price)}</td>
                    <td class="pl-srp">${plEsc(priceInfo.srp)}</td>
                    <td>
                        <span class="pl-pill ${priceInfo.status}">
                            ${plEsc(priceInfo.label)}
                        </span>
                    </td>
                    <td>${Number(product.stock || 0).toLocaleString()}</td>
                    <td>
                        <div class="pl-actions">
                            <button type="button" class="pl-view"
                                data-action="view"
                                data-id="${plEsc(product.id)}">View</button>
                            <button type="button" class="pl-edit"
                                data-action="edit"
                                data-id="${plEsc(product.id)}">Edit</button>
                            <button type="button" class="pl-delete"
                                data-action="delete"
                                data-id="${plEsc(product.id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("")
        : '<tr><td colspan="9" class="pl-empty">No products found</td></tr>';

    const total = plFiltered.length;

    document.getElementById("plPageInfo").textContent =
        `${total ? start + 1 : 0}–${Math.min(start + plPageSize, total)} of ${total} products`;

    document.getElementById("plPrevious").disabled = plPage <= 1;
    document.getElementById("plNext").disabled =
        plPage * plPageSize >= total;
}

function plPopulateSellers(selectedId = "") {
    const select = document.getElementById("plSeller");

    select.replaceChildren(new Option("Select seller", ""));

    plSellers.forEach(seller => {
        const name = seller.full_name || seller.email || seller.id;

        const label = seller.email && seller.full_name
            ? `${seller.full_name} (${seller.email})`
            : name;

        select.add(new Option(label, seller.id));
    });

    select.value = selectedId || "";
}

function plOpen(title, subtitle) {
    document.getElementById("plModalTitle").textContent = title;
    document.getElementById("plModalSubtitle").textContent = subtitle;
    plModal.style.display = "flex";
}

function plClose() {
    if (plBusy) return;

    plModal.style.display = "none";
    plEditingId = null;
    plForm.reset();
    plViewContent.replaceChildren();
}

function plOpenForm(id = null) {
    if (plBusy) return;

    const product = id
        ? plProducts.find(p => String(p.id) === String(id))
        : null;

    if (id && !product) return;

    plEditingId = id;
    plForm.reset();

    plViewContent.hidden = true;
    plForm.hidden = false;
    document.getElementById("plViewFooter").hidden = true;

    plOpen(
        product ? "Edit Product" : "Add Product",
        product ? "Update Product Information" : "Create Seller Product"
    );

    document.getElementById("plSave").textContent =
        product ? "Save Changes" : "Create Product";

    plPopulateSellers(product?.seller_id || "");

    document.getElementById("plName").value = product?.name || "";
    document.getElementById("plCategory").value = product?.category || "";
    document.getElementById("plPricingType").value =
        plGetPricingType(product || {}) === "per_kg"
            ? "per_kg"
            : "fixed_size";
    document.getElementById("plPrice").value = product?.price ?? "";
    document.getElementById("plStock").value = product?.stock ?? "";
    document.getElementById("plVariant").value = product?.variant || "";
    document.getElementById("plWeight").value = product?.weight ?? "";
    document.getElementById("plUnit").value = product?.unit || "";
    document.getElementById("plImage").value = product?.image_url || "";

    plUpdatePreview();
    plUpdatePricePreview();
    document.getElementById("plName").focus();
}

function plShowDetails(id) {
    const product = plProducts.find(p => String(p.id) === String(id));
    if (!product) return;

    const priceInfo = plComparePrice(product);

    plForm.hidden = true;
    plViewContent.hidden = false;
    document.getElementById("plViewFooter").hidden = false;

    const fields = [
        ["Product Name", product.name],
        ["Seller", plSellerName(product.seller_id, product.seller_name)],
        ["Category", product.category],
        ["Pricing Type", plGetPricingType(product) === "per_kg" ? "Per kg" : "Fixed Size"],
        ["Selling Price", plMoney(product.price)],
        ["Market Price (SRP)", priceInfo.srp],
        ["Price Status", priceInfo.label],
        ["Stock", product.stock],
        ["Variant / Size", product.variant],
        ["Weight", product.weight],
        ["Unit", product.unit],
        ["Created", plDate(product.created_at)],
        ["Product ID", product.id]
    ];

    plViewContent.innerHTML = `
        <div class="pl-detail-grid">
            ${fields.map(([label, value]) => `
                <div class="pl-detail">
                    <span class="pl-detail-label">${plEsc(label)}</span>
                    <span class="pl-detail-value">
                        ${plEsc(value ?? "—")}
                    </span>
                </div>
            `).join("")}
        </div>
        ${product.image_url && /^https?:\/\//i.test(product.image_url)
            ? `<img src="${plEsc(product.image_url)}"
                alt="Product image"
                style="max-width:100%;max-height:220px;object-fit:contain;margin-top:16px;border-radius:10px">`
            : ""}
    `;

    plOpen(product.name || "Product Details", "Product Information");
}

function plUpdatePreview() {
    const input = document.getElementById("plImage");
    const preview = document.getElementById("plImagePreview");
    const url = input.value.trim();

    if (/^https?:\/\//i.test(url)) {
        preview.src = url;
        preview.style.display = "block";
    } else {
        preview.removeAttribute("src");
        preview.style.display = "none";
    }
}

function plUpdatePricePreview() {
    const name = document.getElementById("plName").value.trim();
    const priceText = document.getElementById("plPrice").value;
    const preview = document.getElementById("plPricePreview");

    if (!name) {
        preview.textContent = "Enter product details to check the market price.";
        return;
    }

    const product = {
        name,
        category: document.getElementById("plCategory").value.trim(),
        pricing_type: document.getElementById("plPricingType").value,
        variant: document.getElementById("plVariant").value.trim(),
        weight: document.getElementById("plWeight").value === ""
            ? null
            : Number(document.getElementById("plWeight").value),
        unit: document.getElementById("plUnit").value.trim(),
        price: priceText === "" ? null : Number(priceText)
    };

    const info = plComparePrice(product);

    preview.textContent =
        `Market Price (SRP): ${info.srp} | Status: ${info.label}`;
}

function plReadForm() {
    if (!plForm.reportValidity()) return null;

    const name = document.getElementById("plName").value.trim();
    const sellerId = document.getElementById("plSeller").value;
    const category = document.getElementById("plCategory").value.trim();
    const type = document.getElementById("plPricingType").value;
    const priceText = document.getElementById("plPrice").value;
    const stockText = document.getElementById("plStock").value;
    const variant = document.getElementById("plVariant").value.trim();
    const weightText = document.getElementById("plWeight").value;
    const unit = document.getElementById("plUnit").value.trim();
    const image = document.getElementById("plImage").value.trim();

    const seller = plSellers.find(s => s.id === sellerId);

    if (!seller) {
        throw Error("Please select a valid Seller account.");
    }

    if (!name || !category) {
        throw Error("Product name and category are required.");
    }

    if (!["fixed_size", "per_kg"].includes(type)) {
        throw Error("Invalid pricing type.");
    }

    const price = Number(priceText);
    const stock = Number(stockText);

    if (
        priceText === "" ||
        !Number.isFinite(price) ||
        price < 0 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.000001
    ) {
        throw Error("Enter a valid price with up to 2 decimal places.");
    }

    if (
        stockText === "" ||
        !Number.isSafeInteger(stock) ||
        stock < 0
    ) {
        throw Error("Stock must be a non-negative whole number.");
    }

    let weight = null;

    if (weightText !== "") {
        weight = Number(weightText);

        if (!Number.isFinite(weight) || weight < 0) {
            throw Error("Enter a valid weight.");
        }
    }

    if (image && !/^https?:\/\//i.test(image)) {
        throw Error("Image URL must begin with http:// or https://.");
    }

    return {
        name,
        seller_id: seller.id,
        seller_name: seller.full_name || seller.email || null,
        category,
        pricing_type: type,
        price,
        stock,
        variant: variant || null,
        weight,
        unit: unit || null,
        image_url: image || null
    };
}

async function plAudit(action, description) {
    if (!plAdmin) return;

    const { error } = await db.from("audit_logs").insert({
        user_id: plAdmin.user.id,
        user: plAdmin.profile.email || "Admin",
        action,
        module: "Product Listings",
        description
    });

    if (error) {
        console.error("Product audit failed:", error.message);
    }
}

async function plSave(event) {
    event.preventDefault();
    if (plBusy) return;

    let values;

    try {
        values = plReadForm();
        if (!values) return;
    } catch (error) {
        plMessage(error.message, true);
        alert(error.message);
        return;
    }

    plSetBusy(true);
    plMessage("Saving product...");

    try {
        await plVerifyAdmin();

        const editing = plEditingId !== null;

        const query = editing
            ? db.from("products").update(values).eq("id", plEditingId)
            : db.from("products").insert({
                ...values,
                is_active: true
            });

        const { data, error } = await query.select("id").single();

        if (error) throw error;
        if (!data?.id) throw Error("Product was not saved.");

        const priceInfo = plComparePrice(values);

        await plAudit(
            editing ? "Update Product" : "Create Product",
            `${values.name} — Seller: ${values.seller_name || values.seller_id} — ${priceInfo.label}`
        );

        plBusy = false;
        plClose();

        await loadProducts();

        plMessage(
            editing
                ? "Product updated successfully."
                : "Product created successfully."
        );
    } catch (error) {
        console.error("Save product:", error);
        plMessage(error.message || "Unable to save product.", true);
    } finally {
        plSetBusy(false);
    }
}

async function plDelete(id) {
    if (plBusy) return;

    const product = plProducts.find(p => String(p.id) === String(id));
    if (!product) return;

    if (!confirm(
        `Delete "${product.name}"?\n\nThis may affect existing orders or seller records.`
    )) return;

    plSetBusy(true);
    plMessage("Deleting product...");

    try {
        await plVerifyAdmin();

        const { data, error } = await db
            .from("products")
            .delete()
            .eq("id", id)
            .select("id");

        if (error) throw error;
        if (!data?.length) throw Error("Product was not deleted.");

        await plAudit(
            "Delete Product",
            `${product.name} — Seller: ${product.seller_name || product.seller_id}`
        );

        plBusy = false;
        await loadProducts();
        plMessage("Product deleted successfully.");
    } catch (error) {
        console.error("Delete product:", error);
        plMessage(error.message || "Unable to delete product.", true);
    } finally {
        plSetBusy(false);
    }
}

plTable.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || plBusy) return;

    const { action, id } = button.dataset;

    if (action === "view") plShowDetails(id);
    if (action === "edit") plOpenForm(id);
    if (action === "delete") plDelete(id);
});

document.getElementById("plAdd").addEventListener("click", () => {
    plOpenForm();
});

document.getElementById("plRefresh").addEventListener("click", loadProducts);

document.getElementById("plSearch").addEventListener("input", () => {
    plPage = 1;
    plFilter();
});

[
    ["plCategoryTrigger", "plCategoryMenu"],
    ["plTypeTrigger", "plTypeMenu"],
    ["plStatusTrigger", "plStatusMenu"]
].forEach(([triggerId, menuId]) => {
    document.getElementById(triggerId).addEventListener("click", () => {
        plToggleFilter(menuId, triggerId);
    });
});

document.addEventListener("click", event => {
    if (!event.target.closest(".pl-filter-header")) {
        plCloseFilters();
    }
});

document.getElementById("plPrevious").addEventListener("click", () => {
    if (plPage > 1) {
        plPage--;
        plRender();
    }
});

document.getElementById("plNext").addEventListener("click", () => {
    if (plPage * plPageSize < plFiltered.length) {
        plPage++;
        plRender();
    }
});

document.getElementById("plImage").addEventListener("input", plUpdatePreview);

document.getElementById("plImagePreview").addEventListener("error", () => {
    document.getElementById("plImagePreview").style.display = "none";
});

[
    "plName",
    "plCategory",
    "plPricingType",
    "plPrice",
    "plVariant",
    "plWeight",
    "plUnit"
].forEach(id => {
    const element = document.getElementById(id);

    element.addEventListener("input", plUpdatePricePreview);
    element.addEventListener("change", plUpdatePricePreview);
});

plForm.addEventListener("submit", plSave);

document.getElementById("plCancel").addEventListener("click", plClose);
document.getElementById("plViewClose").addEventListener("click", plClose);

// The modal closes only through Cancel, not backdrop clicks or Escape.

loadProducts();
