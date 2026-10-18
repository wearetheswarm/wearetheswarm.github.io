import { getCollection, type CollectionEntry } from 'astro:content';

// Pages in sidebar order, for llms.txt and llms-full.txt.
const ORDER = [
  'index',
  'start/install',
  'start/first-run',
  'start/connect-your-agent',
  'agents/runner',
  'operate/upgrading',
  'operate/troubleshooting',
  'security/overview',
  'security/running-agents-safely',
];

export async function docsPages(): Promise<CollectionEntry<'docs'>[]> {
  const pages = await getCollection('docs');
  const rank = (id: string) => {
    const i = ORDER.indexOf(id);
    return i === -1 ? ORDER.length : i;
  };
  return pages.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

export function markdownPath(id: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${id}.md`;
}

// The raw Markdown of a page, with its title and summary as a header.
export function rawMarkdown(page: CollectionEntry<'docs'>): string {
  const { title, description } = page.data;
  const head = description ? `# ${title}\n\n> ${description}\n` : `# ${title}\n`;
  return `${head}\n${(page.body ?? '').trim()}\n`;
}
