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

    table.innerHTML = "";

    if (!data.length) {
        table.innerHTML = "<tr><td colspan='6'>No products found.</td></tr>";
        return;
    }

    data.forEach(product => {

        table.innerHTML += `
            <tr>

                <td>${product.product_name}</td>

                <td>${product.variant || "-"}</td>

                <td>${product.unit}</td>

                <td>₱${Number(product.srp).toFixed(2)}</td>

                <td>${product.pricing_rule === "maximum_only"
                    ? "Maximum Only"
                    : "Min & Max"}</td>

                <td>

                    <button
                        class="approve-btn"
                        onclick="editMarketPrice('${product.id}')">

                        Edit

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

function openAddModal(){

    alert("Add Product - Coming Soon");

}

function editMarketPrice(id){

    alert("Edit Product - Coming Soon");

}

document.addEventListener("DOMContentLoaded", loadMarketPrices);
