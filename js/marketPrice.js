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
        table.innerHTML =
            "<tr><td colspan='6'>Failed to load data.</td></tr>";
        return;
    }

    marketPriceData = data || [];

    console.log("Market price data:", marketPriceData);

    table.innerHTML = "";

    if (marketPriceData.length === 0) {
        table.innerHTML =
            "<tr><td colspan='6'>No products found.</td></tr>";
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
                    ${product.size || "-"}
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

    const isPerKg = product.pricing_type === "per_kg";

    const modal = document.createElement("div");

    modal.id = "pricingModal";

    modal.innerHTML = `
        <div class="modal-overlay">

            <div class="pricing-modal">

                <h2>Set Product Price</h2>

                <label>Product</label>

                <input
                    type="text"
                    id="modalProductName"
                    value="${product.product_name || ""}"
                >

                <label>Pricing Type</label>

                <select id="modalPricingType">

                    <option
                        value="per_kg"
                        ${isPerKg ? "selected" : ""}>
                        Per kg
                    </option>

                    <option
                        value="fixed_size"
                        ${!isPerKg ? "selected" : ""}>
                        Fixed Size
                    </option>

                </select>

                <label>Size</label>

                <input
                    type="text"
                    id="modalSize"
                    value="${product.size || ""}"
                    placeholder="Example: 35g, 250ml, Small"
                >

                <label>Minimum Price</label>

                <input
                    type="number"
                    id="modalMinPrice"
                    value="${product.min_price ?? ""}"
                    placeholder="Enter minimum price"
                >

                <label>Maximum Price</label>

                <input
                    type="number"
                    id="modalMaxPrice"
                    value="${product.max_price ?? ""}"
                    placeholder="Enter maximum price"
                >

                <div class="modal-buttons">

                    <button
                        class="approve-btn"
                        onclick="savePricing('${product.id}')">

                        Save

                    </button>

                    <button
                        class="reject-btn"
                        onclick="closePricingModal()">

                        Cancel

                    </button>

                </div>

            </div>

        </div>
    `;

    document.body.appendChild(modal);

    updatePricingFields();

    document
        .getElementById("modalPricingType")
        .addEventListener(
            "change",
            updatePricingFields
        );
}


function updatePricingFields() {

    const pricingType =
        document.getElementById("modalPricingType").value;

    const sizeInput =
        document.getElementById("modalSize");

    const minPriceInput =
        document.getElementById("modalMinPrice");

    if (pricingType === "per_kg") {

        sizeInput.value = "";
        sizeInput.disabled = true;

        minPriceInput.value = "";
        minPriceInput.disabled = true;

    } else {

        sizeInput.disabled = false;
        minPriceInput.disabled = false;

    }
}


async function savePricing(id) {

    const productName =
        document
            .getElementById("modalProductName")
            .value
            .trim();

    const pricingType =
        document
            .getElementById("modalPricingType")
            .value;

    const size =
        document
            .getElementById("modalSize")
            .value
            .trim();

    const minPriceValue =
        document
            .getElementById("modalMinPrice")
            .value;

    const maxPriceValue =
        document
            .getElementById("modalMaxPrice")
            .value;

    if (!productName) {
        alert("Please enter a product name.");
        return;
    }

    if (pricingType === "per_kg") {

        if (!maxPriceValue) {
            alert("Please enter the maximum price.");
            return;
        }

    } else {

        if (!size) {
            alert("Please enter the product size.");
            return;
        }

        if (!minPriceValue || !maxPriceValue) {
            alert("Please enter both minimum and maximum prices.");
            return;
        }

    }

    const minPrice =
        pricingType === "per_kg"
            ? null
            : Number(minPriceValue);

    const maxPrice =
        Number(maxPriceValue);

    if (
        pricingType === "fixed_size" &&
        minPrice > maxPrice
    ) {
        alert("Minimum price cannot be higher than maximum price.");
        return;
    }

    const { error } = await db
        .from("market_prices")
        .update({

            product_name: productName,

            pricing_type: pricingType,

            size:
                pricingType === "fixed_size"
                    ? size
                    : null,

            min_price: minPrice,

            max_price: maxPrice

        })
        .eq("id", id);

    if (error) {

        console.error(error);

        alert(
            "Failed to save pricing: " +
            error.message
        );

        return;
    }

    alert("Pricing saved successfully.");

    closePricingModal();

    await loadMarketPrices();
}


function closePricingModal() {

    const modal =
        document.getElementById("pricingModal");

    if (modal) {
        modal.remove();
    }

}


document.addEventListener(
    "DOMContentLoaded",
    loadMarketPrices
);
