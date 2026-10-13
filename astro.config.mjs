// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hamzakababji.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'always' },
});
