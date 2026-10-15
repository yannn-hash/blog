import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

test('Cloudflare runtime completes OAuth and rejects upstream redirects without following them', { timeout: 30000 }, async () => {
  const origin = 'https://smtmtc-blog.smtmtc.workers.dev';
  let redirectToken = false;
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'cms-runtime', modules: true, scriptPath: path.resolve('workers/cms-auth.mjs'),
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
