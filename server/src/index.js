import { createApp } from './app.js';
import { Store } from './store.js';

const port = Number(process.env.PORT) || 4000;
const store = new Store({ file: process.env.DATA_FILE || 'safepair-data.json' });
const { httpServer } = createApp({ store, corsOrigin: process.env.CORS_ORIGIN || '*' });

httpServer.listen(port, () => {
  console.log(`SafePair server listening on http://0.0.0.0:${port}`);
});

const shutdown = () => {
  store.flush();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
