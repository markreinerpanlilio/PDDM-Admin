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
        table.innerHTML =
            "<tr><td colspan='5'>Failed to load data.</td></tr>";
        return;
    }

    marketPriceData = data || [];

    console.log("Market price data:", marketPriceData);

    table.innerHTML = "";

    if (marketPriceData.length === 0) {
        table.innerHTML =
            "<tr><td colspan='5'>No products found.</td></tr>";
        return;
    }

    marketPriceData.forEach(product => {

        const isPerKg =
            product.pricing_type === "per_kg";

        const hasPricing = isPerKg
            ? product.max_price !== null
            : product.min_price !== null &&
              product.max_price !== null;

        let priceDisplay = "-";

        if (isPerKg && product.max_price !== null) {

            priceDisplay =
                `₱${Number(product.max_price).toFixed(2)}`;

        } else if (
            !isPerKg &&
            product.min_price !== null &&
            product.max_price !== null
        ) {

            priceDisplay =
                `₱${Number(product.min_price).toFixed(2)} - ₱${Number(product.max_price).toFixed(2)}`;
        }

        table.innerHTML += `
            <tr>

                <td>
                    ${product.product_name || "-"}
                </td>

                <td>
                    ${isPerKg ? "Per kg" : "Fixed Size"}
                </td>

                <td>
                    ${isPerKg ? "—" : (product.size || "-")}
                </td>

                <td>
                    ${priceDisplay}
                </td>

                <td>

                    <button
                        class="approve-btn"
                        onclick="openPricingModal('${product.id}')">

                        ${hasPricing
                            ? "Edit"
                            : "Add pricing"}

                    </button>

                </td>

            </tr>
        `;
    });
}


function searchMarketPrice() {

    const value = document
        .getElementById("searchPrice")
        .value
        .toLowerCase();

    table.querySelectorAll("tr").forEach(row => {

        row.style.display =
            row.innerText.toLowerCase().includes(value)
                ? ""
                : "none";

    });
}


/* =========================================================
   ADD PRODUCT
========================================================= */

