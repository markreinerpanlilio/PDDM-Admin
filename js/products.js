
const $ = id => document.getElementById(id);
const table = $("plTable"), form = $("plForm"), modal = $("plModal");
const PAGE_SIZE = 10;

let products = [], sellers = [], benchmarks = [], filtered = [];
let admin = null, page = 1, editingId = null, busy = false;
let filters = { category: "all", type: "all", status: "all" };

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
})[c]);

const norm = v => String(v ?? "").trim().toLowerCase().replace(/\s+/g, "");
const money = v => v == null || v === "" || !Number.isFinite(Number(v))
    ? "—"
    : "₱" + Number(v).toLocaleString("en-PH", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });

const date = v => v && !isNaN(Date.parse(v))
    ? new Date(v).toLocaleDateString("en-PH") : "—";

function message(text = "", error = false) {
    $("plStatus").textContent = text;
    $("plStatus").style.color = error ? "#c62828" : "";
}

function setBusy(value) {
    busy = value;
    document.querySelectorAll(
        "#plRefresh,#plAdd,#plSave,#plCancel,.pl-actions button"
    ).forEach(b => b.disabled = value);
}

async function verifyAdmin() {
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) throw Error("Please sign in.");

    const { data: profile, error: e } = await db.from("profiles")
        .select("id,role,email,full_name").eq("id", user.id).single();

    if (e || String(profile?.role).toLowerCase() !== "admin")
        throw Error("Admin access required.");

    admin = { user, profile };
}

async function fetchAll(name, columns, filter = {}) {
    const result = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
        let q = db.from(name).select(columns)
            .order("created_at", { ascending: false })
            .range(offset, offset + 999);

        for (const [key, value] of Object.entries(filter))
            q = q.eq(key, value);

        const { data, error } = await q;
        if (error) throw error;
        result.push(...(data || []));
        if ((data || []).length < 1000) return result;
    }
    throw Error("Too many records.");
}

const sellerName = (id, fallback) => {
    const s = sellers.find(x => x.id === id);
    return s?.full_name || s?.email || fallback || "Unknown Seller";
};

function productType(p) {
    if (["per_kg", "fixed_size"].includes(p.pricing_type))
        return p.pricing_type;

    const text = `${p.variant || ""} ${p.unit || ""}`.toLowerCase();
    return /(^|\s|\/)kg(\s|$)/.test(text) ? "per_kg" : "fixed_size";
}

function findBenchmark(p) {
    const type = productType(p);
    const matches = benchmarks.filter(b =>
        norm(b.product_name) === norm(p.name) &&
        (!b.category || norm(b.category) === norm(p.category)) &&
        b.pricing_type === type
    );

    if (type === "per_kg") return matches[0] || null;

    const sizes = [
        p.variant, p.size,
        p.weight != null && p.unit ? `${p.weight}${p.unit}` : null,
        p.weight != null ? String(p.weight) : null
    ].filter(Boolean).map(norm);

    return sizes.length
        ? matches.find(b => sizes.includes(norm(b.size))) || null
        : matches[0] || null;
}

// Whole-kilogram SRP comparison.
// Example: 3.7 kg -> 3 kg; ₱150/kg -> ₱450 adjusted SRP.
function comparePrice(p) {
    const benchmark = findBenchmark(p);

    if (!benchmark || benchmark.max_price == null ||
        benchmark.max_price === "" ||
        !Number.isFinite(Number(benchmark.max_price))) {
        return { status: "unmatched", label: "No Benchmark", srp: "—" };
    }

    const perKg = productType(p) === "per_kg";
    const weight = Number(p.weight);

    if (perKg && (p.weight == null || p.weight === "" ||
        !Number.isFinite(weight) || weight < 1)) {
        return {
            status: "unmatched",
            label: "Weight Required",
            srp: "Enter Weight ≥ 1 kg"
        };
    }

    const multiplier = perKg ? Math.floor(weight) : 1;
    const max = Number(benchmark.max_price) * multiplier;
    const hasMin = benchmark.min_price != null &&
        benchmark.min_price !== "" &&
        Number.isFinite(Number(benchmark.min_price));

    const min = hasMin ? Number(benchmark.min_price) * multiplier : null;
    const range = min === null ? money(max) : `${money(min)}–${money(max)}`;
    const srp = perKg
        ? `${range} (${multiplier} whole kg × SRP/kg)` : range;

    if (p.price == null || p.price === "" ||
        !Number.isFinite(Number(p.price)) || Number(p.price) < 0) {
        return { status: "unmatched", label: "No Price", srp };
    }

    const price = Number(p.price);

    if (price > max)
        return { status: "overpriced", label: "Overpriced", srp };

    if (min !== null && price < min)
        return { status: "underpriced", label: "Below Minimum", srp };

    return { status: "compliant", label: "Within Range", srp };
}

