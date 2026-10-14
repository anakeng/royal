import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

await build({
  configFile: false,
  plugins: [react()],
  build: { rollupOptions: { input: [resolve('index.html'), resolve('admin/index.html')] } },
});
