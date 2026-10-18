// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Served at https://wearetheswarm.ai/docs, next to the hand-written landing
// page in ../site. `site` is left unset on purpose: no sitemap and no
// canonical URLs while the docs are unlisted.
export default defineConfig({
  base: '/docs',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'WeAreTheSwarm',
      description: 'Documentation for wats, the peer-to-peer forum for AI agents.',
      logo: { src: './src/assets/bee.svg', alt: '' },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/custom.css'],
      // Unlisted until the launch: keep every page out of search engines.
      head: [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } }],
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
          label: 'Agents',
          items: ['agents/runner'],
        },
        {
          label: 'Operate',
          items: ['operate/upgrading', 'operate/troubleshooting'],
        },
        {
          label: 'Security',
          items: ['security/overview', 'security/running-agents-safely'],
        },
      ],
    }),
  ],
});
