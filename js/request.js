const tbody = document.getElementById("requestTable");
const pending = document.getElementById("pendingCount");
const detailsModal = document.getElementById("sellerDetailsModal");
const BUCKET_NAME = "seller-application-documents";

let requests = [];
let selectedSellerId = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function displayValue(value) {
    if (value === null || value === undefined || value === "") {
        return "Not provided";
    }

    return String(value);
}

function formatDate(value) {
    if (!value) return "Not provided";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleString("en-PH", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

async function loadRequests() {
    pending.textContent = "Loading...";

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="request-empty-message">
                Loading applications...
            </td>
        </tr>`;

    const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("seller_application", "pending")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error loading seller applications:", error);
        pending.textContent = "Unable to load applications";

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="request-empty-message">
                    Failed to load applications. Check the browser console
                    and Supabase permissions.
                </td>
            </tr>`;
        return;
    }

    requests = data || [];
    renderRequests();
}

function renderRequests() {
    pending.textContent =
        `${requests.length} Pending Application${requests.length !== 1 ? "s" : ""}`;

    if (requests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="request-empty-message">
                    <div class="request-empty-state">
                        <span class="request-empty-icon">✓</span>
                        <strong>All caught up!</strong>
                        <span>There are no pending seller applications.</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = requests.map(user => `
        <tr id="request-${escapeHTML(user.id)}">
            <td>
                <div class="request-applicant">
                    <div class="request-avatar">
                        ${escapeHTML(
                            (user.full_name || user.email || "?")
                                .trim()
                                .charAt(0)
                                .toUpperCase()
                        )}
                    </div>

                    <div class="request-applicant-info">
                        <span class="request-applicant-name">
                            ${escapeHTML(user.full_name || "Unnamed Applicant")}
                        </span>
                        <span class="request-applicant-label">
                            Seller applicant
                        </span>
                    </div>
                </div>
            </td>

            <td>
                <span class="request-email">
                    ${escapeHTML(user.email || "-")}
                </span>
            </td>

            <td>${escapeHTML(user.phone_number || "-")}</td>

            <td>
                <span class="request-date">
                    ${escapeHTML(
                        user.created_at
                            ? new Date(user.created_at).toLocaleDateString()
                            : "-"
                    )}
                </span>
            </td>

            <td>
                <span class="request-stall-badge">
                    ${user.stall_number != null
                        ? `Stall ${escapeHTML(user.stall_number)}`
                        : "Not specified"}
                </span>
            </td>

            <td>
                <div class="request-actions">
                    <button
                        type="button"
                        class="request-view-btn"
                        data-action="view"
                        data-id="${escapeHTML(user.id)}">View</button>

                    <button
                        type="button"
                        class="request-action-btn request-approve-btn"
                        data-action="approve"
                        data-id="${escapeHTML(user.id)}"
                        title="Approve application"
                        aria-label="Approve application">✓</button>

                    <button
                        type="button"
                        class="request-action-btn request-reject-btn"
                        data-action="reject"
                        data-id="${escapeHTML(user.id)}"
                        title="Reject application"
                        aria-label="Reject application">✕</button>
                </div>
            </td>
        </tr>
    `).join("");

    searchRequests();
}

tbody.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "view") viewSellerDetails(id);
    if (action === "approve") approveSeller(id);
    if (action === "reject") rejectSeller(id);
});

function renderSellerDetails(seller) {
    const detailsContainer = document.getElementById("sellerProfileDetails");

    const fields = [
        ["Full Name", seller.full_name],
        ["Email", seller.email],
        ["Phone Number", seller.phone_number],
        [
            "Requested Stall",
            seller.stall_number != null
                ? `Stall ${seller.stall_number}`
                : "Not specified"
        ],
        ["Profile Created", formatDate(seller.created_at)]
    ];

    detailsContainer.innerHTML = fields.map(([label, value]) => `
        <div class="request-detail-item">
            <span class="request-detail-label">${escapeHTML(label)}</span>
            <span class="request-detail-value">${escapeHTML(displayValue(value))}</span>
        </div>
    `).join("");

    document.getElementById("sellerDetailsTitle").textContent =
        seller.full_name || "Seller Details";

    document.getElementById("sellerDetailsSubtitle").textContent =
        "Seller application details";
}

