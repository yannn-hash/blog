import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

test('Cloudflare runtime completes OAuth and rejects upstream redirects without following them', { timeout: 30000 }, async () => {
  const origin = 'https://smtmtc-blog.smtmtc.workers.dev';
  let redirectToken = false;
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'cms-runtime', modules: [
      { type: 'ESModule', path: path.resolve('workers/cms-auth.mjs') },
      { type: 'ESModule', path: path.resolve('workers/cms-deploy.mjs') },
    ],
    compatibilityDate: '2026-10-01', log: new Log(LogLevel.NONE), port: 0,
    bindings: { CMS_ORIGIN: origin, GITHUB_CLIENT_ID: 'fixture-client', GITHUB_CLIENT_SECRET: 'fixture-secret', CMS_SESSION_SECRET: 'fixture-session-secret-minimum-32-characters' },
    serviceBindings: { ASSETS: () => new Response('static') },
    outboundService(request) {
      const url = new URL(request.url);
      calls.push(url.pathname);
      assert.ok(['github.com', 'api.github.com'].includes(url.hostname));
      if (url.pathname.endsWith('/access_token') && redirectToken) return new Response(null, { status: 302, headers: { Location: 'https://untrusted.example/steal' } });
      const data = url.pathname.endsWith('/access_token') ? { access_token: 'gho_FIXTURE_ONLY', token_type: 'bearer', scope: 'public_repo' } : url.pathname.endsWith('/user') ? { login: 'yannn-hash' } : { full_name: 'yannn-hash/blog', permissions: { push: true } };
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    },
  }));
  try {
    for (const shouldRedirect of [false, true]) {
      redirectToken = shouldRedirect;
      calls.length = 0;
      const start = await mf.dispatchFetch(`${origin}/api/cms/auth?provider=github&site_id=smtmtc-blog.smtmtc.workers.dev`, { redirect: 'manual' });
      assert.equal(start.status, 302);
      const state = new URL(start.headers.get('location')).searchParams.get('state');
      const cookie = start.headers.get('set-cookie').split(';')[0];
      const response = await mf.dispatchFetch(`${origin}/api/cms/callback?code=fixture-code&iss=https%3A%2F%2Fgithub.com%2Flogin%2Foauth&state=${state}`, { headers: { Cookie: cookie } });
      const body = await response.text();
      assert.equal(response.status, shouldRedirect ? 400 : 200);
      assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
      if (shouldRedirect) {
        assert.deepEqual(calls, ['/login/oauth/access_token']);
        assert.match(body, /CMS_AUTH_TOKEN_REQUEST/);
        assert.ok(!body.includes('untrusted.example') && !body.includes('gho_FIXTURE_ONLY'));
      } else {
        assert.deepEqual(calls, ['/login/oauth/access_token', '/user', '/repos/yannn-hash/blog']);
        assert.match(body, /authorization:github:success:/);
      }
    }
  } finally { await mf.dispose(); }
});

test('Cloudflare runtime authorizes deploy, monitors main build without Origin GET, and keeps metadata private', { timeout: 30000 }, async () => {
  const origin = 'https://smtmtc-blog.smtmtc.workers.dev';
  const id = '12345678-1234-1234-1234-123456789012';
  let status = 'queued', outcome = null, triggered = false, hookMode = 'valid';
  const calls = [];
  const hookCalls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'cms-deploy-runtime', modules: [
      { type: 'ESModule', path: path.resolve('workers/cms-auth.mjs') },
      { type: 'ESModule', path: path.resolve('workers/cms-deploy.mjs') },
    ], compatibilityDate: '2026-10-01', log: new Log(LogLevel.NONE), port: 0,
    bindings: { CMS_ORIGIN: origin, CMS_DEPLOY_HOOK_URL: `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/${id}`, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_WORKER_TAG: 'b'.repeat(32), CLOUDFLARE_BUILDS_READ_TOKEN: 'cf_runtime_PRIVATE' },
    serviceBindings: { ASSETS: () => new Response('static') },
    outboundService(request) {
      const url = new URL(request.url); calls.push(url.pathname);
      assert.ok(['api.github.com', 'api.cloudflare.com'].includes(url.hostname));
      let data;
      if (url.pathname.endsWith('/user')) data = { login: 'yannn-hash' };
      else if (url.hostname === 'api.github.com') data = { full_name: 'yannn-hash/blog', permissions: { push: true } };
      else if (request.method === 'POST') { hookCalls.push('POST'); triggered = true; data = { success: true, result: { build_uuid: id, already_exists: false } }; }
      else if (url.pathname.includes('/deploy_hooks/')) {
        hookCalls.push('GET');
        assert.equal(url.pathname, `/client/v4/accounts/${'a'.repeat(32)}/builds/workers/smtmtc-blog/deploy_hooks/${id}`);
        assert.equal(request.headers.get('Authorization'), 'Bearer cf_runtime_PRIVATE');
        if (hookMode === 'unavailable') return new Response('{}', { status: 404 });
        data = { success: true, result: { branch: hookMode === 'invalid' ? 'preview' : 'main', external_script_id: 'b'.repeat(32), deploy_hook_uuid: id } };
      }
      else {
        const item = { build_uuid: id, status, build_outcome: outcome, created_on: '2026-10-15T08:00:00Z', trigger: { external_script_id: 'b'.repeat(32) }, build_trigger_metadata: { branch: 'main', environment_variables: { private: 'never-return' } } };
        data = { success: true, result: url.pathname.includes('/builds/builds/') ? item : triggered ? [item] : [] };
      }
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    },
  }));
  try {
    const headers = { Origin: origin, Authorization: 'Bearer gho_runtime' };
    for (const [mode, expectedStatus, expectedCode] of [['invalid', 503, 'CONFIG_MISSING'], ['unavailable', 502, 'MONITOR_UNAVAILABLE']]) {
      hookMode = mode; hookCalls.length = 0;
      const rejected = await mf.dispatchFetch(`${origin}/api/cms/deploy`, { method: 'POST', headers });
      assert.equal(rejected.status, expectedStatus);
      assert.equal((await rejected.json()).error.code, expectedCode);
      assert.deepEqual(hookCalls, ['GET']);
      assert.equal(triggered, false);
    }
    hookMode = 'valid'; hookCalls.length = 0;
    const start = await mf.dispatchFetch(`${origin}/api/cms/deploy`, { method: 'POST', headers });
    assert.equal(start.status, 202);
    assert.equal((await start.json()).build.id, id);
    assert.deepEqual(hookCalls, ['GET', 'POST']);
    for (const [nextStatus, nextOutcome, expected] of [['running', null, 'running'], ['stopped', 'success', 'success']]) {
      status = nextStatus; outcome = nextOutcome;
      const response = await mf.dispatchFetch(`${origin}/api/cms/deploy/status?id=${id}`, { headers: { Authorization: 'Bearer gho_runtime' } });
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.equal(JSON.parse(text).build.state, expected);
      assert.ok(!text.includes('never-return') && !text.includes('cf_runtime_PRIVATE'));
    }
    const denied = await mf.dispatchFetch(`${origin}/api/cms/deploy`, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } });
    assert.equal(denied.status, 403);
    assert.equal(hookCalls.filter((method) => method === 'POST').length, 1);
  } finally { await mf.dispose(); }
});
