import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { articleFormat } from '../src/cms/content.mjs';

const runtime = path.resolve('node_modules/node/bin', process.platform === 'win32' ? 'node.exe' : 'node');
const endpoint = 'http://127.0.0.1:8081/api/v1';
const read = (file) => readFile(`dist/${file}`, 'utf8');
function build() {
  return new Promise((resolve, reject) => {
    const process = spawn(runtime, ['node_modules/astro/bin/astro.mjs', 'build'], { env: { ...globalThis.process.env, ASTRO_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    for (const stream of [process.stdout, process.stderr]) stream.on('data', (bytes) => { output = (output + bytes).slice(-16000); });
    process.on('error', reject);
    process.on('exit', (code) => code === 0 ? resolve() : reject(new Error(output)));
  });
}
async function api(action, params, origin = 'http://localhost:4321') {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ action, params }), signal: AbortSignal.timeout(5000) });
  return { response, value: await response.json() };
}

test('real loopback proxy CRUD yields buildable CMS Markdown; draft/future/current visibility and cleanup', { timeout: 180000 }, async () => {
  // Refuse to attach to an existing user's proxy.
  await assert.rejects(fetch(endpoint, { signal: AbortSignal.timeout(500) }));
  const prefix = `cms-test-${randomUUID().replaceAll('-', '')}`;
  const slugs = ['public', 'draft', 'future'].map((suffix) => `${prefix}-${suffix}`);
  const filenames = slugs.map((slug) => `src/content/blog/${slug}.md`);
  for (const filename of filenames) await assert.rejects(access(filename));
  const proxy = spawn(runtime, ['scripts/cms-local.mjs'], { env: { ...process.env, BIND_HOST: '0.0.0.0', ORIGIN: '*', MODE: 'git', GIT_REPO_DIRECTORY: 'does-not-exist' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [proxy.stdout, proxy.stderr]) stream.on('data', (bytes) => { output = (output + bytes).slice(-8000); });
  let touchedBuild = false;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (proxy.exitCode !== null) throw new Error(output);
      try {
        const result = await api('info');
        if (result.response.ok) { assert.equal(result.value.type, 'local_fs'); ready = true; break; }
      } catch {}
      await delay(100);
    }
    assert.ok(ready, output);
    assert.match(output, /listening on 127\.0\.0\.1:8081/);
    const deniedOrigin = await api('info', undefined, 'https://evil.example');
    assert.equal(deniedOrigin.response.headers.get('access-control-allow-origin'), null);
    assert.equal((await api('info')).response.headers.get('access-control-allow-origin'), 'http://localhost:4321');
    assert.equal((await api('getEntry', { branch: 'main', path: '../escape.md' })).response.status, 422);
    const article = { title: 'Artikel CMS untuk pengujian', description: 'Ringkasan integrasi CMS', pubDate: '2020-01-01', tags: ['cms-test'], draft: false, example: false, body: 'Konten CMS **berhasil**.\n' };
    for (let index = 0; index < filenames.length; index++) {
      const data = { ...article, filename: slugs[index], draft: index === 1, pubDate: index === 2 ? '2999-01-01' : article.pubDate };
      const raw = articleFormat.toFile(data);
      const persisted = await api('persistEntry', { branch: 'main', entry: { path: filenames[index], slug: slugs[index], raw }, assets: [], options: { commitMessage: 'Fixture CMS lokal', useWorkflow: false, status: 'draft' } });
      assert.equal(persisted.response.status, 200, JSON.stringify(persisted.value));
      assert.equal(await readFile(filenames[index], 'utf8'), raw);
    }
    const existing = await api('getEntry', { branch: 'main', path: filenames[0] });
    assert.equal(existing.value.file.path, filenames[0]);
    const edited = { ...articleFormat.fromFile(existing.value.data), title: 'Judul diubah lewat CMS', pubDate: '2020-01-02' };
    assert.equal((await api('persistEntry', { branch: 'main', entry: { path: filenames[0], slug: slugs[0], raw: articleFormat.toFile(edited) }, assets: [], options: { commitMessage: 'Edit fixture', useWorkflow: false, status: 'draft' } })).response.status, 200);
    const listing = await api('entriesByFolder', { branch: 'main', folder: 'src/content/blog', extension: 'md', depth: 1 });
    for (const filename of filenames) assert.ok(listing.value.some((entry) => entry.file.path === filename));
    touchedBuild = true;
    await build();
    assert.match(await read(`blog/${slugs[0]}/index.html`), /Judul diubah lewat CMS/);
    for (const file of ['blog/index.html', 'cari/index.html', 'rss.xml', 'sitemap-0.xml', 'tag/cms-test/index.html']) {
      const text = await read(file);
      assert.ok(text.includes(slugs[0]), `${file} contains published CMS article`);
      for (const hidden of slugs.slice(1)) assert.ok(!text.includes(hidden), `${file} excludes hidden CMS article`);
    }
    assert.ok(!(await read('index.html')).includes(slugs[1]));
    assert.ok(!(await read('index.html')).includes(slugs[2]));
    for (const hidden of slugs.slice(1)) await assert.rejects(access(`dist/blog/${hidden}/index.html`));
    const admin = await read('admin/index.html');
    assert.match(admin, /noindex, nofollow/);
    assert.match(admin, /<noscript>/);
    assert.match(admin, /cms-help/);
    assert.ok(!(await read('sitemap-0.xml')).includes('/admin/'));
    for (const filename of filenames) assert.equal((await api('deleteFile', { branch: 'main', path: filename, options: { commitMessage: 'Hapus fixture' } })).response.status, 200);
    for (const filename of filenames) await assert.rejects(access(filename));
  } finally {
    proxy.kill();
    await Promise.race([new Promise((resolve) => proxy.once('exit', resolve)), delay(3000)]);
    for (const filename of filenames) await rm(filename, { force: true });
    if (touchedBuild) await build();
  }
});
