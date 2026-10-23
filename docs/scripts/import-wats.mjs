// Import the reference pages of wats into the docs, from its latest release
// tag, so that they match the released binary.
//
//   node scripts/import-wats.mjs              the latest release
//   WATS_REF=v0.3.0 node scripts/…            a given tag (or branch, to test)
//   WATS_SRC=../../wats node scripts/…        a local checkout instead of GitHub
//   node scripts/import-wats.mjs --if-missing skip when already imported (dev)
//
// It writes the pages to src/content/docs/reference/ and a manifest to
// src/generated/wats.json; both are generated, not committed. A token in
// GITHUB_TOKEN or GH_TOKEN, when set, is sent to api.github.com only.
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';

const REPO = 'wearetheswarm/wats';
const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'src/content/docs/reference');
const MANIFEST = join(ROOT, 'src/generated/wats.json');

// Imported pages: wats path → site slug under /docs/. `optional` pages are
// skipped when the release does not have them yet.
const PAGES = [
  { src: 'docs/config.md', slug: 'reference/config', label: 'Configuration',
    edit: 'crates/wats/src/settings.rs',
    note: 'Generated from the key list in crates/wats/src/settings.rs: edit it there.' },
  { src: 'docs/cli.md', slug: 'reference/cli', label: 'Command line', optional: true },
  { src: 'docs/docker.md', slug: 'reference/docker', label: 'Docker' },
  { src: 'docs/opencode.md', slug: 'reference/opencode', label: 'OpenCode', optional: true },
  { src: 'docs/openclaw.md', slug: 'reference/openclaw', label: 'OpenClaw' },
  { src: 'docs/vibe.md', slug: 'reference/vibe', label: 'Mistral Vibe', optional: true },
  { src: 'docs/network-halt.md', slug: 'reference/network-halt', label: 'Network halt' },
  { src: 'docs/release-signing.md', slug: 'reference/release-signing', label: 'Release signing' },
  { src: 'docs/threat-model.md', slug: 'reference/threat-model', label: 'Threat model' },
  { src: 'docs/security-and-compliance.md', slug: 'reference/security-and-compliance',
    label: 'Security and compliance', optional: true },
  { src: 'docs/deploy-relay.md', slug: 'reference/deploy-relay', label: 'Run your own relay',
    optional: true },
  { src: 'docs/fleet.md', slug: 'reference/fleet', label: 'Several nodes on one machine',
    optional: true },
  { src: 'docs/adr/README.md', slug: 'reference/adr', label: 'Design decisions (ADRs)' },
];

// wats docs the site covers with its own guides. A link to one of them goes
// to the guide; a link to an anchor in it goes to GitHub, since the guide's
// headings differ.
const SITE = {
  'docs/agent.md': '/docs/agents/runner/',
  'docs/claude-code.md': '/docs/start/connect-your-agent/',
  'docs/codex.md': '/docs/start/connect-your-agent/#codex',
};

const ifMissing = process.argv.includes('--if-missing');
if (ifMissing && existsSync(MANIFEST) && existsSync(OUT)) {
  const { ref } = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  console.log(`import-wats: already imported (${ref}); run \`npm run import\` to refresh`);
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
async function github(path) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${path}: HTTP ${res.status}`);
  return res.json();
}

// --- The source tree --------------------------------------------------------

let ref = process.env.WATS_REF || '';
let src = process.env.WATS_SRC || '';
let sha = '';
let tmp = '';

if (src) {
  ref ||= 'local';
} else {
  if (!ref) ref = (await github('releases/latest')).tag_name;
  sha = (await github(`commits/${encodeURIComponent(ref)}`)).sha;
  // The tarball of that commit: about 1 MB, no history.
  const res = await fetch(`https://codeload.github.com/${REPO}/tar.gz/${sha}`);
  if (!res.ok) throw new Error(`download ${ref}: HTTP ${res.status}`);
  tmp = mkdtempSync(join(tmpdir(), 'wats-docs-'));
  const tarball = join(tmp, 'wats.tar.gz');
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
  src = join(tmp, 'tree');
  mkdirSync(src);
  execFileSync('tar', ['-xzf', tarball, '-C', src, '--strip-components=1'], {
    stdio: 'inherit',
  });
}
const tag = ref;
console.log(`import-wats: ${REPO} ${tag}${sha ? ` (${sha.slice(0, 12)})` : ''}`);

