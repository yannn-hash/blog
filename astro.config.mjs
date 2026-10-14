import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://smtmtc.com',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (url) => !url.endsWith('/404/') })],
});