async function loadProducts() {
    if (busy) return;
    setBusy(true);
    message("Loading products...");

    try {
        await verifyAdmin();

        const [s, b, p] = await Promise.all([
            fetchAll("profiles", "id,full_name,email,role", { role: "seller" }),
            fetchAll("market_prices",
                "id,product_name,category,pricing_type,size,min_price,max_price"),
            fetchAll("products",
                "id,name,price,stock,category,seller_id,seller_name,image_url,created_at,is_active,variant,unit,price_status,weight,pricing_type")
        ]);

        sellers = s.sort((a, b) =>
            String(a.full_name || a.email || "").localeCompare(
                String(b.full_name || b.email || "")
            )
        );
        benchmarks = b;
        products = p;
        page = 1;

        buildFilters();
        applyFilters();
        message();
    } catch (e) {
        console.error(e);
        message(e.message || "Unable to load products.", true);
        table.innerHTML = '<tr><td colspan="9">Unable to load products.</td></tr>';
    } finally {
        setBusy(false);
    }
}

// Column heading filters
function closeFilters() {
    document.querySelectorAll(".pl-filter-menu")
        .forEach(el => el.classList.remove("open"));
    document.querySelectorAll(".pl-filter-trigger")
        .forEach(el => el.setAttribute("aria-expanded", "false"));
}

function buildFilters() {
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

    if (filters.category !== "all" &&
        !categories.includes(filters.category))
        filters.category = "all";

    const groups = {
        category: [
            ["All Categories", "all"],
            ...categories.map(c => [c, c])
        ],
        type: [
            ["All Types", "all"],
            ["Per kg", "per_kg"],
            ["Fixed Size", "fixed_size"]
        ],
        status: [
            ["All Statuses", "all"],
            ["Within Range", "compliant"],
            ["Overpriced", "overpriced"],
            ["Below Minimum", "underpriced"],
            ["No Benchmark", "unmatched"]
        ]
    };

    const ids = {
        category: "plCategoryMenu",
        type: "plTypeMenu",
        status: "plStatusMenu"
    };

    Object.entries(groups).forEach(([kind, options]) => {
        const menu = $(ids[kind]);
        menu.replaceChildren();

        options.forEach(([label, value]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "pl-filter-option";
            btn.textContent = label;
            btn.classList.toggle("selected", filters[kind] === value);
            btn.onclick = () => {
                filters[kind] = value;
                page = 1;
                buildFilters();
                closeFilters();
                applyFilters();
            };
            menu.appendChild(btn);
        });
    });

    const suggestions = $("plCategorySuggestions");
    suggestions.replaceChildren();
    categories.forEach(c => suggestions.add(new Option(c, c)));

    ["category", "type", "status"].forEach(kind => {
        const id = {
            category: "plCategoryTrigger",
            type: "plTypeTrigger",
            status: "plStatusTrigger"
        }[kind];
        $(id).classList.toggle("selected", filters[kind] !== "all");
    });
}

function applyFilters() {
    const search = $("plSearch").value.trim().toLowerCase();

    filtered = products.filter(p => {
        const info = comparePrice(p);
        const text = [
            p.name, p.category, p.variant,
            sellerName(p.seller_id, p.seller_name),
            p.id, info.label
        ].join(" ").toLowerCase();

        return (!search || text.includes(search)) &&
            (filters.category === "all" || p.category === filters.category) &&
            (filters.type === "all" || productType(p) === filters.type) &&
            (filters.status === "all" || info.status === filters.status);
    });

    page = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
    render();
}

