let marketPriceData = [];

const table = document.getElementById("marketPriceTable");

async function loadMarketPrices() {
    table.innerHTML = "<tr><td colspan='6'>Loading...</td></tr>";

    const { data, error } = await db
        .from("market_prices")
        .select("*")
        .order("product_name", { ascending: true });

    if (error) {
        console.error(error);
        table.innerHTML = "<tr><td colspan='6'>Failed to load data.</td></tr>";
        return;
    }

    marketPriceData = data || [];

    console.log("Market price data:", marketPriceData);

    table.innerHTML = "";

    if (marketPriceData.length === 0) {
        table.innerHTML = "<tr><td colspan='6'>No products found.</td></tr>";
        return;
    }

    marketPriceData.forEach(product => {

        const isPerKg = product.pricing_type === "per_kg";

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

                <td>${product.product_name}</td>

                <td>
                    ${isPerKg ? "Per kg" : "Fixed Size"}
                </td>

                <td>
                    ${isPerKg ? "Per kg" : (product.size || "-")}
                </td>

                <td>
                    ${priceDisplay}
                </td>

                <td>
                    ${hasPricing ? "Priced" : "No Pricing"}
                </td>

                <td>

                    <button
                        class="approve-btn"
                        onclick="openPricingModal('${product.id}')">

                        ${hasPricing
                            ? "Edit Pricing"
                            : "Add Pricing"}

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


function openPricingModal(id) {

    const product = marketPriceData.find(
        item => item.id === id
    );

    if (!product) {
        console.error("Product not found:", id);
        return;
    }

    console.log("Selected product:", product);

    const isPerKg = product.pricing_type === "per_kg";

    const oldModal = document.getElementById("pricingModal");

    if (oldModal) {
        oldModal.remove();
    }

    const modal = document.createElement("div");

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
                ${product.max_price !== null || product.min_price !== null
                    ? "Edit Product Price"
                    : "Set Product Price"}
            </h2>

            <label>Product</label>

            <input
                type="text"
                value="${product.product_name || ""}"
                disabled
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

            <label>Type</label>

            <input
                type="text"
                value="${isPerKg ? "Per kg" : "Fixed Size"}"
                disabled
                style="
                    width:100%;
                    margin:8px 0 15px;
                    padding:10px;
                    box-sizing:border-box;
                "
            >

            ${
                isPerKg
                ? `
                    <label>Size</label>

                    <input
                        type="text"
                        value="Per kg"
                        disabled
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
                        value="${product.max_price ?? ""}"
                        placeholder="Enter maximum price"
                        min="0"
                        step="0.01"
                        style="
                            width:100%;
                            margin:8px 0 20px;
                            padding:10px;
                            box-sizing:border-box;
                        "
                    >
                `
                : `
                    <label>Size</label>

                    <input
                        type="text"
                        id="modalSize"
                        value="${product.size || ""}"
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
                        value="${product.min_price ?? ""}"
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
                        value="${product.max_price ?? ""}"
                        placeholder="Enter maximum price"
                        min="0"
                        step="0.01"
                        style="
                            width:100%;
                            margin:8px 0 20px;
                            padding:10px;
                            box-sizing:border-box;
                        "
                    >
                `
            }

            <div style="
                display:flex;
                justify-content:flex-end;
                gap:10px;
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
}


function closePricingModal() {

    const modal = document.getElementById("pricingModal");

    if (modal) {
        modal.remove();
    }
}


async function savePricing(id) {

    const product = marketPriceData.find(
        item => item.id === id
    );

    if (!product) {
        alert("Product not found.");
        return;
    }

    const isPerKg = product.pricing_type === "per_kg";

    let updateData = {};

    if (isPerKg) {

        const maxPrice =
            document.getElementById("modalMaxPrice").value;

        if (!maxPrice) {
            alert("Please enter the maximum price.");
            return;
        }

        updateData = {
            max_price: Number(maxPrice)
        };

    } else {

        const size =
            document.getElementById("modalSize").value.trim();

        const minPrice =
            document.getElementById("modalMinPrice").value;

        const maxPrice =
            document.getElementById("modalMaxPrice").value;

        if (!size) {
            alert("Please enter the product size.");
            return;
        }

        if (!minPrice || !maxPrice) {
            alert("Please enter both minimum and maximum prices.");
            return;
        }

        if (Number(minPrice) > Number(maxPrice)) {
            alert("Minimum price cannot be higher than maximum price.");
            return;
        }

        updateData = {
            size: size,
            min_price: Number(minPrice),
            max_price: Number(maxPrice)
        };
    }

    const { error } = await db
        .from("market_prices")
        .update(updateData)
        .eq("id", id);

    if (error) {
        console.error(error);
        alert("Failed to save pricing.");
        return;
    }

    alert("Pricing saved successfully.");

    closePricingModal();

    await loadMarketPrices();
}


function openAddModal() {

    alert("Add Product - Coming Soon");

}


function editMarketPrice(id) {

    openPricingModal(id);

}


document.addEventListener(
    "DOMContentLoaded",
    loadMarketPrices
);
