const COOKIE = '__Host-smtmtc-cms';
const TTL = 600;
const encoder = new TextEncoder();
const securityHeaders = {
  'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
};
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
const base64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = () => base64(crypto.getRandomValues(new Uint8Array(32)));
const safeJSON = (value) => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0));
}
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function seal(data, secret) {
  const payload = base64(encoder.encode(JSON.stringify(data)));
  return `${payload}.${base64(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)))}`;
}
async function unseal(cookie, secret) {
  const parts = cookie.split('.');
  if (parts.length !== 2 || cookie.length > 2048 || !await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), encoder.encode(parts[0]))) throw new Error('invalid');
  return JSON.parse(new TextDecoder().decode(decode(parts[0])));
}
function equalState(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = encoder.encode(left), b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < 128; index++) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0 && a.length <= 128;
}
function config(env) {
  const origin = env.CMS_ORIGIN;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.protocol !== 'https:' || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.CMS_SESSION_SECRET || env.CMS_SESSION_SECRET.length < 32) return null;
    return { origin, hostname: url.hostname, callback: `${origin}/api/cms/callback` };
  } catch { return null; }
}
function error(status, callback = false) {
  return new Response(status === 503 ? 'CMS belum dikonfigurasi. Pemilik perlu mengatur GitHub OAuth App dan Worker secrets; baca docs/CMS.md.' : 'Autentikasi CMS gagal. Tutup jendela ini dan coba login kembali.', {
    status, headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", ...(callback ? { 'Set-Cookie': clearCookie } : {}) },
  });
}
async function githubJSON(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('upstream');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('upstream');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error('upstream');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function success(token, origin) {
  const nonce = random();
  // Decap sends the same authorizing message back after checking its popup.
  const script = `const origin=${safeJSON(origin)};const opener=window.opener;let finished=false;function receive(event){if(finished||!opener||event.source!==opener||event.origin!==origin||event.data!=="authorizing:github")return;finished=true;window.removeEventListener("message",receive);opener.postMessage(${safeJSON(`authorization:github:success:${JSON.stringify({ token, provider: 'github' })}`)},origin);window.close();}window.addEventListener("message",receive);if(opener)opener.postMessage("authorizing:github",origin);setTimeout(()=>{finished=true;window.removeEventListener("message",receive);window.close();},60000);`;
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Login CMS</title><p>Login berhasil. Menyelesaikan koneksi dengan editor… Anda dapat menutup jendela ini jika editor telah terbuka.</p><script nonce="${nonce}">${script}</script></html>`, {
    headers: { ...securityHeaders, 'Set-Cookie': clearCookie, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` },
  });
}

export async function handleRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/cms/')) return env.ASSETS.fetch(request);
  const callback = url.pathname === '/api/cms/callback';
  if (!['/api/cms/auth', '/api/cms/callback'].includes(url.pathname)) return error(404);
  if (request.method !== 'GET') return error(405, callback);
  const settings = config(env);
  if (!settings) return error(503, callback);
  if (url.origin !== settings.origin || (request.headers.has('Origin') && request.headers.get('Origin') !== settings.origin)) return error(403, callback);
  try {
    if (!callback) {
      if (url.searchParams.get('provider') !== 'github' || url.searchParams.get('site_id') !== settings.hostname) return error(400);
      const state = random(), verifier = random();
      const cookie = await seal({ state, verifier, exp: Date.now() + TTL * 1000 }, env.CMS_SESSION_SECRET);
      const authorize = new URL('https://github.com/login/oauth/authorize');
      authorize.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: settings.callback, scope: 'public_repo', state, code_challenge: base64(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))), code_challenge_method: 'S256' });
      return new Response(null, { status: 302, headers: { ...securityHeaders, Location: authorize.href, 'Set-Cookie': `${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}` } });
    }
    const cookies = (request.headers.get('Cookie') ?? '').split(';').map((value) => value.trim()).filter((value) => value.startsWith(`${COOKIE}=`));
    if (cookies.length !== 1 || url.searchParams.has('error') || (url.searchParams.has('provider') && url.searchParams.get('provider') !== 'github')) return error(400, true);
    const session = await unseal(cookies[0].slice(COOKIE.length + 1), env.CMS_SESSION_SECRET);
    const code = url.searchParams.get('code');
    if (!Number.isFinite(session.exp) || session.exp < Date.now() || session.exp > Date.now() + TTL * 1000 || !/^[A-Za-z0-9_-]{43}$/.test(session.verifier) || !equalState(session.state, url.searchParams.get('state')) || !code || code.length > 512 || !/^[A-Za-z0-9_-]+$/.test(code)) return error(400, true);
    const token = await githubJSON(fetcher, 'https://github.com/login/oauth/access_token', {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: settings.callback, code_verifier: session.verifier }),
    });
    if (token.error || typeof token.access_token !== 'string' || !/^[A-Za-z0-9_]{1,512}$/.test(token.access_token) || typeof token.token_type !== 'string' || token.token_type.toLowerCase() !== 'bearer' || typeof token.scope !== 'string' || !token.scope.split(/[ ,]+/).some((scope) => ['public_repo', 'repo'].includes(scope))) throw new Error('denied');
    const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.access_token}`, 'User-Agent': 'smtmtc-cms', 'X-GitHub-Api-Version': '2022-11-28' };
    const user = await githubJSON(fetcher, 'https://api.github.com/user', { headers });
    if (user.login !== 'yannn-hash') throw new Error('denied');
    const repo = await githubJSON(fetcher, 'https://api.github.com/repos/yannn-hash/blog', { headers });
    if (repo.full_name !== 'yannn-hash/blog' || repo.permissions?.push !== true) throw new Error('denied');
    return success(token.access_token, settings.origin);
  } catch { return error(400, callback); }
}
export default { fetch(request, env) { return handleRequest(request, env); } };
