import { preview } from 'vite';

const server = await preview({
  configFile: false,
  preview: { host: process.env.ROYAL_PREDICTOR_HOST || '127.0.0.1', port: Number(process.env.ROYAL_PREDICTOR_PORT) || 4173 },
});
server.printUrls();
