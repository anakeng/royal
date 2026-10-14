import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const watcher = await build({
  configFile: false,
  plugins: [react()],
  build: {
    watch: {},
    rollupOptions: { input: [resolve('index.html'), resolve('admin/index.html')] },
  },
});
await new Promise((resolve, reject) => {
  watcher.on('event', (event) => {
    if (event.code === 'END') resolve();
    if (event.code === 'ERROR') reject(event.error);
  });
});
const server = await preview({
  configFile: false,
  preview: { host: process.env.ROYAL_PREDICTOR_HOST || '127.0.0.1', port: Number(process.env.ROYAL_PREDICTOR_PORT) || 5173 },
});
server.printUrls();
console.log('Les modifications sont recompilées automatiquement ; actualise le navigateur pour les voir.');
