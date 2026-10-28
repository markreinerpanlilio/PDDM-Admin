const mpTable = document.getElementById("marketPriceTable");
const mpModal = document.getElementById("mpModal");
const mpForm = document.getElementById("mpForm");
const mpStatusElement = document.getElementById("mpStatus");

let marketPriceData = [];
let mpFiltered = [];
let mpPage = 1;
let mpEditingId = null;
let mpBusy = false;
let mpAdmin = null;
let mpSelectedCategory = "all";
let mpSelectedType = "all";

const mpPageSize = 10;

function mpEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function mpNormalize(value) {
    return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

function mpMoney(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return "₱" + number.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function mpDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-PH");
}

function mpMessage(message, error = false) {
    mpStatusElement.textContent = message;
    mpStatusElement.style.color = error ? "#c62828" : "";
}

function mpSetBusy(value) {
    mpBusy = value;
    document.querySelectorAll("#mpAdd,#mpRefresh,#mpSave,.mp-actions button")
        .forEach(button => button.disabled = value);
}

async function mpVerifyAdmin() {
    const { data: { user }, error } = await db.auth.getUser();

    if (error || !user) throw Error("Please sign in as admin.");

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("id,role,email,full_name")
        .eq("id", user.id)
        .single();

    if (profileError || String(profile?.role).toLowerCase() !== "admin") {
        throw Error("Admin access required.");
    }

    mpAdmin = { user, profile };
    return mpAdmin;
}

async function mpFetchAll() {
    const rows = [];
    const size = 1000;

    for (let start = 0; start < 100000; start += size) {
        const { data, error } = await db
            .from("market_prices")
            .select("id,product_name,category,pricing_type,size,min_price,max_price,created_at,updated_at")
            .order("product_name", { ascending: true })
            .order("id", { ascending: true })
            .range(start, start + size - 1);

        if (error) throw error;

        rows.push(...(data || []));

        if (!data || data.length < size) return rows;
    }

    throw Error("Benchmark limit reached.");
}

async function loadMarketPrices() {
    if (mpBusy) return;

    mpSetBusy(true);
    mpMessage("Loading benchmarks...");

    try {
        await mpVerifyAdmin();

        marketPriceData = await mpFetchAll();

        mpPage = 1;
        mpBuildFilters();
        mpFilter();
        mpMessage("");
    } catch (error) {
        console.error("Load benchmarks:", error);
        mpMessage(error.message || "Unable to load benchmarks.", true);
        mpTable.innerHTML = '<tr><td colspan="8" class="mp-empty">Unable to load benchmarks</td></tr>';
    } finally {
        mpSetBusy(false);
    }
}

function mpCloseFilters() {
    document.querySelectorAll(".mp-filter-menu").forEach(menu => {
        menu.classList.remove("open");
    });

    document.querySelectorAll(".mp-filter-trigger").forEach(button => {
        button.setAttribute("aria-expanded", "false");
    });
}

function mpToggleFilter(menuId, triggerId) {
    const menu = document.getElementById(menuId);
    const trigger = document.getElementById(triggerId);
    const wasOpen = menu.classList.contains("open");

    mpCloseFilters();

    if (!wasOpen) {
        menu.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
    }
}

function mpCreateFilterOption(label, value, filterName) {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "mp-filter-option";
    button.textContent = label;
    button.dataset.value = value;

    const selected = filterName === "category"
        ? mpSelectedCategory
        : mpSelectedType;

    if (selected === value) {
        button.classList.add("selected");
    }

    button.addEventListener("click", () => {
        if (filterName === "category") {
            mpSelectedCategory = value;
        } else {
            mpSelectedType = value;
        }

        mpPage = 1;
        mpBuildFilters();
        mpCloseFilters();
        mpFilter();
    });

    return button;
}

function mpBuildFilters() {
    const categoryMenu = document.getElementById("mpCategoryMenu");
    const typeMenu = document.getElementById("mpTypeMenu");
    const suggestions = document.getElementById("mpCategorySuggestions");

    const categories = [...new Set(
        marketPriceData
            .map(item => String(item.category ?? "").trim())
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    if (
        mpSelectedCategory !== "all" &&
        !categories.includes(mpSelectedCategory)
    ) {
        mpSelectedCategory = "all";
    }

    categoryMenu.replaceChildren(
        mpCreateFilterOption("All Categories", "all", "category")
    );

    categories.forEach(category => {
        categoryMenu.appendChild(
            mpCreateFilterOption(category, category, "category")
        );
    });

    typeMenu.replaceChildren(
        mpCreateFilterOption("All Types", "all", "type"),
        mpCreateFilterOption("Per kg", "per_kg", "type"),
        mpCreateFilterOption("Fixed Size", "fixed_size", "type")
    );

    suggestions.replaceChildren();

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        suggestions.appendChild(option);
    });

    document.getElementById("mpCategoryTrigger")
        .classList.toggle("has-filter", mpSelectedCategory !== "all");

    document.getElementById("mpTypeTrigger")
        .classList.toggle("has-filter", mpSelectedType !== "all");
}

function mpFilter() {
    const search = document.getElementById("mpSearch")
        .value.trim().toLowerCase();

    mpFiltered = marketPriceData.filter(product => {
        const searchable = [
            product.product_name,
            product.category,
            product.size,
            product.pricing_type
        ].map(value => String(value ?? "")).join(" ").toLowerCase();

        const matchesSearch = !search || searchable.includes(search);

        const matchesCategory = mpSelectedCategory === "all" ||
            product.category === mpSelectedCategory;

        const matchesType = mpSelectedType === "all" ||
            product.pricing_type === mpSelectedType;

        return matchesSearch && matchesCategory && matchesType;
    });

    mpPage = Math.min(
        mpPage,
        Math.max(1, Math.ceil(mpFiltered.length / mpPageSize))
    );

    mpRender();
}

function mpRender() {
    const start = (mpPage - 1) * mpPageSize;
    const page = mpFiltered.slice(start, start + mpPageSize);

    if (!page.length) {
        mpTable.innerHTML = '<tr><td colspan="8" class="mp-empty">No benchmarks found</td></tr>';
    } else {
        mpTable.innerHTML = page.map(product => {
            const isKg = product.pricing_type === "per_kg";

            return `
                <tr>
                    <td>
                        <div class="mp-product-name">
                            ${mpEscape(product.product_name || "Unnamed Product")}
                        </div>
                    </td>
                    <td class="mp-category">
                        ${mpEscape(product.category || "—")}
                    </td>
                    <td>
                        <span class="mp-pill ${isKg ? "kg" : "fixed"}">
                            ${isKg ? "Per kg" : "Fixed Size"}
                        </span>
                    </td>
                    <td>${isKg ? "—" : mpEscape(product.size || "—")}</td>
                    <td class="${isKg ? "mp-muted" : "mp-price"}">
                        ${isKg ? "—" : mpMoney(product.min_price)}
                    </td>
                    <td class="mp-price">${mpMoney(product.max_price)}</td>
                    <td>${mpDate(product.updated_at || product.created_at)}</td>
                    <td>
                        <div class="mp-actions">
                            <button type="button" class="mp-edit"
                                data-action="edit"
                                data-id="${mpEscape(product.id)}">Edit</button>
                            <button type="button" class="mp-delete"
                                data-action="delete"
                                data-id="${mpEscape(product.id)}">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    }

    const total = mpFiltered.length;
    const from = total ? start + 1 : 0;
    const to = Math.min(start + mpPageSize, total);

    document.getElementById("mpPageInfo").textContent =
        `${from}–${to} of ${total} benchmarks`;

    document.getElementById("mpPrevious").disabled = mpPage <= 1;
    document.getElementById("mpNext").disabled =
        mpPage * mpPageSize >= total;
}

function mpUpdateFormFields() {
    const isKg = document.getElementById("mpPricingType").value === "per_kg";

    document.getElementById("mpSizeField").style.display =
        isKg ? "none" : "flex";

    document.getElementById("mpMinField").style.display =
        isKg ? "none" : "flex";

    document.getElementById("mpSize").required = !isKg;
    document.getElementById("mpMinPrice").required = !isKg;

    document.getElementById("mpPriceHint").textContent = isKg
        ? "Per kg products use a maximum price only."
        : "Fixed Size products require a size, minimum price, and maximum price.";
}

function mpOpenModal(id = null) {
    if (mpBusy) return;

    const product = id
        ? marketPriceData.find(item => String(item.id) === String(id))
        : null;

    if (id && !product) return;

    mpEditingId = id;
    mpForm.reset();

    document.getElementById("mpModalTitle").textContent =
        product ? "Edit Product" : "Add Product";

    document.getElementById("mpModalSubtitle").textContent =
        product ? "Update Market Price Benchmark" : "New Market Price Benchmark";

    document.getElementById("mpSave").textContent =
        product ? "Save Changes" : "Save Product";

    document.getElementById("mpProductName").value =
        product?.product_name || "";

    document.getElementById("mpCategory").value =
        product?.category || "";

    document.getElementById("mpPricingType").value =
        product?.pricing_type || "fixed_size";

    document.getElementById("mpSize").value =
        product?.size || "";

    document.getElementById("mpMinPrice").value =
        product?.min_price ?? "";

    document.getElementById("mpMaxPrice").value =
        product?.max_price ?? "";

    mpUpdateFormFields();

    mpModal.style.display = "flex";
    document.getElementById("mpProductName").focus();
}

function mpCloseModal() {
    if (mpBusy) return;

    mpEditingId = null;
    mpModal.style.display = "none";
    mpForm.reset();
}

function mpReadForm() {
    if (!mpForm.reportValidity()) return null;

    const name = document.getElementById("mpProductName").value.trim();
    const category = document.getElementById("mpCategory").value.trim();
    const type = document.getElementById("mpPricingType").value;
    const size = document.getElementById("mpSize").value.trim();
    const minText = document.getElementById("mpMinPrice").value.trim();
    const maxText = document.getElementById("mpMaxPrice").value.trim();

    if (!name) throw Error("Product name is required.");

    if (!["per_kg", "fixed_size"].includes(type)) {
        throw Error("Invalid pricing type.");
    }

    if (maxText === "") {
        throw Error("Maximum price is required.");
    }

    const max = Number(maxText);

    if (
        !Number.isFinite(max) ||
        max < 0 ||
        Math.abs(max * 100 - Math.round(max * 100)) > 0.000001
    ) {
        throw Error("Enter a valid maximum price with up to 2 decimal places.");
    }

    let min = null;
    let finalSize = null;

    if (type === "fixed_size") {
        if (!size) throw Error("Size is required for Fixed Size products.");
        if (minText === "") throw Error("Minimum price is required.");

        min = Number(minText);
        finalSize = size;

        if (
            !Number.isFinite(min) ||
            min < 0 ||
            Math.abs(min * 100 - Math.round(min * 100)) > 0.000001
        ) {
            throw Error("Enter a valid minimum price with up to 2 decimal places.");
        }

        if (min > max) {
            throw Error("Minimum price cannot exceed maximum price.");
        }
    }

    const duplicate = marketPriceData.find(item => {
        if (String(item.id) === String(mpEditingId)) return false;

        return (
            mpNormalize(item.product_name) === mpNormalize(name) &&
            item.pricing_type === type &&
            mpNormalize(item.category) === mpNormalize(category) &&
            (
                type === "per_kg" ||
                mpNormalize(item.size) === mpNormalize(finalSize)
            )
        );
    });

    if (duplicate) {
        throw Error("This product benchmark already exists.");
    }

    return {
        product_name: name,
        category: category || null,
        pricing_type: type,
        size: finalSize,
        min_price: min,
        max_price: max
    };
}

async function mpWriteAudit(action, description) {
    if (!mpAdmin) return;

    const { error } = await db.from("audit_logs").insert({
        user_id: mpAdmin.user.id,
        user: mpAdmin.profile.email || "Admin",
        action,
        module: "Market Price",
        description
    });

    if (error) {
        console.error("Market Price audit:", error.message);
    }
}

async function mpSave(event) {
    event.preventDefault();

    if (mpBusy) return;

    let values;

    try {
        values = mpReadForm();
        if (!values) return;
    } catch (error) {
        mpMessage(error.message, true);
        alert(error.message);
        return;
    }

    mpSetBusy(true);
    mpMessage("Saving...");

    try {
        await mpVerifyAdmin();

        const editing = mpEditingId !== null;

        const query = editing
            ? db.from("market_prices").update(values).eq("id", mpEditingId)
            : db.from("market_prices").insert(values);

        const { data, error } = await query.select("id").single();

        if (error) throw error;
        if (!data?.id) throw Error("No benchmark was saved.");

        await mpWriteAudit(
            editing ? "Update Market Price" : "Create Market Price",
            `${values.product_name} (${values.pricing_type}${values.size ? `, ${values.size}` : ""})`
        );

        mpBusy = false;
        mpCloseModal();

        await loadMarketPrices();

        mpMessage(
            editing
                ? "Benchmark updated successfully."
                : "Benchmark added successfully."
        );
    } catch (error) {
        console.error("Save benchmark:", error);
        mpMessage(error.message || "Unable to save benchmark.", true);
    } finally {
        mpSetBusy(false);
    }
}

async function mpDelete(id) {
    if (mpBusy) return;

    const product = marketPriceData.find(
        item => String(item.id) === String(id)
    );

    if (!product) return;

    const description = product.size
        ? `${product.product_name} (${product.size})`
        : product.product_name;

    if (!confirm(
        `Delete benchmark for ${description}?\n\nThis will remove its pricing reference.`
    )) {
        return;
    }

    mpSetBusy(true);
    mpMessage("Deleting...");

    try {
        await mpVerifyAdmin();

        const { data, error } = await db
            .from("market_prices")
            .delete()
            .eq("id", id)
            .select("id");

        if (error) throw error;
        if (!data?.length) throw Error("Benchmark was not deleted.");

        await mpWriteAudit("Delete Market Price", description);

        mpBusy = false;
        await loadMarketPrices();

        mpMessage("Benchmark deleted successfully.");
    } catch (error) {
        console.error("Delete benchmark:", error);
        mpMessage(error.message || "Unable to delete benchmark.", true);
    } finally {
        mpSetBusy(false);
    }
}

mpTable.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");

    if (!button || mpBusy) return;

    const { action, id } = button.dataset;

    if (action === "edit") mpOpenModal(id);
    if (action === "delete") mpDelete(id);
});

document.getElementById("mpCategoryTrigger").addEventListener("click", () => {
    mpToggleFilter("mpCategoryMenu", "mpCategoryTrigger");
});

document.getElementById("mpTypeTrigger").addEventListener("click", () => {
    mpToggleFilter("mpTypeMenu", "mpTypeTrigger");
});

document.addEventListener("click", event => {
    if (!event.target.closest(".mp-filter-header")) {
        mpCloseFilters();
    }
});

document.getElementById("mpAdd").addEventListener("click", () => mpOpenModal());
document.getElementById("mpRefresh").addEventListener("click", loadMarketPrices);
document.getElementById("mpPricingType").addEventListener("change", mpUpdateFormFields);
mpForm.addEventListener("submit", mpSave);

document.getElementById("mpSearch").addEventListener("input", () => {
    mpPage = 1;
    mpFilter();
});

document.getElementById("mpPrevious").addEventListener("click", () => {
    if (mpPage > 1) {
        mpPage--;
        mpRender();
    }
});

document.getElementById("mpNext").addEventListener("click", () => {
    if (mpPage * mpPageSize < mpFiltered.length) {
        mpPage++;
        mpRender();
    }
});

document.getElementById("mpModalClose").addEventListener("click", mpCloseModal);
document.getElementById("mpCancel").addEventListener("click", mpCloseModal);

mpModal.addEventListener("click", event => {
    if (event.target === mpModal) mpCloseModal();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        mpCloseFilters();

        if (mpModal.style.display === "flex") {
            mpCloseModal();
        }
    }
});

loadMarketPrices();
