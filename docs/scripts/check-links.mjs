// Check every internal link of the built site: the page must exist, and so
// must the anchor. Run after `astro build`: node scripts/check-links.mjs
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const BASE = '/docs';

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return name.endsWith('.html') ? [path] : [];
  });
}

// The file a URL path serves, or null.
function target(path) {
  if (!path.startsWith(BASE)) return null;
  const rel = path.slice(BASE.length).replace(/^\//, '');
  for (const candidate of [rel, join(rel, 'index.html'), `${rel}.html`]) {
    const file = join(DIST, candidate);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

const ids = new Map();
function idsOf(file) {
  if (!ids.has(file)) {
    const html = readFileSync(file, 'utf8');
    ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
}

const errors = [];
let checked = 0;
for (const file of htmlFiles(DIST)) {
  // Pagefind's own UI and the 404 page link to nothing we own.
  if (file.includes('/pagefind/')) continue;
  const html = readFileSync(file, 'utf8');
  for (const [, raw] of html.matchAll(/<a\s[^>]*href="([^"]+)"/g)) {
    const href = raw.replace(/&amp;/g, '&');
    if (/^[a-z]+:/i.test(href) || href.startsWith('//')) continue;
    const [pathPart, anchor] = href.split('#');
    let dest = file;
    if (pathPart) {
      if (!pathPart.startsWith('/')) {
        errors.push(`${relative(DIST, file)}: relative link ${href}`);
        continue;
      }
      dest = target(decodeURIComponent(pathPart));
      if (!dest) {
        if (!pathPart.startsWith(BASE)) continue; // the landing page, outside /docs
        errors.push(`${relative(DIST, file)}: no page for ${href}`);
        continue;
      }
    }
    checked++;
    if (anchor && dest.endsWith('.html') && !idsOf(dest).has(decodeURIComponent(anchor))) {
      errors.push(`${relative(DIST, file)}: no anchor #${anchor} in ${relative(DIST, dest)}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} broken link(s)`);
  process.exit(1);
}
console.log(`links: ${checked} internal links OK`);