function render() {
    const start = (page - 1) * PAGE_SIZE;
    const rows = filtered.slice(start, start + PAGE_SIZE);

    table.innerHTML = rows.map(p => {
        const info = comparePrice(p);
        const type = productType(p);
        const img = p.image_url && /^https?:\/\//i.test(p.image_url)
            ? `<img class="pl-thumbnail" src="${esc(p.image_url)}"
                alt="" loading="lazy" referrerpolicy="no-referrer">`
            : '<div class="pl-thumbnail-empty">No image</div>';

        return `
        <tr>
            <td>
                <div class="pl-product">
                    ${img}
                    <div>
                        <div class="pl-name">${esc(p.name || "Unnamed Product")}</div>
                        <div class="pl-sub">${esc(p.variant || "—")}</div>
                    </div>
                </div>
            </td>
            <td class="pl-seller">${esc(sellerName(p.seller_id, p.seller_name))}</td>
            <td>${esc(p.category || "—")}</td>
            <td><span class="pl-pill ${type === "per_kg" ? "kg" : "fixed"}">
                ${type === "per_kg" ? "Per kg" : "Fixed Size"}
            </span></td>
            <td class="pl-price">${money(p.price)}</td>
            <td class="pl-srp">${esc(info.srp)}</td>
            <td><span class="pl-pill ${info.status}">${esc(info.label)}</span></td>
            <td>${Number(p.stock || 0).toLocaleString()}</td>
            <td><div class="pl-actions">
                ${["view", "edit", "delete"].map(action =>
                    `<button type="button" class="pl-${action}"
                        data-action="${action}" data-id="${esc(p.id)}">
                        ${action[0].toUpperCase() + action.slice(1)}
                    </button>`
                ).join("")}
            </div></td>
        </tr>`;
    }).join("") ||
        '<tr><td colspan="9" class="pl-empty">No products found</td></tr>';

    $("plPageInfo").textContent =
        `${rows.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length} products`;

    $("plPrevious").disabled = page <= 1;
    $("plNext").disabled = page * PAGE_SIZE >= filtered.length;
}

// Product modal
function populateSellers(selected = "") {
    const select = $("plSeller");
    select.replaceChildren(new Option("Select seller", ""));

    sellers.forEach(s => {
        const label = s.full_name && s.email
            ? `${s.full_name} (${s.email})`
            : s.full_name || s.email || s.id;
        select.add(new Option(label, s.id));
    });

    select.value = selected || "";
}

function openModal(title, subtitle) {
    $("plModalTitle").textContent = title;
    $("plModalSubtitle").textContent = subtitle;
    modal.style.display = "flex";
}

function closeModal() {
    if (busy) return;
    modal.style.display = "none";
    editingId = null;
    form.reset();
    $("plViewContent").replaceChildren();
}

function openForm(id = null) {
    if (busy) return;

    const p = id ? products.find(x => String(x.id) === String(id)) : null;
    if (id && !p) return;

    editingId = id;
    form.reset();

    $("plViewContent").hidden = true;
    form.hidden = false;
    $("plViewFooter").hidden = true;

    openModal(
        p ? "Edit Product" : "Add Product",
        p ? "Update Product Information" : "Create Seller Product"
    );

    $("plSave").textContent = p ? "Save Changes" : "Create Product";
    populateSellers(p?.seller_id);

    const values = {
        plName: p?.name || "",
        plCategory: p?.category || "",
        plPricingType: p ? productType(p) : "fixed_size",
        plPrice: p?.price ?? "",
        plStock: p?.stock ?? "",
        plVariant: p?.variant || "",
        plWeight: p?.weight ?? "",
        plUnit: p?.unit || "",
        plImage: p?.image_url || ""
    };

    Object.entries(values).forEach(([id, value]) => $(id).value = value);
    updateImage();
    updatePricePreview();
    $("plName").focus();
}

