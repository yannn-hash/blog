import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import vm from 'node:vm';
import worker, { handleRequest } from '../workers/cms-auth.mjs';

const origin = 'https://smtmtc-blog.smtmtc.workers.dev';
const env = { CMS_ORIGIN: origin, GITHUB_CLIENT_ID: 'client', GITHUB_CLIENT_SECRET: 'secret', CMS_SESSION_SECRET: 'test-session-secret-with-at-least-32-characters', ASSETS: { fetch: async () => new Response('static') } };
const tokenValue = 'gho_TEST_PRIVATE_TOKEN';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
async function start() {
  const response = await handleRequest(new Request(`${origin}/api/cms/auth?provider=github&site_id=smtmtc-blog.smtmtc.workers.dev`), env);
  assert.equal(response.status, 302);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const authorize = new URL(response.headers.get('location'));
  return { cookie, authorize, state: authorize.searchParams.get('state') };
}
function callback(session, query = '', options = {}) {
  return new Request(`${origin}/api/cms/callback?code=test-code&state=${session.state}${query}`, { headers: { Cookie: session.cookie }, ...options });
}
function github(overrides = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const step = url.endsWith('access_token') ? 'token' : url.endsWith('/user') ? 'user' : 'repo';
    const defaults = { token: { access_token: tokenValue, token_type: 'bearer', scope: 'public_repo' }, user: { login: 'yannn-hash' }, repo: { full_name: 'yannn-hash/blog', permissions: { push: true } } };
    const result = overrides[step] ?? defaults[step];
    if (result instanceof Error) throw result;
    return result instanceof Response ? result : json(result);
  };
  return { fetcher, calls };
}
function signedCookie(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `__Host-smtmtc-cms=${payload}.${createHmac('sha256', env.CMS_SESSION_SECRET).update(payload).digest('base64url')}`;
}

