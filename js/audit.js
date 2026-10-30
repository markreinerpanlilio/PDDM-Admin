let auditTimeOrder = "desc";
let auditLoading = false;

function auditEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function auditFormatTime(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
}

function auditCapitalize(value) {
    const text = String(value ?? "").trim();

    if (!text) return "—";

    return text.replace(/\b[a-z]/g, character =>
        character.toUpperCase()
    );
}

function auditUpdateSortMenu() {
    document.querySelectorAll(".at-time-option").forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.order === auditTimeOrder
        );
    });
}

function auditCloseSortMenu() {
    document.getElementById("atTimeMenu").classList.remove("open");
    document.getElementById("atTimeTrigger")
        .setAttribute("aria-expanded", "false");
}

async function loadAuditLogs() {
    if (auditLoading) return;

    const body = document.getElementById("auditTableBody");
    const refresh = document.getElementById("atRefresh");

    auditLoading = true;
    refresh.disabled = true;

    body.innerHTML = `
        <tr>
            <td colspan="5" class="at-empty">Loading...</td>
        </tr>
    `;

    try {
        const logs = [];
        const pageSize = 1000;

        // Fetch all accessible logs in the selected time order.
        for (let start = 0; start < 100000; start += pageSize) {
            const { data, error } = await db
                .from("audit_logs")
                .select("id,user,action,module,description,created_at")
                .order("created_at", {
                    ascending: auditTimeOrder === "asc"
                })
                .order("id", {
                    ascending: auditTimeOrder === "asc"
                })
                .range(start, start + pageSize - 1);

            if (error) throw error;

            logs.push(...(data || []));

            if (!data || data.length < pageSize) break;
        }

        if (!logs.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="5" class="at-empty">
                        No Audit Logs Found.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = logs.map(log => `
            <tr>
                <td class="at-time-value">
                    ${auditEscape(auditFormatTime(log.created_at))}
                </td>
                <td>${auditEscape(auditCapitalize(log.user))}</td>
                <td>${auditEscape(auditCapitalize(log.action))}</td>
                <td>${auditEscape(auditCapitalize(log.module))}</td>
                <td>${auditEscape(auditCapitalize(log.description))}</td>
            </tr>
        `).join("");

    } catch (error) {
        console.error("Audit Trail:", error);

        body.innerHTML = `
            <tr>
                <td colspan="5" class="at-empty">
                    Failed To Load Logs.
                </td>
            </tr>
        `;
    } finally {
        auditLoading = false;
        refresh.disabled = false;
    }
}

// Open or close the Time header dropdown.
document.getElementById("atTimeTrigger")
    .addEventListener("click", event => {
        event.stopPropagation();

        const menu = document.getElementById("atTimeMenu");
        const isOpen = menu.classList.toggle("open");

        document.getElementById("atTimeTrigger")
            .setAttribute("aria-expanded", String(isOpen));
    });

// Change between ascending and descending time order.
document.querySelectorAll(".at-time-option").forEach(button => {
    button.addEventListener("click", () => {
        const nextOrder = button.dataset.order;

        if (!["asc", "desc"].includes(nextOrder)) return;

        auditTimeOrder = nextOrder;

        auditUpdateSortMenu();
        auditCloseSortMenu();
        loadAuditLogs();
    });
});

// Close the dropdown when clicking outside it.
document.addEventListener("click", event => {
    if (!event.target.closest(".at-time-header")) {
        auditCloseSortMenu();
    }
});

// Close the dropdown using Escape.
document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        auditCloseSortMenu();
    }
});

auditUpdateSortMenu();
loadAuditLogs();