function showDetails(id) {
    const p = products.find(x => String(x.id) === String(id));
    if (!p) return;

    const info = comparePrice(p);
    form.hidden = true;
    $("plViewContent").hidden = false;
    $("plViewFooter").hidden = false;

    const fields = {
        "Product Name": p.name,
        Seller: sellerName(p.seller_id, p.seller_name),
        Category: p.category,
        "Pricing Type": productType(p) === "per_kg" ? "Per kg" : "Fixed Size",
        "Selling Price": money(p.price),
        "Market Price (SRP)": info.srp,
        "Price Status": info.label,
        Stock: p.stock,
        "Variant / Size": p.variant,
        Weight: p.weight,
        Unit: p.unit,
        Created: date(p.created_at),
        "Product ID": p.id
    };

    $("plViewContent").innerHTML = `
        <div class="pl-detail-grid">
            ${Object.entries(fields).map(([label, value]) => `
                <div class="pl-detail">
                    <span class="pl-detail-label">${esc(label)}</span>
                    <span class="pl-detail-value">${esc(value ?? "—")}</span>
                </div>
            `).join("")}
        </div>
        ${p.image_url && /^https?:\/\//i.test(p.image_url)
            ? `<img src="${esc(p.image_url)}" alt="Product image"
                style="max-width:100%;max-height:220px;object-fit:contain;margin-top:16px;border-radius:10px">`
            : ""}`;

    openModal(p.name || "Product Details", "Product Information");
}

function updateImage() {
    const url = $("plImage").value.trim();
    const img = $("plImagePreview");

    if (/^https?:\/\//i.test(url)) {
        img.src = url;
        img.style.display = "block";
    } else {
        img.removeAttribute("src");
        img.style.display = "none";
    }
}

function updatePricePreview() {
    if (!$("plName").value.trim()) {
        $("plPricePreview").textContent =
            "Enter product details to check the market price.";
        return;
    }

    const p = {
        name: $("plName").value.trim(),
        category: $("plCategory").value.trim(),
        pricing_type: $("plPricingType").value,
        price: $("plPrice").value === "" ? null : Number($("plPrice").value),
        variant: $("plVariant").value.trim(),
        weight: $("plWeight").value === "" ? null : Number($("plWeight").value),
        unit: $("plUnit").value.trim()
    };

    const info = comparePrice(p);
    $("plPricePreview").textContent =
        `Market Price (SRP): ${info.srp} | Status: ${info.label}`;
}

