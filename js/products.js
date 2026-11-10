
const plTable = document.getElementById("plTable");
const plModal = document.getElementById("plModal");
const plForm = document.getElementById("plForm");
const plViewContent = document.getElementById("plViewContent");

let plProducts = [];
let plSellers = [];
let plBenchmarks = [];
let plMasterProducts = [];
let plBrands = [];
let plCategories = [];
let plBrandProducts = [];
let plFiltered = [];
let plAdmin = null;
let plPage = 1;
let plEditingId = null;
let plSelectedMasterId = null;
let plBusy = false;
let plCategoryFilter = "all";
let plTypeFilter = "all";
let plStatusFilter = "all";

const plPageSize = 10;

const plWeightCategories = [
    "meat", "meats", "fish", "fishes",
    "seafood", "seafoods", "poultry",
    "fresh meat", "fresh fish", "fresh seafood"
];

// Helpers
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
    return String(value ?? "").trim().toLowerCase()
        .replace(/\s+/g, " ");
}

function plNormalizeVariant(value) {
    return plNormalize(value)
        .replace(/\bkilograms?\b/g, "kg")
        .replace(/\bgrams?\b/g, "g")
        .replace(/\bmillilit(?:ers?|res?)\b/g, "ml")
        .replace(/\blit(?:ers?|res?)\b/g, "l")
        .replace(/\s+/g, "");
}

function plMoney(value) {
    if (value === null || value === undefined || value === "") {
        return "—";
    }

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

function plHasNumber(value) {
    return value !== null &&
        value !== undefined &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value));
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

function plMaster(id) {
    return plMasterProducts.find(p => p.id === id) || null;
}

function plBrand(id) {
    return plBrands.find(b => b.id === id) || null;
}

function plCategory(id) {
    return plCategories.find(c => c.id === id) || null;
}

function plBrandName(id) {
    return id ? plBrand(id)?.name || "Unknown Brand" : "Unbranded";
}

function plSellerName(id, fallback = "") {
    const seller = plSellers.find(s => s.id === id);

    return seller?.full_name ||
        seller?.email ||
        fallback ||
        "Unknown Seller";
}

function plGetPricingType(product) {
    const category = plNormalize(product?.category);

    return plWeightCategories.includes(category)
        ? "per_kg"
        : "fixed_size";
}

function plPricingLabel(type) {
    return type === "per_kg" ? "Per kg" : "Per Variant";
}

// Database
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

    if (profileError || plNormalize(profile?.role) !== "admin") {
        throw Error("Admin access required.");
    }

    plAdmin = { user, profile };
}

async function plFetchAll(table, columns, sort = "created_at", filters = null) {
    const rows = [];
    const batchSize = 1000;

    for (let start = 0; start < 100000; start += batchSize) {
        let query = db
            .from(table)
            .select(columns)
            .order(sort, { ascending: false })
            .range(start, start + batchSize - 1);

        if (filters) {
            for (const [column, value] of Object.entries(filters)) {
                query = query.eq(column, value);
            }
        }

        const { data, error } = await query;

        if (error) throw error;

        rows.push(...(data || []));

        if (!data || data.length < batchSize) return rows;
    }

    throw Error("Too many records.");
}

