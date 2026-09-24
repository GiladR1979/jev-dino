import { fileURLToPath } from 'node:url';
import { readConfig } from './config.mjs';
import { JevClient } from './jev-client.mjs';
import { ArtifactStore } from './artifact-store.mjs';
import { createApp } from './app.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const { port, key } = await readConfig();
const store = new ArtifactStore(root);
await store.initialize();
const server = createApp({
  root,
  port,
  client: new JevClient(key),
  store,
  configured: Boolean(key),
});
server.listen(port, '127.0.0.1', () =>
  console.log(
    `JEV Dino: http://127.0.0.1:${port}${key ? '' : ' (API key not configured)'}`,
  ),
);
