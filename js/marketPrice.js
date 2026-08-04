const table = document.getElementById("marketPriceTable");

let selectedProduct = null;

async function loadMarketPrices() {

    table.innerHTML = "<tr><td colspan='6'>Loading...</td></tr>";

    // Existing pricing
    const { data: prices, error: priceError } = await db
        .from("market_prices")
        .select("*");

    if (priceError) {
        console.error(priceError);
        return;
    }

    // Products uploaded by sellers
    const { data: products, error: productError } = await db
        .from("products")
        .select("name, category, variant, unit");

    if (productError) {
        console.error(productError);
        return;
    }

    // Remove duplicate products
    const uniqueProducts = [];

    products.forEach(product => {

        const exists = uniqueProducts.find(p =>
            p.name === product.name &&
            (p.variant || "") === (product.variant || "")
        );

        if (!exists) {
            uniqueProducts.push(product);
        }

    });

    table.innerHTML = "";

    uniqueProducts
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach(product => {

            const existingPrice = prices.find(price =>
                price.product_name === product.name &&
                (price.variant || "") === (product.variant || "")
            );

            if (existingPrice) {

                table.innerHTML += `
                <tr>

                    <td>${existingPrice.product_name}</td>

                    <td>${existingPrice.variant || "-"}</td>

                    <td>${existingPrice.unit || "-"}</td>

                    <td>₱${Number(existingPrice.srp).toFixed(2)}</td>

                    <td>${
                        existingPrice.pricing_rule === "maximum_only"
                            ? "Maximum Only"
                            : "Min & Max"
                    }</td>

                    <td>

                        <button
                            class="approve-btn"
                            onclick="editMarketPrice('${existingPrice.id}')">

                            Edit

                        </button>

                    </td>

                </tr>
                `;

            } else {

                table.innerHTML += `
                <tr>

                    <td>${product.name}</td>

                    <td>${product.variant || "-"}</td>

                    <td>${product.unit || "-"}</td>

                    <td>-</td>

                    <td>-</td>

                    <td>

                        <button
                            class="approve-btn"
                            onclick="addPricing(
                                '${product.name}',
                                '${product.category}',
                                '${product.variant || ""}',
                                '${product.unit || ""}'
                            )">

                            Add Pricing

                        </button>

                    </td>

                </tr>
                `;

            }

        });

    if (!uniqueProducts.length) {
        table.innerHTML =
            "<tr><td colspan='6'>No products found.</td></tr>";
    }

}

function addPricing(name, category, variant, unit){

    selectedProduct = {
        name,
        category,
        variant,
        unit
    };

    document.getElementById("modalProduct").value = name;
    document.getElementById("modalVariant").value = variant || "-";
    document.getElementById("modalUnit").value = unit || "-";

    document.getElementById("modalRule").value = "maximum_only";
    document.getElementById("modalSRP").value = "";

    document.getElementById("pricingModal").style.display = "flex";

}

async function savePricing(){

    if(!selectedProduct){
        return;
    }

    const pricingRule =
        document.getElementById("modalRule").value;

    const srp =
        Number(document.getElementById("modalSRP").value);

    if(!srp){

        alert("Please enter the SRP.");

        return;

    }

    const { error } = await db
        .from("market_prices")
        .insert([

            {

                product_name: selectedProduct.name,

                category: selectedProduct.category,

                variant: selectedProduct.variant || null,

                unit: selectedProduct.unit || null,

                pricing_rule: pricingRule,

                srp: srp

            }

        ]);

    if(error){

        console.error(error);

        alert(error.message);

        return;

    }

    closeModal();

    loadMarketPrices();

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

function openAddModal(){

    alert("Add Product - Coming Soon");

}

function editMarketPrice(id){

    alert("Edit Product - Coming Soon");

}

document.addEventListener("DOMContentLoaded", loadMarketPrices);