async function loadProducts() {
    if (plBusy) return;

    plSetBusy(true);
    plMessage("Loading products...");

    try {
        await plVerifyAdmin();

        const [
            sellers, benchmarks, products,
            masters, brands, categories, links
        ] = await Promise.all([
            plFetchAll(
                "profiles",
                "id,full_name,email,role",
                "created_at",
                { role: "seller" }
            ),
            plFetchAll(
                "market_prices",
                "id,master_product_id,brand_id,product_name,category,pricing_type,variant,min_price,max_price",
                "created_at"
            ),
            plFetchAll(
                "products",
                "id,name,price,stock,category,seller_id,seller_name,image_url,created_at,is_active,variant,unit,price_status,weight,pricing_type,brand_id"
            ),
            plFetchAll(
                "master_products",
                "id,product_name,allow_unbranded",
                "product_name"
            ),
            plFetchAll("brands", "id,name", "name"),
            plFetchAll("categories", "id,name", "name"),
            plFetchAll(
                "brand_products",
                "id,brand_id,master_product_id,category_id"
            )
        ]);

        plSellers = sellers.sort((a, b) =>
            String(a.full_name || a.email || "").localeCompare(
                String(b.full_name || b.email || "")
            )
        );

        plBenchmarks = benchmarks;
        plProducts = products;
        plMasterProducts = masters;
        plBrands = brands;
        plCategories = categories;
        plBrandProducts = links;

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

// Master List selection
function plGetLinks(masterId) {
    return plBrandProducts.filter(link =>
        link.master_product_id === masterId
    );
}

function plAvailableBrands(masterId) {
    const ids = new Set(
        plGetLinks(masterId)
            .map(link => link.brand_id)
            .filter(Boolean)
    );

    return plBrands.filter(brand => ids.has(brand.id));
}

function plAvailableCategories(masterId, brandValue) {
    const links = plGetLinks(masterId).filter(link =>
        brandValue === "unbranded"
            ? !link.brand_id
            : link.brand_id === brandValue
    );

    const ids = new Set(
        links.map(link => link.category_id).filter(Boolean)
    );

    return plCategories.filter(category => ids.has(category.id));
}

function plHideSuggestions() {
    document.getElementById("plSuggestions").hidden = true;
}

function plResetSelection() {
    plSelectedMasterId = null;

    const status = document.getElementById("plProductSelected");
    status.textContent = "";
    status.classList.remove("error");

    const brand = document.getElementById("plBrand");
    brand.replaceChildren(new Option("Select a product first", ""));
    brand.disabled = true;

    const category = document.getElementById("plCategory");
    category.replaceChildren(new Option("Select a brand first", ""));
    category.disabled = true;

    plUpdatePricingFields();
}

function plShowSuggestions() {
    const query = plNormalize(document.getElementById("plName").value);
    const container = document.getElementById("plSuggestions");

    const matches = plMasterProducts
        .filter(product =>
            !query || plNormalize(product.product_name).includes(query)
        )
        .sort((a, b) => {
            const aFirst = plNormalize(a.product_name).startsWith(query) ? 0 : 1;
            const bFirst = plNormalize(b.product_name).startsWith(query) ? 0 : 1;

            return aFirst - bFirst ||
                a.product_name.localeCompare(b.product_name);
        })
        .slice(0, 12);

    container.innerHTML = matches.length
        ? matches.map(product => `
            <button class="pl-suggestion" type="button"
                data-master-id="${plEsc(product.id)}">
                ${plEsc(product.product_name)}
            </button>
        `).join("")
        : '<div class="pl-hint" style="padding:12px">No matching Master List product.</div>';

    container.hidden = false;
}

function plSelectMaster(id) {
    const product = plMaster(id);
    if (!product) return;

    plSelectedMasterId = product.id;

    document.getElementById("plName").value = product.product_name;

    const status = document.getElementById("plProductSelected");
    status.textContent = "Selected from Master List";
    status.classList.remove("error");

    plHideSuggestions();
    plPopulateBrands();
}

function plPopulateBrands(preferred = "") {
    const master = plMaster(plSelectedMasterId);
    const select = document.getElementById("plBrand");

    select.replaceChildren(new Option("Select brand", ""));

    if (!master) {
        select.disabled = true;
        plPopulateCategories();
        return;
    }

    const available = plAvailableBrands(master.id);

    if (master.allow_unbranded) {
        select.add(new Option("Unbranded", "unbranded"));
    }

    available.forEach(brand => {
        select.add(new Option(brand.name, brand.id));
    });

    select.disabled = false;

    if (
        preferred === "unbranded" &&
        master.allow_unbranded
    ) {
        select.value = "unbranded";
    } else if (available.some(b => b.id === preferred)) {
        select.value = preferred;
    } else if (available.length === 1 && !master.allow_unbranded) {
        select.value = available[0].id;
    } else if (!available.length && master.allow_unbranded) {
        select.value = "unbranded";
    }

    plPopulateCategories();
}

function plPopulateCategories(preferred = "") {
    const select = document.getElementById("plCategory");
    const brandValue = document.getElementById("plBrand").value;

    select.replaceChildren(new Option("Select category", ""));
    select.disabled = true;

    if (!plSelectedMasterId || !brandValue) {
        plUpdatePricingFields();
        return;
    }

    const available = plAvailableCategories(
        plSelectedMasterId,
        brandValue
    );

    available.forEach(category => {
        select.add(new Option(category.name, category.id));
    });

    select.disabled = !available.length;

    if (available.some(c => c.id === preferred)) {
        select.value = preferred;
    } else if (available.length === 1) {
        select.value = available[0].id;
    }

    plUpdatePricingFields();
}

function plSelectedCategoryName() {
    const id = document.getElementById("plCategory").value;
    return plCategory(id)?.name || "";
}

function plUpdatePricingFields() {
    const category = plSelectedCategoryName();
    const type = category
        ? plGetPricingType({ category })
        : null;

    const perKg = type === "per_kg";

    const variantField = document.getElementById("plVariantField");
    const weightField = document.getElementById("plWeightField");
    const unitField = document.getElementById("plUnitField");

    const variant = document.getElementById("plVariant");
    const weight = document.getElementById("plWeight");
    const unit = document.getElementById("plUnit");

    variantField.hidden = perKg;
    weightField.hidden = !perKg;
    unitField.hidden = !perKg;

    variant.required = Boolean(type && !perKg);
    weight.required = perKg;

    if (perKg) {
        variant.value = "1 kg";
        unit.value = "kg";
    } else {
        if (variant.value === "1 kg") variant.value = "";
        unit.value = "";
        weight.value = "";
    }

    document.getElementById("plPricingDisplay").textContent =
        !type
            ? "Select a category first."
            : perKg
                ? "Per kilogram — SRP reference is 1 kg."
                : "Per variant — SRP depends on the package variant.";

    plUpdatePricePreview();
}

// SRP matching
function plFindBenchmark(product) {
    const name = plNormalize(product.name);
    const category = plNormalize(product.category);
    const brandId = product.brand_id || null;
    const type = plGetPricingType(product);
    const variant = plNormalizeVariant(product.variant);

    if (!name || !category) return null;

    const matches = plBenchmarks.filter(benchmark => {
        if (plNormalize(benchmark.product_name) !== name) {
            return false;
        }

        if (plNormalize(benchmark.category) !== category) {
            return false;
        }

        if ((benchmark.brand_id || null) !== brandId) {
            return false;
        }

        if (benchmark.pricing_type !== type) {
            return false;
        }

        return true;
    });

    if (type === "per_kg") {
        return matches.find(benchmark =>
            plNormalizeVariant(benchmark.variant) === "1kg"
        ) || null;
    }

    if (!variant) return null;

    return matches.find(benchmark =>
        plNormalizeVariant(benchmark.variant) === variant
    ) || null;
}

function plComparePrice(product) {
    const benchmark = plFindBenchmark(product);

    if (!benchmark || !plHasNumber(benchmark.max_price)) {
        return {
            benchmark: null,
            status: "unmatched",
            label: "No SRP",
            srp: "—"
        };
    }

    const perKg = plGetPricingType(product) === "per_kg";
    let multiplier = 1;

    if (perKg) {
        if (!plHasNumber(product.weight)) {
            return {
                benchmark,
                status: "unmatched",
                label: "Weight Required",
                srp: `${plMoney(benchmark.max_price)}/kg`
            };
        }

        const weight = Number(product.weight);

        if (weight < 1) {
            return {
                benchmark,
                status: "unmatched",
                label: "Weight Required",
                srp: "Minimum 1 kg"
            };
        }

        // Whole-kilogram SRP rule
        multiplier = Math.floor(weight);
    }

    const max = Number(benchmark.max_price) * multiplier;

    const hasMin = plHasNumber(benchmark.min_price);
    const min = hasMin
        ? Number(benchmark.min_price) * multiplier
        : null;

    const lower = min === null ? max : min;

    const range = min === null
        ? plMoney(max)
        : `${plMoney(min)}–${plMoney(max)}`;

    const srp = perKg
        ? `${range} (${multiplier} whole kg)`
        : range;

    if (!plHasNumber(product.price) || Number(product.price) < 0) {
        return {
            benchmark,
            status: "unmatched",
            label: "No Price",
            srp
        };
    }

    const price = Number(product.price);

    if (price > max + 0.000001) {
        return {
            benchmark,
            status: "overpriced",
            label: "Overpriced",
            srp
        };
    }

    if (price < lower - 0.000001) {
        return {
            benchmark,
            status: "underpriced",
            label: "Below SRP",
            srp
        };
    }

    return {
        benchmark,
        status: "compliant",
        label: "Within SRP",
        srp
    };
}

// Filters
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
        plProducts.map(p => String(p.category || "").trim())
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

    categoryMenu.replaceChildren(
        plOption("All Categories", "all", "category")
    );

    categories.forEach(category =>
        categoryMenu.appendChild(
            plOption(category, category, "category")
        )
    );

    typeMenu.replaceChildren(
        plOption("All Types", "all", "type"),
        plOption("Per kg", "per_kg", "type"),
        plOption("Per Variant", "fixed_size", "type")
    );

    statusMenu.replaceChildren(
        plOption("All Statuses", "all", "status"),
        plOption("Within SRP", "compliant", "status"),
        plOption("Overpriced", "overpriced", "status"),
        plOption("Below SRP", "underpriced", "status"),
        plOption("No SRP", "unmatched", "status")
    );

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
        const seller = plSellerName(
            product.seller_id,
            product.seller_name
        );

        const info = plComparePrice(product);

        const searchable = [
            product.name,
            product.category,
            product.variant,
            plBrandName(product.brand_id),
            seller,
            product.id,
            info.label
        ].map(v => String(v ?? "")).join(" ").toLowerCase();

        return (!search || searchable.includes(search)) &&
            (plCategoryFilter === "all" ||
                product.category === plCategoryFilter) &&
            (plTypeFilter === "all" ||
                plGetPricingType(product) === plTypeFilter) &&
            (plStatusFilter === "all" ||
                info.status === plStatusFilter);
    });

    plPage = Math.min(
        plPage,
        Math.max(1, Math.ceil(plFiltered.length / plPageSize))
    );

    plRender();
}

