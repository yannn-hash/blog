import test from 'node:test';
import assert from 'node:assert/strict';
import { contentActions, credentials, entryPath } from '../src/cms/actions.mjs';
import { createDeployController, deployClient } from '../src/cms/deploy.mjs';

const path = 'src/content/blog/first.md';
const sha = 'a'.repeat(40);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const raw = '---\ntitle: "Judul yang sama 日本語"\n---\nIsi';
const build = (state = 'queued', id = '12345678-1234-1234-1234-123456789012') => ({ id, state, branch: 'main', createdAt: '2026-10-15T08:00:00Z' });
function memory(initial) { const data = new Map(initial); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('credentials and route identity fail closed; duplicate titles keep distinct validated paths', () => {
  const storage = (user) => ({ getItem: () => user });
  for (const value of [null, '{', '{}', '{"backendName":"github","token":"bad token"}', '{"backendName":"unknown","token":"abc"}']) assert.equal(credentials(storage(value)), null);
  assert.deepEqual(credentials(storage('{"backendName":"proxy"}')), { backend: 'local' });
  assert.deepEqual(credentials(storage('{"backendName":"github","token":"gho_fixture"}')), { backend: 'github', token: 'gho_fixture' });
  const base = 'https://cms.example/admin/#/collections/blog';
  for (const [href, expected] of [['#/collections/blog/entries/first', path], ['#/collections/blog/entries/nested/second', 'src/content/blog/nested/second.md'], ['#/collections/blog/new', null], ['#/collections/blog/entries/%2e%2e%2fescape', null], ['https://evil.example/admin/#/collections/blog/entries/first', null], ['/other/#/collections/blog/entries/first', null]]) assert.equal(entryPath(href, base), expected);
  assert.throws(() => contentActions({ user: { backend: 'local' }, hostname: 'evil-localhost' }));
});

test('GitHub deletion captures exact title/path/SHA and sends only target file on main', async () => {
  const calls = [];
  const actions = contentActions({ user: { backend: 'github', token: 'gho_fixture' }, hostname: 'cms.example', fetcher: async (url, options) => {
    calls.push({ url, options });
    return options.method === 'DELETE' ? json({ content: null }) : json({ path: url.includes('second') ? 'src/content/blog/second.md' : path, sha, encoding: 'base64', content: Buffer.from(raw).toString('base64') });
  } });
  const first = await actions.load(path), second = await actions.load('src/content/blog/second.md');
  assert.equal(first.title, second.title);
  assert.notEqual(first.path, second.path);
  await actions.remove(second);
  assert.equal(calls[2].url, 'https://api.github.com/repos/yannn-hash/blog/contents/src/content/blog/second.md');
  assert.deepEqual(JSON.parse(calls[2].options.body), { message: 'Hapus artikel: src/content/blog/second.md', sha, branch: 'main' });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer gho_fixture');
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].url.endsWith('?ref=main'));
  assert.equal(calls.length, 3, 'no media actions');
});

test('GitHub stale SHA/404/network/invalid file reject safely; local API stays loopback', async () => {
  for (const response of [json({}, 409), json({}, 404), json({ path, sha: 'bad', content: 'x', encoding: 'base64' }), json({ path: 'src/content/blog/other.md', sha, content: Buffer.from(raw).toString('base64'), encoding: 'base64' })]) {
    const actions = contentActions({ user: { backend: 'github', token: 'fixture' }, fetcher: async () => response });
    await assert.rejects(actions.load(path));
  }
  const fail = contentActions({ user: { backend: 'github', token: 'fixture' }, fetcher: async () => { throw new Error('network unavailable'); } });
  await assert.rejects(fail.remove({ path, sha }));
  const calls = [];
  const local = contentActions({ user: { backend: 'local' }, hostname: 'localhost', fetcher: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return json({ file: { path }, data: raw });
  } });
  await local.remove(await local.load(path));
  assert.ok(calls.every((call) => call.url === 'http://127.0.0.1:8081/api/v1'));
  assert.deepEqual(calls.map((call) => call.body.action), ['getEntry', 'deleteFile']);
  assert.equal(calls[1].body.params.path, path);
  await assert.rejects(local.load('../escape.md'));
});

test('deploy controller blocks repeat clicks, polls at five seconds, retains last build on monitor error and resumes after reload', async () => {
  let starts = 0, statuses = 0, poll, interval;
  const queued = deferred();
  const storage = memory();
  const changes = [];
  const client = { start() { starts++; return queued.promise; }, async status() { statuses++; if (statuses === 1) return { build: null }; throw new Error('network'); } };
  const options = { client, storage, onChange: (state) => changes.push(state), schedule: (fn, ms) => { poll = fn; interval = ms; return 1; }, cancel() {} };
  const controller = createDeployController(options);
  await controller.check();
  const first = controller.start();
  await controller.start(); assert.equal(starts, 1);
  queued.resolve({ build: build() }); await first;
  assert.equal(interval, 5000);
  await poll();
  assert.equal(controller.getState().build.state, 'queued');
  assert.match(controller.getState().error, /Pemantauan/);
  assert.equal(changes.at(-1).disabled, true);
  controller.stop();
  const resumed = createDeployController({ ...options, client: { async status(id) { assert.equal(id, build().id); return { build: build('success') }; }, start() { assert.fail('no repeat POST after reload'); } } });
  await resumed.check();
  assert.equal(resumed.getState().build.state, 'success');
  resumed.stop();
});

test('uncertain POST is persisted before sending, never retried and recoverable by monitoring', async () => {
  let starts = 0, statusCount = 0;
  const storage = memory();
  const client = { async status() { statusCount++; return { build: statusCount === 1 ? null : build('running') }; }, async start() { starts++; throw new Error('connection lost'); } };
  const options = { client, storage, onChange() {}, schedule() {}, cancel() {} };
  const controller = createDeployController(options);
  await controller.check(); await controller.start(); await controller.start();
  assert.equal(starts, 1);
  assert.equal(controller.getState().uncertain, true);
  controller.stop();
  const resumed = createDeployController(options);
  assert.equal(resumed.getState().uncertain, true);
  await resumed.check();
  assert.equal(resumed.getState().uncertain, false);
  assert.equal(resumed.getState().build.state, 'running');
  assert.equal(starts, 1);
  resumed.stop();
});

test('deploy client rejects invalid statuses and classifies only known pre-trigger errors as safe', async () => {
  for (const [response, uncertain] of [[json({ build: { ...build(), state: 'invented' } }), true], [json({ error: { code: 'START_UNCERTAIN', message: 'Unknown' } }, 502), true], [json({ error: { code: 'CONFIG_MISSING', message: 'Configure' } }, 503), false], [new Response('invalid JSON'), true]]) {
    const client = deployClient({ token: 'fixture', fetcher: async (_url, options) => { assert.equal(options.headers.Authorization, 'Bearer fixture'); return response; } });
    await assert.rejects(client.start(), (error) => error.uncertain === uncertain);
  }
});

test('an old terminal build cannot resolve an uncertain POST with no earlier build, including after reload', async () => {
  const storage = memory();
  let calls = 0;
  const options = { storage, onChange() {}, schedule() {}, cancel() {}, client: { async status() { calls++; return { build: calls === 1 ? null : build('success') }; }, async start() { throw new Error('unknown'); } } };
  const controller = createDeployController(options);
  await controller.check(); await controller.start(); await controller.check();
  assert.equal(controller.getState().uncertain, true);
  controller.stop();
  const resumed = createDeployController(options);
  await resumed.check();
  assert.equal(resumed.getState().uncertain, true);
  resumed.stop();
});
