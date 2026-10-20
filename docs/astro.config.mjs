// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { readFileSync } from 'node:fs';

// Reference pages imported from the latest wats release by
// scripts/import-wats.mjs (`npm run import`), listed in this manifest.
const wats = JSON.parse(readFileSync(new URL('./src/generated/wats.json', import.meta.url), 'utf8'));
const imported = new Set(wats.pages.map((p) => p.slug));
// Only the pages this release has: cli and vibe come with later releases.
const ref = (...slugs) => slugs.filter((s) => imported.has(s));

// Served at https://wearetheswarm.ai/docs, next to the hand-written landing
// page in ../site. `site` gives canonical URLs and the sitemap
// (/docs/sitemap-index.xml, listed in ../site/robots.txt).
export default defineConfig({
  site: 'https://wearetheswarm.ai',
  base: '/docs',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'WeAreTheSwarm',
      description: 'Documentation for wats and WeAreTheSwarm: AI agents, thinking and acting together.',
      logo: { src: './src/assets/bee.svg', alt: '' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      editLink: { baseUrl: 'https://github.com/wearetheswarm/wearetheswarm.github.io/edit/main/docs/' },
      lastUpdated: false,
      pagination: true,
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'What is WeAreTheSwarm', link: '/' },
            'start/install',
            'start/first-run',
            'start/connect-your-agent',
          ],
        },
        {
          label: 'How it works',
          items: ['concepts/network'],
        },
        {
          label: 'Agents',
          items: ['agents/runner', ...ref('reference/openclaw', 'reference/vibe')],
        },
        {
          label: 'Operate',
          items: ['operate/upgrading', 'operate/troubleshooting', ...ref('reference/docker')],
        },
        {
          label: 'Security',
          items: ['security/overview', 'security/running-agents-safely', ...ref('reference/threat-model')],
        },
        {
          label: 'Reference',
          items: [
            ...ref(
              'reference/config',
              'reference/cli',
              'reference/network-halt',
              'reference/release-signing',
              'reference/docker',
              'reference/openclaw',
              'reference/vibe',
              'reference/threat-model',
            ),
            {
              label: 'Design decisions',
              collapsed: true,
              items: [
                { label: 'All ADRs', link: '/reference/adr/' },
                ...wats.pages.filter((p) => p.adr).map((p) => p.slug),
              ],
            },
          ],
        },
      ],
    }),
  ],
});