// Product table
function plRender() {
    const start = (plPage - 1) * plPageSize;
    const page = plFiltered.slice(start, start + plPageSize);

    plTable.innerHTML = page.length
        ? page.map(product => {
            const kg = plGetPricingType(product) === "per_kg";
            const info = plComparePrice(product);

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
                                    ${product.brand_id
                                        ? ` · ${plEsc(plBrandName(product.brand_id))}`
                                        : ""}
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="pl-seller">
                        ${plEsc(plSellerName(
                            product.seller_id,
                            product.seller_name
                        ))}
                    </td>
                    <td>${plEsc(product.category || "—")}</td>
                    <td>
                        <span class="pl-pill ${kg ? "kg" : "fixed"}">
                            ${kg ? "Per kg" : "Per Variant"}
                        </span>
                    </td>
                    <td class="pl-price">${plMoney(product.price)}</td>
                    <td class="pl-srp">${plEsc(info.srp)}</td>
                    <td>
                        <span class="pl-pill ${info.status}">
                            ${plEsc(info.label)}
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

// Product modal
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
    plSelectedMasterId = null;
    plForm.reset();
    plViewContent.replaceChildren();
    plHideSuggestions();
}

function plOpenForm(id = null) {
    if (plBusy) return;

    const product = id
        ? plProducts.find(p => String(p.id) === String(id))
        : null;

    if (id && !product) return;

    plEditingId = id;
    plForm.reset();
    plResetSelection();

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

    if (product) {
        const master = plMasterProducts.find(p =>
            plNormalize(p.product_name) === plNormalize(product.name)
        );

        if (master) {
            plSelectMaster(master.id);
            plPopulateBrands(product.brand_id || "unbranded");

            const category = plCategories.find(c =>
                plNormalize(c.name) === plNormalize(product.category)
            );

            plPopulateCategories(category?.id || "");
        } else {
            document.getElementById("plName").value = product.name || "";
        }
    }

    document.getElementById("plPrice").value = product?.price ?? "";
    document.getElementById("plStock").value = product?.stock ?? "";

    if (product) {
        if (plGetPricingType(product) === "per_kg") {
            document.getElementById("plVariant").value = "1 kg";
        } else {
            document.getElementById("plVariant").value =
                product.variant || "";
        }

        document.getElementById("plWeight").value =
            product.weight ?? "";
    }

    document.getElementById("plImage").value =
        product?.image_url || "";

    plUpdatePreview();
    plUpdatePricePreview();

    document.getElementById("plName").focus();
}

function plShowDetails(id) {
    const product = plProducts.find(p => String(p.id) === String(id));
    if (!product) return;

    const info = plComparePrice(product);

    plForm.hidden = true;
    plViewContent.hidden = false;
    document.getElementById("plViewFooter").hidden = false;

    const fields = [
        ["Product Name", product.name],
        ["Seller", plSellerName(product.seller_id, product.seller_name)],
        ["Brand", plBrandName(product.brand_id)],
        ["Category", product.category],
        ["Pricing Type", plPricingLabel(plGetPricingType(product))],
        ["Selling Price", plMoney(product.price)],
        ["Market Price (SRP)", info.srp],
        ["Price Status", info.label],
        ["Stock", product.stock],
        ["Variant", product.variant],
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
    const preview = document.getElementById("plPricePreview");
    if (!preview) return;

    const name = document.getElementById("plName").value.trim();
    const category = plSelectedCategoryName();
    const brandValue = document.getElementById("plBrand").value;
    const priceText = document.getElementById("plPrice").value;
    const weightText = document.getElementById("plWeight").value;

    if (!plSelectedMasterId || !category || !brandValue) {
        preview.textContent =
            "Select a Master List product, brand, and category to check SRP.";
        return;
    }

    const info = plComparePrice({
        name,
        category,
        brand_id: brandValue === "unbranded" ? null : brandValue,
        variant: document.getElementById("plVariant").value.trim(),
        weight: weightText === "" ? null : Number(weightText),
        unit: "kg",
        price: priceText === "" ? null : Number(priceText)
    });

    preview.textContent =
        `Market Price (SRP): ${info.srp} | Status: ${info.label}`;
}

// Form validation
function plReadForm() {
    if (!plForm.reportValidity()) return null;

    const master = plMaster(plSelectedMasterId);
    const name = document.getElementById("plName").value.trim();

    if (!master || plNormalize(name) !== plNormalize(master.product_name)) {
        throw Error("Select an existing product from Master List.");
    }

    const sellerId = document.getElementById("plSeller").value;
    const seller = plSellers.find(s => s.id === sellerId);

    if (!seller) {
        throw Error("Please select a valid Seller account.");
    }

    const brandValue = document.getElementById("plBrand").value;
    const brandId = brandValue === "unbranded" ? null : brandValue;

    if (!brandValue) {
        throw Error("Select a brand.");
    }

    if (!brandId && !master.allow_unbranded) {
        throw Error("This product does not allow unbranded listings.");
    }

    if (
        brandId &&
        !plAvailableBrands(master.id).some(b => b.id === brandId)
    ) {
        throw Error("Brand is not registered for this product.");
    }

    const categoryId = document.getElementById("plCategory").value;
    const category = plCategory(categoryId);

    if (!category) {
        throw Error("Select a registered category.");
    }

    const validCategories = plAvailableCategories(
        master.id,
        brandValue
    );

    if (!validCategories.some(c => c.id === category.id)) {
        throw Error("Category is not registered for this product and brand.");
    }

    const type = plGetPricingType({ category: category.name });
    const priceText = document.getElementById("plPrice").value;
    const stockText = document.getElementById("plStock").value;
    const variantText = document.getElementById("plVariant").value.trim();
    const weightText = document.getElementById("plWeight").value;
    const image = document.getElementById("plImage").value.trim();

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
    let variant = variantText;
    let unit = null;

    if (type === "per_kg") {
        weight = Number(weightText);

        if (
            weightText === "" ||
            !Number.isFinite(weight) ||
            weight < 1
        ) {
            throw Error("Enter a selling weight of at least 1 kg.");
        }

        variant = "1 kg";
        unit = "kg";
    } else {
        if (!variant) {
            throw Error("Variant is required for quantity-based products.");
        }
    }

    if (image && !/^https?:\/\//i.test(image)) {
        throw Error("Image URL must begin with http:// or https://.");
    }

    return {
        name: master.product_name,
        seller_id: seller.id,
        seller_name: seller.full_name || seller.email || null,
        brand_id: brandId,
        category: category.name,
        pricing_type: type,
        price,
        stock,
        variant,
        weight,
        unit,
        image_url: image || null
    };
}

// Audit logs
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

// Save product
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

        const info = plComparePrice(values);

        await plAudit(
            editing ? "Update Product" : "Create Product",
            `${values.name} — Seller: ${values.seller_name || values.seller_id} — ${info.label}`
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

// Delete product
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

// Event listeners
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

document.getElementById("plRefresh")
    .addEventListener("click", loadProducts);

document.getElementById("plSearch").addEventListener("input", () => {
    plPage = 1;
    plFilter();
});

const plNameInput = document.getElementById("plName");

plNameInput.addEventListener("focus", plShowSuggestions);

plNameInput.addEventListener("input", () => {
    const master = plMaster(plSelectedMasterId);

    if (!master ||
        plNormalize(plNameInput.value) !== plNormalize(master.product_name)) {
        plResetSelection();
    }

    plShowSuggestions();
    plUpdatePricePreview();
});

plNameInput.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        plHideSuggestions();
    }

    if (event.key === "Enter" &&
        !document.getElementById("plSuggestions").hidden) {
        const first = document.querySelector(
            "#plSuggestions [data-master-id]"
        );

        if (first) {
            event.preventDefault();
            plSelectMaster(first.dataset.masterId);
        }
    }
});

document.getElementById("plSuggestions")
    .addEventListener("click", event => {
        const button = event.target.closest("[data-master-id]");
        if (!button) return;

        plSelectMaster(button.dataset.masterId);
        plUpdatePricePreview();
    });

document.addEventListener("click", event => {
    if (!event.target.closest("#plProductAutocomplete")) {
        plHideSuggestions();
    }

    if (!event.target.closest(".pl-filter-header")) {
        plCloseFilters();
    }
});

document.getElementById("plBrand").addEventListener("change", () => {
    plPopulateCategories();
});

document.getElementById("plCategory").addEventListener("change", () => {
    plUpdatePricingFields();
});

[
    "plPrice",
    "plVariant",
    "plWeight"
].forEach(id => {
    const element = document.getElementById(id);

    element.addEventListener("input", plUpdatePricePreview);
    element.addEventListener("change", plUpdatePricePreview);
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

document.getElementById("plImage")
    .addEventListener("input", plUpdatePreview);

document.getElementById("plImagePreview")
    .addEventListener("error", () => {
        document.getElementById("plImagePreview").style.display = "none";
    });

plForm.addEventListener("submit", plSave);

document.getElementById("plCancel")
    .addEventListener("click", plClose);

document.getElementById("plViewClose")
    .addEventListener("click", plClose);

loadProducts();