function openAddModal() {

    const oldModal =
        document.getElementById("pricingModal");

    if (oldModal) {
        oldModal.remove();
    }

    const modal =
        document.createElement("div");

    modal.id = "pricingModal";

    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background = "rgba(0, 0, 0, 0.45)";
    modal.style.display = "flex";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.style.zIndex = "9999";

    modal.innerHTML = `
        <div style="
            background:white;
            width:460px;
            max-width:90%;
            padding:28px;
            border-radius:10px;
            box-shadow:0 5px 20px rgba(0,0,0,0.3);
        ">

            <h2 style="margin-top:0;">
                Add Product
            </h2>

            <label>Product Name</label>

            <div style="
                position:relative;
                margin:8px 0 15px;
            ">

                <input
                    type="text"
                    id="modalProductName"
                    placeholder="Enter product name"
                    autocomplete="off"
                    oninput="showProductSuggestions()"
                    onfocus="showProductSuggestions()"
                    style="
                        width:100%;
                        padding:10px;
                        box-sizing:border-box;
                    "
                >

                <div
                    id="productSuggestions"
                    style="
                        display:none;
                        position:absolute;
                        top:100%;
                        left:0;
                        width:100%;
                        background:white;
                        border:1px solid #ccc;
                        border-radius:0 0 6px 6px;
                        max-height:180px;
                        overflow-y:auto;
                        z-index:10001;
                        box-sizing:border-box;
                    "
                ></div>

            </div>

            <label>Type</label>

            <select
                id="modalPricingType"
                onchange="updatePricingFields()"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

                <option value="per_kg">
                    Per kg
                </option>

                <option value="fixed_size" selected>
                    Fixed Size
                </option>

            </select>

            <div id="pricingFields"></div>

            <div style="
                display:flex;
                justify-content:flex-end;
                gap:10px;
                margin-top:20px;
            ">

                <button
                    onclick="closePricingModal()"
                    style="
                        padding:8px 15px;
                        cursor:pointer;
                    "
                >
                    Cancel
                </button>

                <button
                    onclick="saveNewProduct()"
                    style="
                        padding:8px 15px;
                        cursor:pointer;
                    "
                >
                    Save
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    updatePricingFields();
}


/* =========================================================
   FIXED SIZE PRODUCT SUGGESTIONS
========================================================= */

function getFixedSizeProductNames() {

    const names = [];

    marketPriceData.forEach(product => {

        if (
            product.pricing_type === "fixed_size" &&
            product.product_name
        ) {

            const name =
                product.product_name.trim();

            const exists =
                names.some(
                    item =>
                        item.toLowerCase() ===
                        name.toLowerCase()
                );

            if (!exists) {
                names.push(name);
            }
        }
    });

    return names.sort(
        (a, b) =>
            a.localeCompare(b)
    );
}


function showProductSuggestions() {

    const input =
        document.getElementById(
            "modalProductName"
        );

    const suggestions =
        document.getElementById(
            "productSuggestions"
        );

    if (!input || !suggestions) {
        return;
    }

    const value =
        input.value.trim().toLowerCase();

    const names =
        getFixedSizeProductNames();

    const filtered =
        names.filter(name =>
            name.toLowerCase().includes(value)
        );

    suggestions.innerHTML = "";

    if (filtered.length === 0) {

        suggestions.style.display =
            "none";

        return;
    }

    filtered.forEach(name => {

        const item =
            document.createElement("div");

        item.textContent = name;

        item.style.padding = "10px";
        item.style.cursor = "pointer";
        item.style.borderBottom =
            "1px solid #eee";

        item.onmouseover = () => {
            item.style.background =
                "#f2f2f2";
        };

        item.onmouseout = () => {
            item.style.background =
                "white";
        };

        item.onclick = () => {

            input.value = name;

            suggestions.style.display =
                "none";
        };

        suggestions.appendChild(item);
    });

    suggestions.style.display =
        "block";
}


/* =========================================================
   EDIT EXISTING PRODUCT
========================================================= */

function openPricingModal(id) {

    const product =
        marketPriceData.find(
            item => item.id === id
        );

    if (!product) {
        console.error(
            "Product not found:",
            id
        );
        return;
    }

    console.log(
        "Selected product:",
        product
    );

    const oldModal =
        document.getElementById(
            "pricingModal"
        );

    if (oldModal) {
        oldModal.remove();
    }

    const modal =
        document.createElement("div");

    modal.id = "pricingModal";

    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background =
        "rgba(0, 0, 0, 0.45)";
    modal.style.display = "flex";
    modal.style.justifyContent =
        "center";
    modal.style.alignItems =
        "center";
    modal.style.zIndex = "9999";

    const isPerKg =
        product.pricing_type === "per_kg";

    modal.innerHTML = `
        <div style="
            background:white;
            width:460px;
            max-width:90%;
            padding:28px;
            border-radius:10px;
            box-shadow:0 5px 20px rgba(0,0,0,0.3);
        ">

            <h2 style="margin-top:0;">
                ${product.max_price !== null ||
                  product.min_price !== null
                    ? "Edit Product Price"
                    : "Set Product Price"}
            </h2>

            <label>Product Name</label>

            <input
                type="text"
                id="modalProductName"
                value="${product.product_name || ""}"
                placeholder="Enter product name"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

            <label>Type</label>

            <select
                id="modalPricingType"
                onchange="updatePricingFields()"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

                <option
                    value="per_kg"
                    ${isPerKg ? "selected" : ""}
                >
                    Per kg
                </option>

                <option
                    value="fixed_size"
                    ${!isPerKg ? "selected" : ""}
                >
                    Fixed Size
                </option>

            </select>

            <div id="pricingFields"></div>

            <div style="
                display:flex;
                justify-content:flex-end;
                gap:10px;
                margin-top:20px;
            ">

                <button
                    onclick="closePricingModal()"
                    style="
                        padding:8px 15px;
                        cursor:pointer;
                    "
                >
                    Cancel
                </button>

                <button
                    onclick="savePricing('${product.id}')"
                    style="
                        padding:8px 15px;
                        cursor:pointer;
                    "
                >
                    Save
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    updatePricingFields(
        product.size || "",
        product.min_price,
        product.max_price
    );
}


/* =========================================================
   PRICING FIELDS
========================================================= */

