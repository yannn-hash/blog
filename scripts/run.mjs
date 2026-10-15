import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'node_modules', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node');
if (!existsSync(runtime)) {
  console.error('Runtime Node lokal belum tersedia. Jalankan npm ci (termasuk devDependencies dan install scripts).');
  process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
const programs = {
  astro: ['node_modules/astro/bin/astro.mjs', ...args],
  wrangler: ['node_modules/wrangler/bin/wrangler.js', ...args],
  'cms:local': ['scripts/cms-local.mjs', ...args],
  test: ['--test', '--test-concurrency=1', ...readdirSync(path.join(root, 'tests')).filter((file) => file.endsWith('.test.mjs')).map((file) => path.join('tests', file))],
};
if (!Object.hasOwn(programs, command)) {
  console.error('Perintah tidak dikenal. Gunakan astro, wrangler, cms:local, atau test.');
  process.exit(1);
}
const runtimeDir = path.dirname(runtime);
const child = spawn(runtime, programs[command], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ...(command === 'cms:local' ? { BIND_HOST: '127.0.0.1', PORT: '8081', ORIGIN: '', MODE: 'fs', GIT_REPO_DIRECTORY: root } : {}), ASTRO_TELEMETRY_DISABLED: '1', PATH: `${runtimeDir}${path.delimiter}${process.env.PATH ?? ''}` },
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
