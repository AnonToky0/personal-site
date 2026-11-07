// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://itworksforme.cn',
  integrations: [{
    name: 'development-preview',
    hooks: {
      'astro:config:setup': ({ command, injectRoute }) => {
        if (command === 'dev') injectRoute({ pattern: '/fox-preview', entrypoint: './src/dev/fox-preview.astro' });
      },
    },
  }],
  devToolbar: {
    enabled: false,
  },
});
