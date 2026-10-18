import type { APIRoute, GetStaticPaths } from 'astro';
import { docsPages, rawMarkdown } from './_pages';

// A raw .md twin of every page, for agents: /docs/start/install.md.
export const getStaticPaths = (async () => {
  const pages = await docsPages();
  return pages.map((page) => ({ params: { slug: page.id }, props: { page } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(rawMarkdown(props.page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