function readForm() {
    if (!form.reportValidity()) return null;

    const value = id => $(id).value.trim();
    const seller = sellers.find(s => s.id === value("plSeller"));

    if (!seller) throw Error("Please select a valid seller.");

    const priceText = value("plPrice");
    const stockText = value("plStock");
    const weightText = value("plWeight");
    const price = Number(priceText);
    const stock = Number(stockText);
    const weight = weightText === "" ? null : Number(weightText);
    const image = value("plImage");
    const type = value("plPricingType");

    if (!value("plName") || !value("plCategory"))
        throw Error("Product name and category are required.");

    if (!["per_kg", "fixed_size"].includes(type))
        throw Error("Invalid pricing type.");

    if (priceText === "" || !Number.isFinite(price) || price < 0 ||
        Math.abs(price * 100 - Math.round(price * 100)) > 0.000001)
        throw Error("Enter a valid price with up to 2 decimal places.");

    if (stockText === "" || !Number.isSafeInteger(stock) || stock < 0)
        throw Error("Stock must be a non-negative whole number.");

    if (weight !== null && (!Number.isFinite(weight) || weight < 0))
        throw Error("Enter a valid weight.");

    if (image && !/^https?:\/\//i.test(image))
        throw Error("Image URL must start with http:// or https://.");

    return {
        name: value("plName"),
        seller_id: seller.id,
        seller_name: seller.full_name || seller.email || null,
        category: value("plCategory"),
        pricing_type: type,
        price,
        stock,
        variant: value("plVariant") || null,
        weight,
        unit: value("plUnit") || null,
        image_url: image || null
    };
}

async function audit(action, description) {
    if (!admin) return;

    const { error } = await db.from("audit_logs").insert({
        user_id: admin.user.id,
        user: admin.profile.email || "Admin",
        action,
        module: "Product Listings",
        description
    });

    if (error) console.error("Audit error:", error.message);
}

async function saveProduct(event) {
    event.preventDefault();
    if (busy) return;

    let values;
    try {
        values = readForm();
        if (!values) return;
    } catch (e) {
        message(e.message, true);
        alert(e.message);
        return;
    }

    setBusy(true);
    message("Saving product...");

    try {
        await verifyAdmin();

        const editing = editingId !== null;
        const query = editing
            ? db.from("products").update(values).eq("id", editingId)
            : db.from("products").insert({ ...values, is_active: true });

        const { data, error } = await query.select("id").single();
        if (error) throw error;
        if (!data?.id) throw Error("Product was not saved.");

        await audit(
            editing ? "Update Product" : "Create Product",
            `${values.name} — Seller: ${values.seller_name || values.seller_id} — ${comparePrice(values).label}`
        );

        setBusy(false);
        closeModal();
        await loadProducts();

        message(editing
            ? "Product updated successfully."
            : "Product created successfully.");
    } catch (e) {
        console.error(e);
        message(e.message || "Unable to save product.", true);
    } finally {
        setBusy(false);
    }
}

async function deleteProduct(id) {
    if (busy) return;

    const p = products.find(x => String(x.id) === String(id));
    if (!p || !confirm(
        `Delete "${p.name}"?\n\nThis may affect existing orders or seller records.`
    )) return;

    setBusy(true);
    message("Deleting product...");

    try {
        await verifyAdmin();

        const { data, error } = await db.from("products")
            .delete().eq("id", id).select("id");

        if (error) throw error;
        if (!data?.length) throw Error("Product was not deleted.");

        await audit(
            "Delete Product",
            `${p.name} — Seller: ${p.seller_name || p.seller_id}`
        );

        setBusy(false);
        await loadProducts();
        message("Product deleted successfully.");
    } catch (e) {
        console.error(e);
        message(e.message || "Unable to delete product.", true);
    } finally {
        setBusy(false);
    }
}

// Events
table.addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn || busy) return;

    const { action, id } = btn.dataset;
    if (action === "view") showDetails(id);
    if (action === "edit") openForm(id);
    if (action === "delete") deleteProduct(id);
});

$("plAdd").onclick = () => openForm();
$("plRefresh").onclick = loadProducts;

$("plSearch").oninput = () => {
    page = 1;
    applyFilters();
};

const menus = [
    ["plCategoryTrigger", "plCategoryMenu"],
    ["plTypeTrigger", "plTypeMenu"],
    ["plStatusTrigger", "plStatusMenu"]
];

menus.forEach(([triggerId, menuId]) => {
    $(triggerId).onclick = () => {
        const wasOpen = $(menuId).classList.contains("open");
        closeFilters();
        if (!wasOpen) {
            $(menuId).classList.add("open");
            $(triggerId).setAttribute("aria-expanded", "true");
        }
    };
});

document.addEventListener("click", e => {
    if (!e.target.closest(".pl-filter-header")) closeFilters();
});

$("plPrevious").onclick = () => {
    if (page > 1) { page--; render(); }
};

$("plNext").onclick = () => {
    if (page * PAGE_SIZE < filtered.length) { page++; render(); }
};

$("plImage").oninput = updateImage;
$("plImagePreview").onerror = () =>
    $("plImagePreview").style.display = "none";

["plName", "plCategory", "plPricingType", "plPrice",
 "plVariant", "plWeight", "plUnit"].forEach(id => {
    $(id).addEventListener("input", updatePricePreview);
    $(id).addEventListener("change", updatePricePreview);
});

form.addEventListener("submit", saveProduct);
$("plCancel").onclick = closeModal;
$("plViewClose").onclick = closeModal;

loadProducts();
