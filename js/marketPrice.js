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

                const size = isPerKg
                    ? "Per kg"
                    : existingPrice.variant;
                
                const isPerKg =
                    ["Meat", "Fish", "Rice", "Vegetables"].includes(existingPrice.category);
                
                const price = isPerKg
                    ? `Max: ₱${Number(existingPrice.max_price).toFixed(2)}`
                    : `₱${Number(existingPrice.min_price).toFixed(2)} - ₱${Number(existingPrice.max_price).toFixed(2)}`;
                
                table.innerHTML += `
                <tr>
                
                    <td>${existingPrice.product_name}</td>
                
                    <td>${size}</td>
                
                    <td>${price}</td>
                
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

                    <td>${
                        ["Meat","Fish","Rice","Vegetables"].includes(product.category)
                            ? "Per kg"
                            : (product.variant || "-")
                    }</td>
                    
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

function addPricing(product){

    selectedProduct = product;

    document.getElementById("modalTitle").innerText =
        "Set Product Price";

    document.getElementById("modalProduct").value =
        product.product_name;

    document.getElementById("modalCategory").value =
        product.category;

    const isPerKg =
        ["Meat","Fish","Rice","Vegetables"]
            .includes(product.category);

    if(isPerKg){

        document.getElementById("packageSection").style.display="none";
        document.getElementById("minSection").style.display="none";

        document.getElementById("maxLabel").innerText =
            "Maximum Price Per Kg";

    }else{

        document.getElementById("packageSection").style.display="block";
        document.getElementById("minSection").style.display="block";

        document.getElementById("modalVariant").value =
            product.variant;

        document.getElementById("maxLabel").innerText =
            "Maximum Price";

    }

    document.getElementById("modalMinPrice").value="";
    document.getElementById("modalMaxPrice").value="";

    document.getElementById("pricingModal").style.display="flex";

}

async function savePricing(){

    const isPerKg =
        ["Meat","Fish","Rice","Vegetables"]
            .includes(selectedProduct.category);

    const payload={

        product_name:selectedProduct.product_name,

        category:selectedProduct.category,

        variant:isPerKg?null:selectedProduct.variant,

        min_price:isPerKg
            ? null
            : Number(document.getElementById("modalMinPrice").value),

        max_price:Number(document.getElementById("modalMaxPrice").value)

    };

    const {error}=await db
        .from("market_prices")
        .insert([payload]);

    if(error){

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
