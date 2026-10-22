const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

const supabaseUrl = process.env.spbs_url;
const supabaseKey = process.env.spbs_key;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        "Missing spbs_url or spbs_key environment variable in Render."
    );
}

function copyFiles(source, destination) {
    fs.mkdirSync(destination, { recursive: true });

    for (const item of fs.readdirSync(source, { withFileTypes: true })) {
        const sourcePath = path.join(source, item.name);
        const destinationPath = path.join(destination, item.name);

        if (
            item.isDirectory() &&
            [".git", "node_modules", "dist"].includes(item.name)
        ) {
            continue;
        }

        if (
            item.name === "build.js" ||
            item.name.startsWith(".env")
        ) {
            continue;
        }

        if (item.isDirectory()) {
            copyFiles(sourcePath, destinationPath);
        } else if (item.isFile()) {
            fs.copyFileSync(sourcePath, destinationPath);
        }
    }
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyFiles(root, dist);

const config = `
window.SUPABASE_URL = ${JSON.stringify(supabaseUrl)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseKey)};
`;

fs.writeFileSync(path.join(dist, "config.js"), config.trim() + "\n");

console.log("Admin site built successfully.");
console.log("Supabase config generated.");
