import type { APIRoute } from 'astro';
import { docsPages, rawMarkdown } from './_pages';

// The whole documentation as one Markdown file, in reading order.
export const GET: APIRoute = async () => {
  const pages = await docsPages();
  const body = pages.map(rawMarkdown).join('\n---\n\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
