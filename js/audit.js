import { supabase } from "./supabase.js";

async function loadAuditLogs() {
    const tbody = document.getElementById("auditTableBody");

    const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error(error);
        tbody.innerHTML = `
            <tr>
                <td colspan="5">Failed to load audit logs.</td>
            </tr>
        `;
        return;
    }

    if (!data.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">No audit logs found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = data.map(log => `
        <tr>
            <td>${new Date(log.created_at).toLocaleString()}</td>
            <td>${log.user}</td>
            <td>${log.action}</td>
            <td>${log.module}</td>
            <td>${log.description}</td>
        </tr>
    `).join("");
}

loadAuditLogs();
