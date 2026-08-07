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
            : product.min_price !== null && product.max_price !== null;

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

    console.log("Selected product:", product);

}

document.addEventListener(
    "DOMContentLoaded",
    loadMarketPrices
);
