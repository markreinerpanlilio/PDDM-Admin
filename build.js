
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });

fs.cpSync(root, dist, {
  recursive: true,
  filter: (source) => {
    const relative = path.relative(root, source);
    const first = relative.split(path.sep)[0];

    return !['.git', 'node_modules', 'dist'].includes(first)
      && !relative.startsWith('.env');
  }
});

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
