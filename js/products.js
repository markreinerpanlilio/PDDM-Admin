const plTable = document.getElementById("plTable");
const plModal = document.getElementById("plModal");
const plForm = document.getElementById("plForm");
const plViewContent = document.getElementById("plViewContent");

let plProducts = [];
let plSellers = [];
let plFiltered = [];
let plAdmin = null;
let plPage = 1;
let plEditingId = null;
let plBusy = false;
let plCategoryFilter = "all";
let plTypeFilter = "all";

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

function plMoney(value) {
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
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-PH");
}

function plMessage(message, error = false) {
    const el = document.getElementById("plStatus");
    el.textContent = message;
    el.style.color = error ? "#c62828" : "";
}

function plSetBusy(busy) {
    plBusy = busy;
    document.querySelectorAll(
        "#plRefresh,#plAdd,#plSave,.pl-actions button"
    ).forEach(button => button.disabled = busy);
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

async function plFetchAll(table, columns, sort = "created_at") {
    const rows = [];
    const size = 1000;

    for (let start = 0; start < 100000; start += size) {
        const { data, error } = await db
            .from(table)
            .select(columns)
            .order(sort, { ascending: false })
            .range(start, start + size - 1);

        if (error) throw error;

        rows.push(...(data || []));

        if (!data || data.length < size) return rows;
    }

    throw Error("Too many records.");
}

async function plLoadSellers() {
    const profiles = await plFetchAll(
        "profiles",
        "id,full_name,email,role",
        "created_at"
    );

    plSellers = profiles
        .filter(p => String(p.role || "").trim().toLowerCase() === "seller")
        .sort((a, b) =>
            String(a.full_name || a.email || "").localeCompare(
                String(b.full_name || b.email || "")
            )
        );
}

function plSellerName(id, fallback = "") {
    const seller = plSellers.find(s => s.id === id);
    return seller?.full_name || seller?.email || fallback || "Unknown Seller";
}

async function loadProducts() {
    if (plBusy) return;

    plSetBusy(true);
    plMessage("Loading products...");

    try {
        await plVerifyAdmin();

        await plLoadSellers();

        plProducts = await plFetchAll(
            "products",
            "id,name,price,stock,category,seller_id,seller_name,image_url,created_at,is_active,variant,unit,price_status,weight,pricing_type"
        );

        plPage = 1;
        plBuildFilters();
        plFilter();
        plMessage("");
    } catch (error) {
        console.error("Load products:", error);
        plMessage(error.message || "Unable to load products.", true);
        plTable.innerHTML =
            '<tr><td colspan="8" class="pl-empty">Unable to load products</td></tr>';
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
        : plTypeFilter;

    button.type = "button";
    button.className = "pl-filter-option";
    button.textContent = label;

    if (selected === value) {
        button.classList.add("selected");
    }

    button.addEventListener("click", () => {
        if (kind === "category") {
            plCategoryFilter = value;
        } else {
            plTypeFilter = value;
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
        plProducts.map(p => String(p.category || "").trim()).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    if (
        plCategoryFilter !== "all" &&
        !categories.includes(plCategoryFilter)
    ) {
        plCategoryFilter = "all";
    }

    const categoryMenu = document.getElementById("plCategoryMenu");
    const typeMenu = document.getElementById("plTypeMenu");
    const suggestions = document.getElementById("plCategorySuggestions");

    categoryMenu.replaceChildren(
        plOption("All Categories", "all", "category")
    );

    categories.forEach(category => {
        categoryMenu.appendChild(
            plOption(category, category, "category")
        );
    });

    typeMenu.replaceChildren(
        plOption("All Types", "all", "type"),
        plOption("Per kg", "per_kg", "type"),
        plOption("Fixed Size", "fixed_size", "type")
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
}

function plFilter() {
    const search = document.getElementById("plSearch")
        .value.trim().toLowerCase();

    plFiltered = plProducts.filter(product => {
        const seller = plSellerName(product.seller_id, product.seller_name);

        const searchable = [
            product.name,
            product.category,
            product.variant,
            seller,
            product.id
        ].map(v => String(v ?? "")).join(" ").toLowerCase();

        return (!search || searchable.includes(search)) &&
            (plCategoryFilter === "all" ||
                product.category === plCategoryFilter) &&
            (plTypeFilter === "all" ||
                product.pricing_type === plTypeFilter);
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
            const kg = product.pricing_type === "per_kg";
            const name = product.name || "Unnamed Product";
            const seller = plSellerName(
                product.seller_id,
                product.seller_name
            );

            const image = product.image_url &&
                /^https?:\/\//i.test(product.image_url)
                ? `<img class="pl-thumbnail" src="${plEsc(product.image_url)}"
                     alt="" loading="lazy" referrerpolicy="no-referrer">`
                : '<div class="pl-thumbnail-empty">No image</div>';

            return `
                <tr>
                    <td>
                        <div class="pl-product">
                            ${image}
                            <div>
                                <div class="pl-name">${plEsc(name)}</div>
                                <div class="pl-sub">${plEsc(product.variant || "—")}</div>
                            </div>
                        </div>
                    </td>
                    <td class="pl-seller">${plEsc(seller)}</td>
                    <td>${plEsc(product.category || "—")}</td>
                    <td>
                        <span class="pl-pill ${kg ? "kg" : "fixed"}">
                            ${kg ? "Per kg" : "Fixed Size"}
                        </span>
                    </td>
                    <td class="pl-price">${plMoney(product.price)}</td>
                    <td>${Number(product.stock || 0).toLocaleString()}</td>
                    <td>
                        <span class="pl-pill ${product.is_active ? "active" : "inactive"}">
                            ${product.is_active ? "Active" : "Inactive"}
                        </span>
                    </td>
                    <td>
                        <div class="pl-actions">
                            <button class="pl-view" data-action="view" data-id="${plEsc(product.id)}">View</button>
                            <button class="pl-edit" data-action="edit" data-id="${plEsc(product.id)}">Edit</button>
                            <button class="pl-delete" data-action="delete" data-id="${plEsc(product.id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("")
        : '<tr><td colspan="8" class="pl-empty">No products found</td></tr>';

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

    if (selectedId && !plSellers.some(s => s.id === selectedId)) {
        select.add(new Option("Seller no longer available", selectedId));
        select.value = selectedId;
    }
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
        product?.pricing_type === "per_kg" ? "per_kg" : "fixed_size";
    document.getElementById("plPrice").value = product?.price ?? "";
    document.getElementById("plStock").value = product?.stock ?? "";
    document.getElementById("plVariant").value = product?.variant || "";
    document.getElementById("plWeight").value = product?.weight ?? "";
    document.getElementById("plUnit").value = product?.unit || "";
    document.getElementById("plActive").value =
        product?.is_active === false ? "false" : "true";
    document.getElementById("plImage").value = product?.image_url || "";

    plUpdatePreview();
    document.getElementById("plName").focus();
}

function plShowDetails(id) {
    const product = plProducts.find(p => String(p.id) === String(id));
    if (!product) return;

    plForm.hidden = true;
    plViewContent.hidden = false;
    document.getElementById("plViewFooter").hidden = false;

    const fields = [
        ["Product Name", product.name],
        ["Seller", plSellerName(product.seller_id, product.seller_name)],
        ["Category", product.category],
        ["Pricing Type", product.pricing_type === "per_kg" ? "Per kg" : "Fixed Size"],
        ["Selling Price", plMoney(product.price)],
        ["Stock", product.stock],
        ["Variant / Size", product.variant],
        ["Weight", product.weight],
        ["Unit", product.unit],
        ["Availability", product.is_active ? "Active" : "Inactive"],
        ["Price Status", product.price_status],
        ["Created", plDate(product.created_at)],
        ["Product ID", product.id]
    ];

    plViewContent.innerHTML = `
        <div class="pl-detail-grid">
            ${fields.map(([label, value]) => `
                <div class="pl-detail">
                    <span class="pl-detail-label">${plEsc(label)}</span>
                    <span class="pl-detail-value">${plEsc(value ?? "—")}</span>
                </div>
            `).join("")}
        </div>
        ${product.image_url && /^https?:\/\//i.test(product.image_url)
            ? `<img src="${plEsc(product.image_url)}" alt="Product image"
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
        image_url: image || null,
        is_active: document.getElementById("plActive").value === "true"
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
            : db.from("products").insert(values);

        const { data, error } = await query.select("id").single();

        if (error) throw error;
        if (!data?.id) throw Error("Product was not saved.");

        await plAudit(
            editing ? "Update Product" : "Create Product",
            `${values.name} — Seller: ${values.seller_name || values.seller_id}`
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

document.getElementById("plAdd")
    .addEventListener("click", () => plOpenForm());

document.getElementById("plRefresh")
    .addEventListener("click", loadProducts);

document.getElementById("plSearch")
    .addEventListener("input", () => {
        plPage = 1;
        plFilter();
    });

document.getElementById("plCategoryTrigger")
    .addEventListener("click", () =>
        plToggleFilter("plCategoryMenu", "plCategoryTrigger")
    );

document.getElementById("plTypeTrigger")
    .addEventListener("click", () =>
        plToggleFilter("plTypeMenu", "plTypeTrigger")
    );

document.addEventListener("click", event => {
    if (!event.target.closest(".pl-filter-header")) {
        plCloseFilters();
    }
});

document.getElementById("plPrevious")
    .addEventListener("click", () => {
        if (plPage > 1) {
            plPage--;
            plRender();
        }
    });

document.getElementById("plNext")
    .addEventListener("click", () => {
        if (plPage * plPageSize < plFiltered.length) {
            plPage++;
            plRender();
        }
    });

document.getElementById("plImage")
    .addEventListener("input", plUpdatePreview);

document.getElementById("plImagePreview")
    .addEventListener("error", () => {
        document.getElementById("plImagePreview").style.display = "none";
    });

plForm.addEventListener("submit", plSave);

document.getElementById("plCancel")
    .addEventListener("click", plClose);

document.getElementById("plModalClose")
    .addEventListener("click", plClose);

document.getElementById("plViewClose")
    .addEventListener("click", plClose);

plModal.addEventListener("click", event => {
    if (event.target === plModal) plClose();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        plCloseFilters();

        if (plModal.style.display === "flex") {
            plClose();
        }
    }
});

loadProducts();
