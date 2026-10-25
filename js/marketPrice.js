function populateSellerCategoryFilter() {
    const categoryFilter = document.getElementById("sellerCategoryFilter");

    if (!categoryFilter) return;

    const selectedCategory = categoryFilter.value;

    const categories = [
        ...new Set(
            sellerProductData
                .map(product => String(product.category || "").trim())
                .filter(category => category !== "")
        )
    ].sort((a, b) => a.localeCompare(b));

    categoryFilter.innerHTML = '<option value="">Category</option>';

    categories.forEach(category => {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });

    if (categories.includes(selectedCategory)) {
        categoryFilter.value = selectedCategory;
    }
}
