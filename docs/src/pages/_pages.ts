import { getCollection, type CollectionEntry } from 'astro:content';
import wats from '../generated/wats.json';

// The wats release the reference pages come from (scripts/import-wats.mjs).
export const WATS = wats as { repo: string; ref: string; sha: string };

export const isReference = (id: string) => id.startsWith('reference/');

// Pages in sidebar order, for llms.txt and llms-full.txt.
const ORDER = [
  'index',
  'start/install',
  'start/first-run',
  'start/connect-your-agent',
  'concepts/how-it-works',
  'concepts/network',
  'agents/runner',
  'agents/share',
  'operate/upgrading',
  'operate/troubleshooting',
  'security/overview',
  'security/running-agents-safely',
];

export async function docsPages(): Promise<CollectionEntry<'docs'>[]> {
  const pages = await getCollection('docs');
  // The guides in sidebar order, then the reference pages, then the ADRs.
  const rank = (id: string) => {
    const i = ORDER.indexOf(id);
    if (i !== -1) return i;
    return id.startsWith('reference/adr') ? ORDER.length + 1 : ORDER.length;
  };
  return pages.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export function markdownPath(id: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${id}.md`;
}

// Inline SVG diagrams are for the HTML pages: in Markdown, keep only their
// caption (the page describes the same flows in words).
function withoutDiagrams(body: string): string {
  return body.replace(/<figure class="wats-diagram[^"]*"[\s\S]*?<figcaption[^>]*>([\s\S]*?)<\/figcaption>\s*<\/figure>/g,
    (_, caption: string) => `*Diagram: ${caption.replace(/<code>(.*?)<\/code>/g, '`$1`').trim()}*`);
}

// The raw Markdown of a page, with its title and summary as a header.
export function rawMarkdown(page: CollectionEntry<'docs'>): string {
  const { title, description } = page.data;
  const head = description ? `# ${title}\n\n> ${description}\n` : `# ${title}\n`;
  return `${head}\n${withoutDiagrams(page.body ?? '').trim()}\n`;
}
