
const tbody = document.getElementById("requestTable");
const pending = document.getElementById("pendingCount");
const permitModal = document.getElementById("permitModal");
const BUCKET_NAME = "seller-application-documents";

let requests = [];

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
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
        .select("id,full_name,email,phone_number,created_at,stall_number,business_permit_path")
        .eq("seller_application", "pending")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error loading applications:", error);
        pending.textContent = "Unable to load applications";

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="request-empty-message">
                    Failed to load applications. Please refresh the page.
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
                    ${user.created_at
                        ? escapeHTML(new Date(user.created_at).toLocaleDateString())
                        : "-"}
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
                        data-id="${escapeHTML(user.id)}"
                        ${user.business_permit_path ? "" : "disabled"}
                        title="${user.business_permit_path
                            ? "View permit photo"
                            : "No permit photo uploaded"}">
                        View permit
                    </button>

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

    if (!button || button.disabled) return;

    const { action, id } = button.dataset;

    if (action === "view") viewPermit(id);
    if (action === "approve") approveSeller(id);
    if (action === "reject") rejectSeller(id);
});

async function viewPermit(id) {
    const seller = requests.find(user => user.id === id);

    if (!seller || !seller.business_permit_path) {
        alert("No permit photo was uploaded for this application.");
        return;
    }

    const image = document.getElementById("permitImage");
    const info = document.getElementById("permitApplicantInfo");
    const loading = document.getElementById("permitLoading");

    info.textContent =
        `${seller.full_name || "Applicant"} · Requested stall: ${seller.stall_number ?? "Not specified"}`;

    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    image.style.display = "none";

    loading.style.display = "block";
    loading.textContent = "Loading permit photo...";
    permitModal.style.display = "flex";

    try {
        const { data, error } = await db.storage
            .from(BUCKET_NAME)
            .createSignedUrl(seller.business_permit_path, 300);

        if (error) throw error;

        if (!data?.signedUrl) {
            throw new Error("Supabase did not return a signed URL.");
        }

        image.onload = () => {
            image.style.display = "block";
            loading.style.display = "none";
        };

        image.onerror = () => {
            image.style.display = "none";
            loading.style.display = "block";
            loading.textContent =
                "Unable to display the image. Check the saved file path and file format.";
        };

        image.src = data.signedUrl;

    } catch (error) {
        console.error("Error loading permit photo:", error);
        closePermitModal();

        alert(
            "Unable to access the permit photo.\n\n" +
            "Check the Storage bucket name, saved file path, admin login, " +
            "and Supabase Storage policies."
        );
    }
}

function closePermitModal() {
    permitModal.style.display = "none";

    const image = document.getElementById("permitImage");
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    image.style.display = "none";

    const loading = document.getElementById("permitLoading");

    if (loading) {
        loading.style.display = "block";
        loading.textContent = "Loading permit photo...";
    }
}

permitModal.addEventListener("click", event => {
    if (event.target === permitModal) {
        closePermitModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closePermitModal();
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

        if (error || !admin) {
            console.error("Unable to load admin profile:", error);
            return;
        }

        if (admin.role !== "admin") {
            console.error("The logged-in profile is not an admin.");
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
        "Please confirm that the requested stall is available."
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
    closePermitModal();
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
    closePermitModal();
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
