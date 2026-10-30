const settingsStatus = document.getElementById("settingsStatus");
const restoreFile = document.getElementById("restoreFile");
const restorePreview = document.getElementById("restorePreview");

let pendingBackup = null;
let settingsBusy = false;

const BACKUP_TABLES = ["market_prices", "products", "audit_logs"];

function settingsMessage(message, error = false) {
    settingsStatus.textContent = message;
    settingsStatus.style.color = error ? "#ff4e54" : "";
}

function settingsSetBusy(value) {
    settingsBusy = value;

    [
        "backupButton",
        "chooseBackup",
        "confirmRestore",
        "cancelRestore"
    ].forEach(id => {
        document.getElementById(id).disabled = value;
    });
}

function settingsApplyPreferences() {
    const size = localStorage.getItem("ppdm_text_size") || "medium";
    const theme = localStorage.getItem("ppdm_theme") || "light";

    document.documentElement.dataset.ppdmTheme = theme;

    const scales = {
        small: "0.9",
        medium: "1",
        large: "1.15"
    };

    document.documentElement.style.setProperty(
        "--ppdm-font-scale",
        scales[size] || "1"
    );

    document.querySelectorAll("[data-size]").forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.size === size
        );
    });

    document.querySelectorAll("[data-theme]").forEach(button => {
        button.classList.toggle(
            "selected",
            button.dataset.theme === theme
        );
    });
}

document.querySelectorAll("[data-size]").forEach(button => {
    button.addEventListener("click", () => {
        localStorage.setItem("ppdm_text_size", button.dataset.size);
        settingsApplyPreferences();
    });
});

document.querySelectorAll("[data-theme]").forEach(button => {
    button.addEventListener("click", () => {
        localStorage.setItem("ppdm_theme", button.dataset.theme);
        settingsApplyPreferences();
    });
});

async function settingsVerifyAdmin() {
    const { data: { user }, error } = await db.auth.getUser();

    if (error || !user) {
        throw Error("Please Sign In.");
    }

    const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profileError || profile?.role?.toLowerCase() !== "admin") {
        throw Error("Admin Access Required.");
    }

    return user;
}

async function settingsDownloadBackup() {
    if (settingsBusy) return;

    settingsSetBusy(true);
    settingsMessage("Creating Backup...");

    try {
        await settingsVerifyAdmin();

        const { data, error } = await db.rpc("ppdm_export_records");

        if (error) throw error;
        if (!data || typeof data !== "object") {
            throw Error("Invalid Backup Response.");
        }

        const file = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );

        const url = URL.createObjectURL(file);

        const date = new Date().toISOString()
            .replace(/[:.]/g, "-");

        const link = document.createElement("a");
        link.href = url;
        link.download = `PPDM-Backup-${date}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        settingsMessage("Backup Downloaded Successfully.");
    } catch (error) {
        console.error("Backup Error:", error);
        settingsMessage(
            error.message || "Unable To Create Backup.",
            true
        );
    } finally {
        settingsSetBusy(false);
    }
}

function settingsValidateBackup(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw Error("Invalid Backup File.");
    }

    if (data.format !== "ppdm-records-v1") {
        throw Error("Unsupported Backup Format.");
    }

    if (!data.tables || typeof data.tables !== "object") {
        throw Error("Backup Tables Are Missing.");
    }

    for (const table of BACKUP_TABLES) {
        if (!Array.isArray(data.tables[table])) {
            throw Error(`Missing Or Invalid Table: ${table}`);
        }

        if (data.tables[table].length > 50000) {
            throw Error(`Too Many Records In ${table}.`);
        }
    }

    return data;
}

document.getElementById("chooseBackup")
    .addEventListener("click", () => {
        if (!settingsBusy) restoreFile.click();
    });

restoreFile.addEventListener("change", async () => {
    const file = restoreFile.files?.[0];

    pendingBackup = null;
    restorePreview.hidden = true;

    if (!file) return;

    try {
        if (file.size > 20 * 1024 * 1024) {
            throw Error("Backup File Exceeds The 20 MB Upload Limit.");
        }

        const contents = await file.text();
        const data = settingsValidateBackup(JSON.parse(contents));

        pendingBackup = data;

        const counts = BACKUP_TABLES.map(table => {
            return `<p><strong>${table.replaceAll("_", " ")}:</strong>
                ${data.tables[table].length} Records</p>`;
        });

        document.getElementById("restoreDetails").innerHTML = `
            <p><strong>File:</strong> ${settingsEscape(file.name)}</p>
            <p><strong>Created:</strong>
                ${settingsEscape(data.created_at || "Unknown")}</p>
            ${counts.join("")}
        `;

        restorePreview.hidden = false;
        settingsMessage("Review The Backup Before Restoring.");
    } catch (error) {
        settingsMessage(error.message, true);
        restoreFile.value = "";
    }
});

function settingsEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

document.getElementById("cancelRestore")
    .addEventListener("click", () => {
        pendingBackup = null;
        restoreFile.value = "";
        restorePreview.hidden = true;
        settingsMessage("");
    });

async function settingsRestoreBackup() {
    if (!pendingBackup || settingsBusy) return;

    const approved = confirm(
        "Restore Database Records?\n\n" +
        "Matching Records Will Be Updated And Missing Records Added.\n" +
        "This Cannot Be Automatically Undone.\n\n" +
        "Make Sure You Have Downloaded A Current Backup First."
    );

    if (!approved) return;

    settingsSetBusy(true);
    settingsMessage("Restoring Records...");

    try {
        await settingsVerifyAdmin();

        const { data, error } = await db.rpc(
            "ppdm_restore_records",
            { backup: pendingBackup }
        );

        if (error) throw error;

        if (data !== true) {
            throw Error("Restore Was Not Confirmed.");
        }

        pendingBackup = null;
        restoreFile.value = "";
        restorePreview.hidden = true;

        settingsMessage("Records Restored Successfully.");
    } catch (error) {
        console.error("Restore Error:", error);
        settingsMessage(
            error.message || "Restore Failed.",
            true
        );
    } finally {
        settingsSetBusy(false);
    }
}

document.getElementById("backupButton")
    .addEventListener("click", settingsDownloadBackup);

document.getElementById("confirmRestore")
    .addEventListener("click", settingsRestoreBackup);

document.getElementById("settingsMenu")
    .addEventListener("click", event => {
        event.stopPropagation();
        document.getElementById("sidebar")
            .classList.toggle("mobile-open");
    });

document.addEventListener("click", event => {
    const sidebar = document.getElementById("sidebar");
    const button = document.getElementById("settingsMenu");

    if (
        window.innerWidth <= 768 &&
        !sidebar.contains(event.target) &&
        event.target !== button
    ) {
        sidebar.classList.remove("mobile-open");
    }
});

settingsApplyPreferences();
