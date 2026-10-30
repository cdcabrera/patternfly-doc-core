// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

import cloudflare from '@astrojs/cloudflare';
import { apiIndexPregenerateIntegration } from './src/integrations/apiIndexPregenerateIntegration.ts';

// https://astro.build/config
export default defineConfig({
  integrations: [react(), mdx(), apiIndexPregenerateIntegration()],
  build: {
    concurrency: 1,
  },
  vite: {
    ssr: {
      noExternal: ["@patternfly/*", "react-dropzone"],
      external: ["fs", "node:fs", "node:path", "path", "fs/promises"]
    },
    server: {
      fs: {
        allow: ['./']
      }
    },
  },
  adapter: cloudflare({
    imageService: 'compile'
  })
});
