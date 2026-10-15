import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// decap-server 3.11.5 delegates to this exact API in locked @decap/cli 0.1.2.
// Explicit options are applied AFTER dotenv, preventing inherited overrides.
const require = createRequire(import.meta.url);
const { runDevServer } = require('@decap/cli/dev');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await runDevServer({ host: '127.0.0.1', port: 8081, mode: 'fs', dir: root, origin: '' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