test('OAuth start uses exact redirect, public_repo, signed host cookie and S256 PKCE', async () => {
  const { cookie, authorize, state } = await start();
  assert.equal(authorize.origin + authorize.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(authorize.searchParams.get('redirect_uri'), `${origin}/api/cms/callback`);
  assert.equal(authorize.searchParams.get('scope'), 'public_repo');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  const [payload, signature] = cookie.split('=')[1].split('.');
  assert.equal(signature, createHmac('sha256', env.CMS_SESSION_SECRET).update(payload).digest('base64url'));
  const data = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(data.state, state);
  assert.equal(authorize.searchParams.get('code_challenge'), createHash('sha256').update(data.verifier).digest('base64url'));
  assert.ok(data.exp > Date.now() && data.exp <= Date.now() + 600000);
  const response = await handleRequest(new Request(`${origin}/api/cms/auth?provider=github&site_id=smtmtc-blog.smtmtc.workers.dev`), env);
  assert.match(response.headers.get('set-cookie'), /Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
});

test('success verifies token, account and exact repository before popup handshake; context never replaces fetch', async () => {
  const session = await start(), mock = github();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fetcher;
  let response;
  try { response = await worker.fetch(callback(session), env, { waitUntil() {} }); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(response.status, 200);
  assert.equal(mock.calls.length, 3);
  const exchange = mock.calls[0];
  assert.equal(exchange.options.body.get('redirect_uri'), `${origin}/api/cms/callback`);
  assert.equal(exchange.options.body.get('client_secret'), env.GITHUB_CLIENT_SECRET);
  assert.match(exchange.options.body.get('code_verifier'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(mock.calls[2].url, 'https://api.github.com/repos/yannn-hash/blog');
  assert.equal(mock.calls[1].options.headers.Authorization, `Bearer ${tokenValue}`);
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  for (const [key, value] of [['cache-control', 'no-store'], ['referrer-policy', 'no-referrer'], ['x-content-type-options', 'nosniff']]) assert.equal(response.headers.get(key), value);
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const html = await response.text();
  assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.ok(!html.includes('test-code'));
  assert.ok(!html.includes('postMessage("authorizing:github","*")'));
  const script = html.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);
  assert.ok(response.headers.get('content-security-policy').includes(`nonce-${script[1]}`));
  const messages = [], listeners = new Map();
  const opener = { postMessage: (...args) => messages.push(args) };
  const window = { opener, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), close() {} };
  vm.runInNewContext(script[2], { window, setTimeout() {} });
  assert.deepEqual(messages[0], ['authorizing:github', origin]);
  const receive = listeners.get('message');
  for (const event of [{ source: {}, origin, data: 'authorizing:github' }, { source: opener, origin: 'https://evil.example', data: 'authorizing:github' }, { source: opener, origin, data: 'wrong' }]) receive(event);
  assert.equal(messages.length, 1, 'No token before complete trusted handshake');
  receive({ source: opener, origin, data: 'authorizing:github' });
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1], [`authorization:github:success:${JSON.stringify({ token: tokenValue, provider: 'github' })}`, origin]);
  receive({ source: opener, origin, data: 'authorizing:github' });
  assert.equal(messages.length, 2, 'Token released once');
});

test('forged, expired, denied or mismatched callbacks fail before exchange and clear cookies', async () => {
  const session = await start();
  const payload = JSON.parse(Buffer.from(session.cookie.split('=')[1].split('.')[0], 'base64url'));
  const variants = [
    new Request(`${origin}/api/cms/callback?code=x&state=${session.state}`),
    callback({ ...session, cookie: session.cookie + 'x' }),
    callback({ ...session, state: 'forged' }),
    callback({ ...session, cookie: signedCookie({ ...payload, exp: Date.now() - 1 }) }),
    callback({ ...session, cookie: signedCookie({ ...payload, exp: Date.now() + 900000 }) }),
    callback(session, '&error=access_denied'), callback(session, '&provider=gitlab'),
    callback(session, '', { headers: { Cookie: session.cookie, Origin: 'https://evil.example' } }),
    new Request(`https://evil.example/api/cms/callback?code=x&state=${session.state}`, { headers: { Cookie: session.cookie } }),
  ];
  for (const request of variants) {
    const response = await handleRequest(request, env, () => { assert.fail('Must reject before exchange'); });
    assert.ok(response.status >= 400);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.ok(!(await response.text()).includes(tokenValue));
  }
});

test('untrusted upstream token/account/repository/error/JSON/size/timeout fail closed', async () => {
  const cases = [
    { token: { error: 'access_denied' } }, { token: { access_token: tokenValue, token_type: 'bearer', scope: '' } },
    ...[null, 23, 'bad<script>', ''].map((access_token) => ({ token: { access_token, token_type: 'bearer', scope: 'public_repo' } })),
    { token: { access_token: tokenValue, token_type: 'mac', scope: 'public_repo' } },
    { user: { login: 'attacker' } }, { repo: { full_name: 'attacker/blog', permissions: { push: true } } },
    { repo: { full_name: 'yannn-hash/blog', permissions: { push: false } } },
    { repo: { full_name: 'yannn-hash/blog' } }, { token: new Response('{invalid') },
    { user: new Response('[]', { status: 403 }) }, { token: new Error('timeout secret-code') },
    { token: new Response('x'.repeat(65537)) },
  ];
  for (const overrides of cases) {
    const mock = github(overrides), response = await handleRequest(callback(await start()), env, mock.fetcher);
    assert.equal(response.status, 400);
    const text = await response.text();
    assert.ok(!text.includes(tokenValue) && !text.includes('secret-code'));
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
  }
  const keepAlive = setInterval(() => {}, 1000); // AbortSignal.timeout itself is unref'd in Node.
  let response;
  try {
    response = await handleRequest(callback(await start()), env, (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
  } finally { clearInterval(keepAlive); }
  assert.equal(response.status, 400, 'Real bounded abort fires');
  assert.equal((await handleRequest(callback(await start()), env, github({ token: { access_token: tokenValue, token_type: 'bearer', scope: 'repo' } }).fetcher)).status, 200);
});

test('missing settings, wrong methods/provider/origin/site and unknown API remain safe; assets forwarded', async () => {
  for (const property of ['CMS_ORIGIN', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'CMS_SESSION_SECRET']) {
    const response = await handleRequest(new Request(`${origin}/api/cms/callback`), { ...env, [property]: '' });
    assert.equal(response.status, 503);
    assert.match(response.headers.get('set-cookie'), /Max-Age=0/);
    assert.match(await response.text(), /docs\/CMS.md/);
  }
  for (const query of ['provider=gitlab&site_id=smtmtc-blog.smtmtc.workers.dev', 'provider=github&site_id=evil.example', 'provider=github']) assert.equal((await handleRequest(new Request(`${origin}/api/cms/auth?${query}`), env)).status, 400);
  assert.equal((await handleRequest(new Request(`${origin}/api/cms/auth`, { method: 'POST' }), env)).status, 405);
  assert.equal((await handleRequest(new Request(`${origin}/api/cms/missing`), env)).status, 404);
  assert.equal(await (await worker.fetch(new Request(`${origin}/blog/`), env)).text(), 'static');
});
