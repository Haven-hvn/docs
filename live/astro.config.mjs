import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://haven-hvn.github.io',
  base: '/docs/',
  integrations: [mdx(), react()],
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Newsreader',
      cssVariable: '--font-editorial',
      weights: ['400', '500', '600'],
      styles: ['normal', 'italic'],
      optimizedFallbacks: false,
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-institution',
      weights: ['400', '500', '600'],
      optimizedFallbacks: false,
    },
    {
      provider: fontProviders.google(),
      name: 'JetBrains Mono',
      cssVariable: '--font-ledger',
      weights: ['400', '500'],
      optimizedFallbacks: false,
    },
  ],
});
