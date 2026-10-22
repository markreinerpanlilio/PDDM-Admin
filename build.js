
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

function copyFiles(source, destination) {
  for (const item of fs.readdirSync(source, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(item.name)) continue;
    if (item.name.startsWith('.env')) continue;
    if (item.name === 'build.js') continue;

    const from = path.join(source, item.name);
    const to = path.join(destination, item.name);

    if (item.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyFiles(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

copyFiles(root, dist);

const url = process.env.spbs_url;
const key = process.env.spbs_key;

if (!url || !key) {
  throw new Error('Missing spbs_url or spbs_key environment variable.');
}

fs.writeFileSync(
  path.join(dist, 'config.js'),
  `window.SUPABASE_URL = ${JSON.stringify(url)};
window.SUPABASE_ANON_KEY = ${JSON.stringify(key)};`
);

console.log('Admin website built successfully.');