// --- Pages ------------------------------------------------------------------

const adrs = readdirSync(join(src, 'docs/adr'))
  .filter((f) => /^\d{4}-.*\.md$/.test(f))
  .sort()
  .map((f) => ({ src: `docs/adr/${f}`, slug: `reference/adr/${f.replace(/\.md$/, '')}`, adr: true }));

const pages = [...PAGES, ...adrs].filter((p) => {
  if (existsSync(join(src, p.src))) return true;
  if (p.optional) {
    console.log(`import-wats: ${p.src} not in ${tag}, skipped`);
    return false;
  }
  throw new Error(`${p.src} is missing from ${tag}`);
});
const bySrc = new Map(pages.map((p) => [p.src, p]));

const blob = (path) => `https://github.com/${REPO}/blob/${tag}/${path}`;
const tree = (path) => `https://github.com/${REPO}/tree/${tag}/${path}`;

// A link in a wats doc → its address on the site, or on GitHub at the tag.
function rewrite(href, from) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return href;
  const [pathPart, anchor] = href.split('#');
  const isDir = pathPart.endsWith('/');
  const path = posix.normalize(posix.join(posix.dirname(from), pathPart)).replace(/\/$/, '');
  const hash = anchor ? `#${anchor}` : '';
  const page = bySrc.get(path);
  if (page) return `/docs/${page.slug}/${hash}`;
  if (SITE[path] && !anchor) return SITE[path];
  if (path.startsWith('..')) throw new Error(`${from}: link leaves the repository: ${href}`);
  return (isDir ? tree(path) : blob(path)) + hash;
}

function rewriteLinks(markdown, from) {
  // Leave fenced code blocks alone.
  return markdown
    .split(/(^```[\s\S]*?^```)/m)
    .map((part, i) => (i % 2 ? part : part.replace(/\]\(([^)\s]+)\)/g, (_, href) => `](${rewrite(href, from)})`)))
    .join('');
}

