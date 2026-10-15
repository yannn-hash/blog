import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../workers/cms-auth.mjs';
import { normalizeBuild } from '../workers/cms-deploy.mjs';

const origin = 'https://smtmtc-blog.smtmtc.workers.dev';
const id = '12345678-1234-1234-1234-123456789012';
const env = { CMS_ORIGIN: origin, CMS_DEPLOY_HOOK_URL: `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/${id}`, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_WORKER_TAG: 'b'.repeat(32), CLOUDFLARE_BUILDS_READ_TOKEN: 'cf_PRIVATE_FIXTURE' };
const build = (status = 'queued', build_outcome = null, branch = 'main') => ({ build_uuid: id, status, build_outcome, created_on: '2026-10-15T08:00:00Z', build_trigger_metadata: { branch, environment_variables: { NEVER_EXPOSE: 'sensitive' } } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function request(method = 'POST', suffix = '', headers = {}) { return new Request(`${origin}/api/cms/deploy${suffix}`, { method, headers: { Origin: origin, Authorization: 'Bearer gho_FIXTURE', ...headers } }); }
function mock(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    const step = url.endsWith('/user') ? 'user' : url.includes('api.github.com') ? 'repo' : options.method === 'POST' ? 'hook' : url.includes('/deploy_hooks/') ? 'hookInfo' : url.includes('/builds/builds/') ? 'tracked' : 'builds';
    const data = overrides[step] ?? { user: { login: 'yannn-hash' }, repo: { full_name: 'yannn-hash/blog', permissions: { push: true } }, builds: { success: true, result: [] }, tracked: { success: true, result: { ...build('stopped', 'success'), trigger: { external_script_id: env.CLOUDFLARE_WORKER_TAG } } }, hookInfo: { success: true, result: { branch: 'main', external_script_id: env.CLOUDFLARE_WORKER_TAG, deploy_hook_uuid: id } }, hook: { success: true, result: { build_uuid: id, already_exists: false } } }[step];
    if (data instanceof Error) throw data;
    return data instanceof Response ? data : json(data);
  };
  return { fetcher, calls };
}

test('deploy origin/method/token/config and exact GitHub account/repository/push fail closed', async () => {
  for (const req of [request('GET'), request('POST', '/status'), request('POST', '', { Origin: 'https://evil.example' }), request('POST', '', { Authorization: 'Bearer bad token' }), request('POST', '', { Authorization: '' }), new Request('https://evil.example/api/cms/deploy', { method: 'POST', headers: { Origin: origin } }), request('POST', '', { Origin: '' })]) {
    const response = await handleRequest(req, env, () => assert.fail('no upstream call'));
    assert.ok(response.status >= 400);
  }
  for (const [property, value] of [['CMS_DEPLOY_HOOK_URL', 'https://evil.example/steal'], ['CMS_DEPLOY_HOOK_URL', `${env.CMS_DEPLOY_HOOK_URL}?secret=1`], ['CLOUDFLARE_ACCOUNT_ID', 'worker-name'], ['CLOUDFLARE_WORKER_TAG', 'smtmtc-blog'], ['CLOUDFLARE_BUILDS_READ_TOKEN', '']]) {
    const response = await handleRequest(request(), { ...env, [property]: value }, () => assert.fail('no upstream call'));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /docs\/DEPLOY-CLOUDFLARE/);
  }
  for (const overrides of [{ user: { login: 'attacker' } }, { user: json({}, 401) }, { repo: { full_name: 'attacker/blog', permissions: { push: true } } }, { repo: { full_name: 'yannn-hash/blog', permissions: { push: false } } }, { repo: { full_name: 'yannn-hash/blog' } }]) {
    const upstream = mock(overrides);
    const response = await handleRequest(request(), env, upstream.fetcher);
    assert.ok([401, 403].includes(response.status));
    assert.ok(upstream.calls.every((call) => !call.url.includes('cloudflare.com')));
  }
});