function updatePricingFields(
    currentSize = "",
    currentMinPrice = null,
    currentMaxPrice = null
) {

    const typeElement =
        document.getElementById(
            "modalPricingType"
        );

    const fields =
        document.getElementById(
            "pricingFields"
        );

    if (!typeElement || !fields) {
        return;
    }

    const isPerKg =
        typeElement.value === "per_kg";

    if (isPerKg) {

        fields.innerHTML = `

            <label>Size</label>

            <input
                type="text"
                value="--"
                disabled
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                    background:#eee;
                "
            >

            <label>Maximum Price</label>

            <input
                type="number"
                id="modalMaxPrice"
                value="${currentMaxPrice ?? ""}"
                placeholder="Enter maximum price"
                min="0"
                step="0.01"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

        `;

    } else {

        fields.innerHTML = `

            <label>Size</label>

            <input
                type="text"
                id="modalSize"
                value="${currentSize || ""}"
                placeholder="Example: 35g, 100ml, Small"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

            <label>Minimum Price</label>

            <input
                type="number"
                id="modalMinPrice"
                value="${currentMinPrice ?? ""}"
                placeholder="Enter minimum price"
                min="0"
                step="0.01"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

            <label>Maximum Price</label>

            <input
                type="number"
                id="modalMaxPrice"
                value="${currentMaxPrice ?? ""}"
                placeholder="Enter maximum price"
                min="0"
                step="0.01"
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

        `;
    }
}


/* =========================================================
   CLOSE MODAL
========================================================= */

function closePricingModal() {

    const modal =
        document.getElementById(
            "pricingModal"
        );

    if (modal) {
        modal.remove();
    }
}


/* =========================================================
   SAVE NEW PRODUCT
========================================================= */

async function saveNewProduct() {

    const productName =
        document
            .getElementById(
                "modalProductName"
            )
            .value
            .trim();

    const pricingType =
        document
            .getElementById(
                "modalPricingType"
            )
            .value;

    if (!productName) {

        alert(
            "Please enter the product name."
        );

        return;
    }


    /* ------------------------------
       PER KG
    ------------------------------ */

    if (pricingType === "per_kg") {

        const maxPrice =
            document
                .getElementById(
                    "modalMaxPrice"
                )
                .value;

        if (!maxPrice) {

            alert(
                "Please enter the maximum price."
            );

            return;
        }

        const normalizedName =
            productName
                .trim()
                .toLowerCase();

        const duplicate =
            marketPriceData.find(
                item =>
                    item.product_name &&
                    item.product_name
                        .trim()
                        .toLowerCase() ===
                        normalizedName
            );

        if (duplicate) {

            alert(
                `${productName} already exists in the pricing list.`
            );

            return;
        }

        const insertData = {

            product_name:
                productName,

            pricing_type:
                "per_kg",

            size:
                null,

            min_price:
                null,

            max_price:
                Number(maxPrice)
        };

        const { error } =
            await db
                .from("market_prices")
                .insert([insertData]);

        if (error) {

            console.error(error);

            alert(
                "Failed to add product: " +
                error.message
            );

            return;
        }

        alert(
            "Product added successfully."
        );

        closePricingModal();

        await loadMarketPrices();

        return;
    }


    /* ------------------------------
       FIXED SIZE
    ------------------------------ */

    const size =
        document
            .getElementById(
                "modalSize"
            )
            .value
            .trim();

    const minPrice =
        document
            .getElementById(
                "modalMinPrice"
            )
            .value;

    const maxPrice =
        document
            .getElementById(
                "modalMaxPrice"
            )
            .value;

    if (!size) {

        alert(
            "Please enter the product size."
        );

        return;
    }

    if (!minPrice || !maxPrice) {

        alert(
            "Please enter both minimum and maximum prices."
        );

        return;
    }

    if (
        Number(minPrice) >
        Number(maxPrice)
    ) {

        alert(
            "Minimum price cannot be higher than maximum price."
        );

        return;
    }


    const normalizedName =
        productName
            .trim()
            .toLowerCase();

    const normalizedSize =
        size
            .trim()
            .toLowerCase();


    const duplicate =
        marketPriceData.find(
            item =>
                item.product_name &&
                item.product_name
                    .trim()
                    .toLowerCase() ===
                    normalizedName &&

                item.size &&

                item.size
                    .trim()
                    .toLowerCase() ===
                    normalizedSize
        );


    if (duplicate) {

        alert(
            `${productName} with size ${size} already exists in the pricing list.`
        );

        return;
    }


    const insertData = {

        product_name:
            productName,

        pricing_type:
            "fixed_size",

        size:
            size,

        min_price:
            Number(minPrice),

        max_price:
            Number(maxPrice)
    };


    const { error } =
        await db
            .from("market_prices")
            .insert([insertData]);


    if (error) {

        console.error(error);

        alert(
            "Failed to add product: " +
            error.message
        );

        return;
    }


    alert(
        "Product added successfully."
    );

    closePricingModal();

    await loadMarketPrices();
}


