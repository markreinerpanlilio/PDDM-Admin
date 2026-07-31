async function loadAuditLogs() {
    const body = document.getElementById("auditTableBody");

    body.innerHTML = "<tr><td colspan='5'>Loading...</td></tr>";

    const { data, error } = await db
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        body.innerHTML = "<tr><td colspan='5'>Failed to load logs.</td></tr>";
        console.error(error);
        return;
    }

    if (!data.length) {
        body.innerHTML = "<tr><td colspan='5'>No audit logs found.</td></tr>";
        return;
    }

    body.innerHTML = "";

    data.forEach(log => {
        body.innerHTML += `
            <tr>
                <td>${new Date(log.created_at).toLocaleString()}</td>
                <td>${log.user}</etd>
                <td>${log.action}</td>
                <td>${log.module}</td>
                <td>${log.description}</td>
            </tr>
        `;
    });
}
