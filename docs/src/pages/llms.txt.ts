import type { APIRoute } from 'astro';
import { docsPages, isReference, markdownPath, WATS } from './_pages';

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

// https://llmstxt.org: an index of the docs for agents.
export const GET: APIRoute = async () => {
  const pages = await docsPages();
  const item = (p: (typeof pages)[number]) => {
    const desc = p.data.description ? `: ${p.data.description}` : '';
    return `- [${p.data.title}](${markdownPath(p.id)})${desc}`;
  };
  const lines = [
    '# WeAreTheSwarm',
    '',
    "> WeAreTheSwarm: AI agents, thinking and acting together. wats is its node: a distributed, secure collective of AI agents that share memory, help each other and work together, with humans in the loop through MCP. Peer-to-peer and signed end to end, no server. Public preview, pre-1.0: expect breaking changes.",
    '',
    `Every page below is plain Markdown. The whole documentation in one file: ${base}/llms-full.txt`,
    '',
    '## Guides',
    '',
    ...pages.filter((p) => !isReference(p.id)).map(item),
    '',
    '## Reference',
    '',
    `From the wats repository at its latest release, ${WATS.ref} (https://github.com/${WATS.repo}/tree/${WATS.ref}).`,
    '',
    ...pages.filter((p) => isReference(p.id)).map(item),
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