test('main hook is pinned, active builds avoid triggers, and public output never leaks metadata or credentials', async () => {
  for (const active of [true, false]) {
    const upstream = mock({ builds: { success: true, result: [build(active ? 'running' : 'stopped', active ? null : 'success')] } });
    const response = await handleRequest(request(), env, upstream.fetcher);
    assert.equal(response.status, active ? 200 : 202);
    const text = await response.text();
    for (const value of ['NEVER_EXPOSE', 'sensitive', 'cf_PRIVATE_FIXTURE', 'gho_FIXTURE', 'deploy_hooks']) assert.ok(!text.includes(value));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.parse(text).existing, active);
    assert.equal(upstream.calls.filter((call) => call.options.method === 'POST').length, active ? 0 : 1);
    if (!active) {
      const hook = upstream.calls.at(-1);
      assert.equal(hook.url, env.CMS_DEPLOY_HOOK_URL);
      assert.equal(hook.options.headers, undefined, 'no GitHub or CI Read credential is forwarded to hook');
      const preflight = upstream.calls.at(-2);
      assert.equal(preflight.url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/builds/workers/smtmtc-blog/deploy_hooks/${id}`);
      assert.equal(preflight.options.method, 'GET');
      assert.equal(preflight.options.headers.Authorization, `Bearer ${env.CLOUDFLARE_BUILDS_READ_TOKEN}`);
    }
  }
  const upstream = mock({ builds: { success: true, result: [build('running', null, 'preview')] }, hook: { success: true, result: { build_uuid: id, already_exists: true } } });
  assert.equal((await (await handleRequest(request(), env, upstream.fetcher)).json()).existing, true);
});

test('missing or mismatched hook metadata and unavailable preflight reject before any POST', async () => {
  const valid = { branch: 'main', external_script_id: env.CLOUDFLARE_WORKER_TAG, deploy_hook_uuid: id };
  const invalid = [
    { success: false, result: valid }, { success: true },
    ...[{}, { ...valid, branch: 'preview' }, { ...valid, branch: undefined }, { ...valid, external_script_id: 'c'.repeat(32) }, { ...valid, external_script_id: undefined }, { ...valid, deploy_hook_uuid: '12345678-1234-1234-1234-123456789013' }, { ...valid, deploy_hook_uuid: undefined }].map((result) => ({ success: true, result })),
  ];
  for (const hookInfo of invalid) {
    const upstream = mock({ hookInfo });
    const response = await handleRequest(request(), env, upstream.fetcher);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'CONFIG_MISSING');
    assert.ok(!upstream.calls.some((call) => call.options.method === 'POST'));
  }
  for (const hookInfo of [json({}, 401), json({}, 404), new Error('private-upstream-error'), new Response('{invalid'), new Response(null, { status: 302, headers: { Location: 'https://evil.example' } })]) {
    const upstream = mock({ hookInfo });
    const response = await handleRequest(request(), env, upstream.fetcher);
    const text = await response.text();
    assert.equal(response.status, 502);
    assert.equal(JSON.parse(text).error.code, 'MONITOR_UNAVAILABLE');
    assert.ok(!text.includes('private-upstream-error') && !text.includes('evil.example'));
    assert.ok(!upstream.calls.some((call) => call.options.method === 'POST'));
  }
});

test('Cloudflare build state matrix and malformed build data fail safely', async () => {
  for (const [status, outcome, expected] of [['queued', null, 'queued'], ['initializing', null, 'running'], ['running', null, 'running'], ['stopped', 'success', 'success'], ['stopped', 'fail', 'failure'], ['stopped', 'cancelled', 'cancelled'], ['stopped', 'terminated', 'cancelled'], ['stopped', 'skipped', 'skipped']]) assert.equal(normalizeBuild(build(status, outcome)).state, expected);
  for (const value of [{ ...build(), build_uuid: 'bad' }, { ...build(), status: 'unknown' }, build('stopped', 'unknown'), { ...build(), created_on: 'bad' }, { ...build(), build_trigger_metadata: {} }]) assert.throws(() => normalizeBuild(value));
  for (const result of [{ success: true, result: [build('unknown')] }, { success: false, result: [] }, { success: true, result: {} }, { success: true, result: [{ ...build(), build_trigger_metadata: {} }] }]) {
    const upstream = mock({ builds: result });
    const response = await handleRequest(request('GET', '/status'), env, upstream.fetcher);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error.code, 'MONITOR_UNAVAILABLE');
  }
});

test('known build monitoring, no-build lag, redirects, bounded malformed data and uncertain POST never leak or retry', async () => {
  const upstream = mock({ builds: { success: true, result: [build('stopped', 'success')] } });
  assert.equal((await (await handleRequest(request('GET', `/status?id=${id}`), env, upstream.fetcher)).json()).build.state, 'success');
  const missing = mock({ tracked: json({}, 404) });
  assert.equal((await (await handleRequest(request('GET', `/status?id=${id}`), env, missing.fetcher)).json()).error.code, 'MONITOR_UNAVAILABLE');
  assert.equal((await handleRequest(request('GET', '/status?id=bad'), env, missing.fetcher)).status, 400);
  for (const override of [new Response(null, { status: 302, headers: { Location: 'https://evil.example/secret' } }), new Response('x'.repeat(65537)), new Response('{invalid'), new Error('private-secret')]) {
    const upstream = mock({ hook: override });
    const response = await handleRequest(request(), env, upstream.fetcher);
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.equal(JSON.parse(text).error.code, 'START_UNCERTAIN');
    assert.ok(!text.includes('private-secret') && !text.includes('evil.example'));
    assert.equal(upstream.calls.filter((call) => call.options.method === 'POST').length, 1);
  }
});

test('concurrent requests in one Worker isolate share a single trigger', async () => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const upstream = mock();
  let hooks = 0;
  const fetcher = async (url, options) => { if (options.method === 'POST') { hooks++; await waiting; } return upstream.fetcher(url, options); };
  const requests = [handleRequest(request(), env, fetcher), handleRequest(request(), env, fetcher)];
  await new Promise((resolve) => setTimeout(resolve, 10));
  release();
  const responses = await Promise.all(requests);
  assert.equal(hooks, 1);
  assert.ok(responses.every((response) => response.status === 202));
});

test('same-origin status GET without Origin works; cross-site GET and wrong hook branch fail closed', async () => {
  const upstream = mock();
  assert.equal((await handleRequest(new Request(`${origin}/api/cms/deploy/status`, { headers: { Authorization: 'Bearer fixture', 'Sec-Fetch-Site': 'same-origin' } }), env, upstream.fetcher)).status, 200);
  assert.equal((await handleRequest(request('GET', '/status', { 'Sec-Fetch-Site': 'cross-site' }), env, () => assert.fail('no upstream'))).status, 403);
  const wrong = mock({ hook: { success: true, result: { build_uuid: id, branch: 'preview' } } });
  assert.equal((await (await handleRequest(request(), env, wrong.fetcher)).json()).error.code, 'START_UNCERTAIN');
});

test('pagination finds active main behind preview builds; incomplete pagination never triggers', async () => {
  let pages = 0;
  const upstream = mock();
  const fetcher = async (url, options) => {
    if (url.includes('/builds?')) {
      pages++;
      assert.ok(url.includes('per_page=100'));
      return json({ success: true, result: [build('running', null, pages === 1 ? 'preview' : 'main')], result_info: { total_pages: 2 } });
    }
    return upstream.fetcher(url, options);
  };
  const response = await handleRequest(request(), env, fetcher);
  assert.equal((await response.json()).existing, true);
  assert.equal(pages, 2);
  assert.ok(!upstream.calls.some((call) => call.options.method === 'POST'));
  const incomplete = mock({ builds: { success: true, result: [], result_info: { total_pages: 11 } } });
  assert.equal((await (await handleRequest(request(), env, incomplete.fetcher)).json()).error.code, 'MONITOR_UNAVAILABLE');
  assert.ok(!incomplete.calls.some((call) => call.options.method === 'POST'));
});

test('large realistic CF metadata and more than ten history pages do not disable deploy', async () => {
  const upstream = mock();
  let pages = 0;
  const fetcher = async (url, options) => {
    if (!url.includes('/builds?')) return upstream.fetcher(url, options);
    pages++;
    const item = build('stopped', 'success');
    item.build_trigger_metadata.environment_variables = { large: 'x'.repeat(70000) };
    return json({ success: true, result: [item], result_info: { total_pages: 11 } });
  };
  assert.equal((await handleRequest(request(), env, fetcher)).status, 202);
  assert.equal(pages, 11);
});

test('direct tracked polling validates Worker tag, main branch and ID; misconfigured hook worker is uncertain', async () => {
  for (const result of [{ ...build(), trigger: { external_script_id: 'c'.repeat(32) } }, { ...build('running', null, 'preview'), trigger: { external_script_id: env.CLOUDFLARE_WORKER_TAG } }, { ...build(), build_uuid: '12345678-1234-1234-1234-123456789013', trigger: { external_script_id: env.CLOUDFLARE_WORKER_TAG } }]) {
    const upstream = mock({ tracked: { success: true, result } });
    assert.equal((await handleRequest(request('GET', `/status?id=${id}`), env, upstream.fetcher)).status, 502);
    assert.ok(upstream.calls.every((call) => !call.url.includes('/builds?')));
  }
  const wrong = mock({ hook: { success: true, result: { build_uuid: id, branch: 'main', worker: 'another-worker' } } });
  assert.equal((await (await handleRequest(request(), env, wrong.fetcher)).json()).error.code, 'START_UNCERTAIN');
});
