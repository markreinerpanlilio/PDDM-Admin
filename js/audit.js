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

/*
 * Capitalize normal words while preserving:
 * - Email addresses
 * - URLs
 * - UUIDs
 *
 * Examples:
 * customer(sunny@gmail.com) -> Customer(sunny@gmail.com)
 * seller(john@gmail.com) -> Seller(john@gmail.com)
 * admin updated product -> Admin Updated Product
 */
function auditCapitalize(value) {
    const text = String(value ?? "").trim();

    if (!text) return "—";

    const protectedParts = [];

    const protectedText = text.replace(
        /https?:\/\/[^\s<>"']+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        match => {
            const index = protectedParts.push(match) - 1;
            return `\uE000${index}\uE001`;
        }
    );

    const capitalized = protectedText.replace(
        /\b[a-z]/g,
        character => character.toUpperCase()
    );

    return capitalized.replace(
        /\uE000(\d+)\uE001/g,
        (_, index) => protectedParts[Number(index)]
    );
}

function auditActionClass(value) {
    const action = String(value ?? "").toLowerCase();

    if (
        action.includes("create") ||
        action.includes("add") ||
        action.includes("approve")
    ) {
        return "create";
    }

    if (
        action.includes("delete") ||
        action.includes("remove") ||
        action.includes("reject")
    ) {
        return "delete";
    }

    if (
        action.includes("update") ||
        action.includes("edit") ||
        action.includes("change")
    ) {
        return "update";
    }

    return "other";
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

        body.innerHTML = logs.map(log => {
            const actionClass = auditActionClass(log.action);

            return `
                <tr>
                    <td class="at-time-value">
                        ${auditEscape(auditFormatTime(log.created_at))}
                    </td>

                    <td>
                        <span class="at-user">
                            ${auditEscape(auditCapitalize(log.user))}
                        </span>
                    </td>

                    <td>
                        <span class="at-action ${actionClass}">
                            ${auditEscape(auditCapitalize(log.action))}
                        </span>
                    </td>

                    <td>
                        <span class="at-module">
                            ${auditEscape(auditCapitalize(log.module))}
                        </span>
                    </td>

                    <td class="at-description">
                        ${auditEscape(auditCapitalize(log.description))}
                    </td>
                </tr>
            `;
        }).join("");

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

document.getElementById("atTimeTrigger")
    .addEventListener("click", event => {
        event.stopPropagation();

        const menu = document.getElementById("atTimeMenu");
        const isOpen = menu.classList.toggle("open");

        document.getElementById("atTimeTrigger")
            .setAttribute("aria-expanded", String(isOpen));
    });

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

document.addEventListener("click", event => {
    if (!event.target.closest(".at-time-header")) {
        auditCloseSortMenu();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        auditCloseSortMenu();
    }
});

auditUpdateSortMenu();
loadAuditLogs();
