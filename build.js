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

        if (item.name === "build.js" || item.name.startsWith(".env")) {
            continue;
        }

        if (item.isDirectory()) {
            copyFiles(sourcePath, destinationPath);
        } else if (item.isFile()) {
            fs.copyFileSync(sourcePath, destinationPath);
        }
    }
}

function getHtmlFiles(directory) {
    const files = [];

    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, item.name);

        if (item.isDirectory()) {
            files.push(...getHtmlFiles(fullPath));
        } else if (
            item.isFile() &&
            item.name.toLowerCase().endsWith(".html")
        ) {
            files.push(fullPath);
        }
    }

    return files;
}

function relativeBrowserPath(fromDirectory, targetPath) {
    let relativePath = path.relative(fromDirectory, targetPath)
        .split(path.sep)
        .join("/");

    if (!relativePath.startsWith(".")) {
        relativePath = "./" + relativePath;
    }

    return relativePath;
}

function fixHtmlScriptLoading(htmlFile) {
    let html = fs.readFileSync(htmlFile, "utf8");
    const pageDirectory = path.dirname(htmlFile);

    const configPath = relativeBrowserPath(
        pageDirectory,
        path.join(dist, "config.js")
    );

    const clientPath = relativeBrowserPath(
        pageDirectory,
        path.join(dist, "js", "supabase.js")
    );

    // Remove existing Supabase and configuration script tags.
    html = html.replace(
        /<script\b[^>]*\bsrc=["'][^"']*config\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,
        ""
    );

    html = html.replace(
        /<script\b[^>]*\bsrc=["'][^"']*supabase\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>/gi,
        ""
    );

    html = html.replace(
        /<script\b[^>]*\bsrc=["'][^"']*supabase-js[^"']*["'][^>]*>\s*<\/script>/gi,
        ""
    );

    // Load the library, configuration, and client in the correct order.
    const sharedScripts = [
        '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
        `<script src="${configPath}"></script>`,
        `<script src="${clientPath}"></script>`
    ].join("\n    ");

    if (/<head\b[^>]*>/i.test(html)) {
        html = html.replace(
            /<head\b[^>]*>/i,
            (headTag) => `${headTag}\n    ${sharedScripts}`
        );
    } else {
        html = `${sharedScripts}\n${html}`;
    }

    fs.writeFileSync(htmlFile, html);
}

// Start with a clean production build.
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyFiles(root, dist);

// Generate the Supabase configuration from Render environment variables.
const config = [
    `window.SUPABASE_URL = ${JSON.stringify(supabaseUrl)};`,
    `window.SUPABASE_ANON_KEY = ${JSON.stringify(supabaseKey)};`
].join("\n") + "\n";

fs.writeFileSync(path.join(dist, "config.js"), config);

// Normalize Supabase script loading on every HTML page.
for (const htmlFile of getHtmlFiles(dist)) {
    fixHtmlScriptLoading(htmlFile);
}

console.log("Admin site built successfully.");
console.log("Supabase configuration generated.");
console.log("Supabase scripts loaded on all HTML pages.");
