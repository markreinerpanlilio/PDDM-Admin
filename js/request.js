const tbody = document.getElementById("requestTable");
const pending = document.getElementById("pendingCount");

async function loadRequests() {

    const { data, error } = await db
        .from("profiles")
        .select("id,full_name,email,phone_number,created_at")
        .eq("seller_application", "pending")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        return;
    }

    pending.textContent = `${data.length} Pending Application${data.length != 1 ? "s" : ""}`;

    tbody.innerHTML = "";

    data.forEach(user => {

        tbody.innerHTML += `
        <tr id="${user.id}">
            <td>${user.full_name}</td>
            <td>${user.email}</td>
            <td>${user.phone_number || "-"}</td>
            <td>${new Date(user.created_at).toLocaleDateString()}</td>

            <td class="action-buttons">

                <button class="approve-btn"
                    onclick="approveSeller('${user.id}')">

                    ✓

                </button>

                <button class="reject-btn"
                    onclick="rejectSeller('${user.id}')">

                    ✕

                </button>

            </td>

        </tr>`;
    });

}

async function approveSeller(id) {

    const { error } = await db
        .from("profiles")
        .update({
            role: "seller",
            seller_application: "approved"
        })
        .eq("id", id);

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById(id).remove();
    updatePending();

}

async function rejectSeller(id) {

    const { error } = await db
        .from("profiles")
        .update({
            seller_application: "rejected"
        })
        .eq("id", id);

    if (error) {
        alert(error.message);
        return;
    }

    document.getElementById(id).remove();
    updatePending();

}

function updatePending() {

    const rows = tbody.querySelectorAll("tr").length;

    pending.textContent =
        `${rows} Pending Application${rows != 1 ? "s" : ""}`;

}

function searchRequests() {

    const value = document
        .getElementById("searchRequest")
        .value
        .toLowerCase();

    tbody.querySelectorAll("tr").forEach(row => {

        row.style.display =
            row.innerText.toLowerCase().includes(value)
                ? ""
                : "none";

    });

}