// The first paragraph of prose, as a one-line summary.
function summary(body) {
  for (const block of body.split(/\n\s*\n/)) {
    const text = block.trim();
    if (!text || /^(#|>|<!--|\||```|[-*] |\d+\. )/.test(text)) continue;
    const plain = text
      .replace(/\s+/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '');
    // The first sentence: up to a period followed by a new sentence.
    const sentence = plain.match(/^.*?\.(?=\s+[A-Z`(]|\s*$)/)?.[0] ?? plain;
    return sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence;
  }
  return '';
}

// An ADR: its status, then the first sentence of its context, or else
// what its status line adds.
function adrSummary(body) {
  const line = body.match(/^Status: (\w+)[^\n]*(?:\n(?!\n)[^\n]*)*/m);
  if (!line) return summary(body);
  const status = line[1];
  const context = body.split(/^## Context\s*$/m)[1];
  let text = context ? summary(context) : '';
  if (!text) {
    const rest = line[0].replace(/\s+/g, ' ').replace(/^Status: \w+ \([^)]*\)[.,]?\s*/, '');
    text = rest ? summary(rest.charAt(0).toUpperCase() + rest.slice(1)) : '';
  }
  return text ? `${status}. ${text}` : `${status}.`;
}

// The npm and PyPI wrappers (ADR 0035) are not published and their names
// are placeholders: leave out the "Via npx or uvx (once published)" parts
// of the guides (a section, a list item, or a paragraph with the code
// block and pointer after it). Remove this once the wrappers are out.
const UNPUBLISHED = /Via npx or uvx \(once published\)/;
const PLACEHOLDERS = /Via npx or uvx|@wearetheswarm\/wats|wearetheswarm-wats/;
function dropUnpublished(markdown, from) {
  const lines = markdown.split('\n');
  const out = [];
  let i = 0;
  const blank = (l) => l.trim() === '';
  const skipFence = () => {
    i++;
    while (i < lines.length && !lines[i].startsWith('```')) i++;
    i++;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const start = i;
      skipFence();
      out.push(...lines.slice(start, i));
      continue;
    }
    if (!UNPUBLISHED.test(line)) {
      out.push(line);
      i++;
      continue;
    }
    const heading = line.match(/^(#{2,6}) /);
    const item = line.match(/^(\s*)[-*] /);
    if (heading) {
      // Up to the next heading of the same level or higher.
      const level = heading[1].length;
      i++;
      while (i < lines.length) {
        if (lines[i].startsWith('```')) { skipFence(); continue; }
        const h = lines[i].match(/^(#{1,6}) /);
        if (h && h[1].length <= level) break;
        i++;
      }
    } else if (item) {
      // Up to the next item of the list, or its end.
      const indent = item[1].length;
      i++;
      while (i < lines.length && !blank(lines[i]) && lines[i].search(/\S/) > indent) i++;
    } else {
      // The paragraph, then a code block or pointer that belongs to it.
      while (i < lines.length && !blank(lines[i])) i++;
      for (;;) {
        let j = i;
        while (j < lines.length && blank(lines[j])) j++;
        if (j >= lines.length) { i = j; break; }
        if (lines[j].startsWith('```')) { i = j; skipFence(); continue; }
        let k = j;
        while (k < lines.length && !blank(lines[k])) k++;
        if (/via-npx-or-uvx-once-published/.test(lines.slice(j, k).join('\n'))) { i = k; continue; }
        break;
      }
      while (out.length && blank(out[out.length - 1])) out.pop();
      out.push('');
    }
  }
  const result = out.join('\n').replace(/\n{3,}/g, '\n\n');
  if (PLACEHOLDERS.test(result)) throw new Error(`${from}: npx/uvx text left after dropUnpublished`);
  return result;
}

const yaml = (s) => JSON.stringify(s); // JSON strings are valid YAML

rmSync(OUT, { recursive: true, force: true });
const written = [];
for (const page of pages) {
  const raw = readFileSync(join(src, page.src), 'utf8');
  const h1 = raw.match(/^# (.+)\n/m);
  if (!h1) throw new Error(`${page.src}: no title`);
  let title = h1[1].replace(/`/g, '').trim(); // titles are plain text
  let label = page.label;
  if (page.adr) {
    const [, num, name] = title.match(/^(\d{4})\.\s*(.+)$/) ?? [null, page.slug.slice(-4), title];
    title = `ADR ${num}: ${name}`;
    label = `${num} ${name}`;
  }
  let md = raw.slice(raw.indexOf(h1[0]) + h1[0].length);
  if (!page.adr) md = dropUnpublished(md, page.src);
  const body = rewriteLinks(md, page.src).trim();
  const source = blob(page.src);
  const edit = `https://github.com/${REPO}/edit/main/${page.edit ?? page.src}`;
  const banner =
    `From <a href="${source}">wats ${tag}</a>, the latest release. ` +
    (page.note ? `${page.note} ` : '') +
    'Fixes go to the wats repository and appear here with the next release.';
  const front = [
    '---',
    `title: ${yaml(title)}`,
    `description: ${yaml(page.adr ? adrSummary(body) : summary(body))}`,
    `editUrl: ${yaml(edit)}`,
    'banner:',
    `  content: ${yaml(banner)}`,
    'sidebar:',
    `  label: ${yaml(label)}`,
    '---',
    '',
  ].join('\n');
  const target = page.slug === 'reference/adr' ? join(OUT, 'adr/index.md') : `${join(OUT, page.slug.slice('reference/'.length))}.md`;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${front}\n${body}\n`);
  written.push({ slug: page.slug, label, adr: !!page.adr, src: page.src });
}

mkdirSync(dirname(MANIFEST), { recursive: true });
writeFileSync(MANIFEST, `${JSON.stringify({ repo: REPO, ref: tag, sha, pages: written }, null, 2)}\n`);
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log(`import-wats: ${written.length} pages from ${tag}`);