/* =========================================================
   SAVE EXISTING PRODUCT
========================================================= */

async function savePricing(id) {

    const product =
        marketPriceData.find(
            item => item.id === id
        );

    if (!product) {

        alert(
            "Product not found."
        );

        return;
    }

    const productName =
        document
            .getElementById(
                "modalProductName"
            )
            .value
            .trim();

    const pricingType =
        document
            .getElementById(
                "modalPricingType"
            )
            .value;

    if (!productName) {

        alert(
            "Please enter the product name."
        );

        return;
    }


    /* ------------------------------
       PER KG
    ------------------------------ */

    if (pricingType === "per_kg") {

        const maxPrice =
            document
                .getElementById(
                    "modalMaxPrice"
                )
                .value;

        if (!maxPrice) {

            alert(
                "Please enter the maximum price."
            );

            return;
        }


        const normalizedName =
            productName
                .trim()
                .toLowerCase();


        const duplicate =
            marketPriceData.find(
                item =>
                    item.id !== id &&
                    item.product_name &&
                    item.product_name
                        .trim()
                        .toLowerCase() ===
                        normalizedName
            );


        if (duplicate) {

            alert(
                `${productName} already exists in the pricing list.`
            );

            return;
        }


        const updateData = {

            product_name:
                productName,

            pricing_type:
                "per_kg",

            size:
                null,

            min_price:
                null,

            max_price:
                Number(maxPrice)
        };


        const { error } =
            await db
                .from("market_prices")
                .update(updateData)
                .eq("id", id);


        if (error) {

            console.error(error);

            alert(
                "Failed to save pricing: " +
                error.message
            );

            return;
        }


        alert(
            "Pricing saved successfully."
        );

        closePricingModal();

        await loadMarketPrices();

        return;
    }


    /* ------------------------------
       FIXED SIZE
    ------------------------------ */

    const size =
        document
            .getElementById(
                "modalSize"
            )
            .value
            .trim();

    const minPrice =
        document
            .getElementById(
                "modalMinPrice"
            )
            .value;

    const maxPrice =
        document
            .getElementById(
                "modalMaxPrice"
            )
            .value;


    if (!size) {

        alert(
            "Please enter the product size."
        );

        return;
    }


    if (!minPrice || !maxPrice) {

        alert(
            "Please enter both minimum and maximum prices."
        );

        return;
    }


    if (
        Number(minPrice) >
        Number(maxPrice)
    ) {

        alert(
            "Minimum price cannot be higher than maximum price."
        );

        return;
    }


    const normalizedName =
        productName
            .trim()
            .toLowerCase();

    const normalizedSize =
        size
            .trim()
            .toLowerCase();


    const duplicate =
        marketPriceData.find(
            item =>
                item.id !== id &&
                item.product_name &&
                item.product_name
                    .trim()
                    .toLowerCase() ===
                    normalizedName &&

                item.size &&

                item.size
                    .trim()
                    .toLowerCase() ===
                    normalizedSize
        );


    if (duplicate) {

        alert(
            `${productName} with size ${size} already exists in the pricing list.`
        );

        return;
    }


    const updateData = {

        product_name:
            productName,

        pricing_type:
            "fixed_size",

        size:
            size,

        min_price:
            Number(minPrice),

        max_price:
            Number(maxPrice)
    };


    const { error } =
        await db
            .from("market_prices")
            .update(updateData)
            .eq("id", id);


    if (error) {

        console.error(error);

        alert(
            "Failed to save pricing: " +
            error.message
        );

        return;
    }


    alert(
        "Pricing saved successfully."
    );

    closePricingModal();

    await loadMarketPrices();
}


document.addEventListener(
    "DOMContentLoaded",
    loadMarketPrices
);