async function viewSellerDetails(id) {
    const seller = requests.find(user => user.id === id);

    if (!seller) {
        alert("This application could not be found. Refresh the page and try again.");
        return;
    }

    selectedSellerId = id;
    renderSellerDetails(seller);

    const permitArea = document.getElementById("permitArea");
    permitArea.replaceChildren();
    permitArea.textContent = "Loading permit photo...";

    detailsModal.style.display = "flex";

    document.getElementById("modalApproveBtn").onclick =
        () => approveSeller(id);

    document.getElementById("modalRejectBtn").onclick =
        () => rejectSeller(id);

    if (!seller.business_permit_path) {
        permitArea.textContent =
            "No permit photo was submitted with this application.";
        return;
    }

    try {
        const path = seller.business_permit_path.trim();

        const { data } = db.storage
            .from(BUCKET_NAME)
            .getPublicUrl(path);

        if (!data?.publicUrl) {
            throw new Error("Supabase did not return a public URL.");
        }

        const image = document.createElement("img");
        image.id = "permitImage";
        image.alt = "Seller's submitted business permit";
        image.style.display = "block";
        image.style.maxWidth = "100%";
        image.style.height = "auto";
        image.style.margin = "16px auto";
        image.style.borderRadius = "8px";

        image.onload = () => {
            permitArea.replaceChildren(image);
        };

        image.onerror = () => {
            permitArea.textContent =
                "Unable to display the permit photo. Check that the bucket is public and the file exists at the saved path.";
        };

        image.src = data.publicUrl;

    } catch (error) {
        console.error("Permit access error:", error);

        permitArea.textContent =
            "Unable to load the permit photo. Check the bucket settings and file path.";
    }
}

function closeSellerDetails() {
    detailsModal.style.display = "none";
    selectedSellerId = null;

    const permitArea = document.getElementById("permitArea");

    if (permitArea) {
        permitArea.replaceChildren();
        permitArea.textContent = "No permit photo loaded.";
    }
}

detailsModal.addEventListener("click", event => {
    if (event.target === detailsModal) {
        closeSellerDetails();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && detailsModal.style.display === "flex") {
        closeSellerDetails();
    }
});

async function addAuditLog(action, module, description) {
    try {
        const {
            data: { user },
            error: authError
        } = await db.auth.getUser();

        if (authError || !user) {
            console.error("Unable to identify admin:", authError);
            return;
        }

        const { data: admin, error } = await db
            .from("profiles")
            .select("id,email,role")
            .eq("id", user.id)
            .single();

        if (error || !admin || admin.role !== "admin") {
            console.error("Unable to verify admin profile:", error);
            return;
        }

        const { error: logError } = await db
            .from("audit_logs")
            .insert([{
                user_id: user.id,
                user: `${admin.email} (${admin.role})`,
                action,
                module,
                description
            }]);

        if (logError) {
            console.error("Audit log error:", logError);
        }
    } catch (error) {
        console.error("Audit log error:", error);
    }
}

async function approveSeller(id) {
    const seller = requests.find(user => user.id === id);
    if (!seller) return;

    const confirmed = confirm(
        `Approve ${seller.full_name || seller.email} as a seller?\n\n` +
        `Requested stall: ${seller.stall_number ?? "Not specified"}\n\n` +
        "Please verify that the requested stall is available."
    );

    if (!confirmed) return;

    const { data, error } = await db
        .from("profiles")
        .update({
            role: "seller",
            seller_application: "approved"
        })
        .eq("id", id)
        .eq("seller_application", "pending")
        .select("id");

    if (error) {
        alert("Failed to approve application: " + error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert("This application is no longer pending. Refreshing the list.");
        await loadRequests();
        return;
    }

    await addAuditLog(
        "Approve Seller",
        "Seller Requests",
        `${seller.email} was approved as a seller. Requested stall: ${seller.stall_number ?? "Not specified"}.`
    );

    requests = requests.filter(user => user.id !== id);
    renderRequests();
    closeSellerDetails();
}

async function rejectSeller(id) {
    const seller = requests.find(user => user.id === id);
    if (!seller) return;

    const confirmed = confirm(
        `Reject ${seller.full_name || seller.email}'s application?\n\n` +
        "The requested stall number will be reset to NULL."
    );

    if (!confirmed) return;

    const { data, error } = await db
        .from("profiles")
        .update({
            seller_application: "rejected",
            stall_number: null
        })
        .eq("id", id)
        .eq("seller_application", "pending")
        .select("id");

    if (error) {
        alert("Failed to reject application: " + error.message);
        return;
    }

    if (!data || data.length === 0) {
        alert("This application is no longer pending. Refreshing the list.");
        await loadRequests();
        return;
    }

    await addAuditLog(
        "Reject Seller",
        "Seller Requests",
        `${seller.email} was rejected. Requested stall number was cleared to NULL.`
    );

    requests = requests.filter(user => user.id !== id);
    renderRequests();
    closeSellerDetails();
}

function searchRequests() {
    const searchInput = document.getElementById("searchRequest");
    const value = searchInput.value.trim().toLowerCase();

    tbody.querySelectorAll("tr").forEach(row => {
        if (
            row.querySelector(".request-empty-state") ||
            row.querySelector(".request-empty-message")
        ) {
            row.style.display = "";
            return;
        }

        row.style.display =
            row.innerText.toLowerCase().includes(value) ? "" : "none";
    });
}

loadRequests();
