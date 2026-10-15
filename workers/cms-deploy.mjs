const API = 'https://api.cloudflare.com/client/v4';
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const pending = new Map();
const active = (build) => ['queued', 'running'].includes(build?.state);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
function problem(code, message, status) { return reply({ error: { code, message } }, status); }
function configuration(env) {
  try {
    const origin = new URL(env.CMS_ORIGIN);
    const hook = new URL(env.CMS_DEPLOY_HOOK_URL);
    if (origin.origin !== env.CMS_ORIGIN || origin.protocol !== 'https:' || hook.origin !== 'https://api.cloudflare.com' || hook.search || hook.hash || hook.username || hook.password || !/^\/client\/v4\/workers\/builds\/deploy_hooks\/[0-9a-f-]{36}$/i.test(hook.pathname) || !uuid.test(hook.pathname.split('/').at(-1)) || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_WORKER_TAG ?? '') || !/^[A-Za-z0-9_-]{1,512}$/.test(env.CLOUDFLARE_BUILDS_READ_TOKEN ?? '')) return null;
    return { origin: origin.origin, hook: hook.href, builds: `${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/builds/workers/${env.CLOUDFLARE_WORKER_TAG}/builds` };
  } catch { return null; }
}
// Keep every upstream response bounded. Neither upstream bodies nor metadata are returned to the browser.
async function boundedJSON(fetcher, url, options = {}, limit = 65536, timeout = 5000) {
  const response = await fetcher(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
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
      if (size > limit) throw new Error('upstream');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function normalizeBuild(build) {
  if (!build || !uuid.test(build.build_uuid) || typeof build.build_trigger_metadata?.branch !== 'string' || typeof build.created_on !== 'string' || !Number.isFinite(Date.parse(build.created_on))) throw new Error('invalid build');
  let state;
  if (build.status === 'queued') state = 'queued';
  else if (['initializing', 'running'].includes(build.status)) state = 'running';
  else if (build.status === 'stopped') state = { success: 'success', fail: 'failure', skipped: 'skipped', cancelled: 'cancelled', terminated: 'cancelled' }[build.build_outcome];
  if (!state) throw new Error('invalid state');
  return { id: build.build_uuid, state, createdAt: new Date(build.created_on).toISOString(), branch: build.build_trigger_metadata.branch };
}
async function builds(settings, env, fetcher) {
  let latest = null;
  const deadline = Date.now() + 10000;
  // Bound elapsed scan time, not account history size. Normal tracked polling uses the direct endpoint.
  for (let page = 1; ; page++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('incomplete builds');
    const data = await boundedJSON(fetcher, `${settings.builds}?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_BUILDS_READ_TOKEN}` } }, 2 * 1024 * 1024, Math.min(5000, remaining));
    if (data?.success !== true || !Array.isArray(data.result) || data.result.length > 100) throw new Error('invalid builds');
    const list = data.result.map(normalizeBuild).filter((build) => build.branch === 'main');
    const running = list.find(active);
    if (running) return [running];
    for (const build of list) if (!latest || Date.parse(build.createdAt) > Date.parse(latest.createdAt)) latest = build;
    const total = data.result_info?.total_pages;
    if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) throw new Error('incomplete builds');
    if (total !== undefined ? page >= total : data.result.length < 100) return latest ? [latest] : [];
    if (data.result.length === 0) throw new Error('incomplete builds');
  }
}
export async function handleDeploy(request, env, fetcher) {
  const url = new URL(request.url), status = url.pathname.endsWith('/status');
  if (request.method !== (status ? 'GET' : 'POST')) return problem('METHOD', 'Metode tidak diizinkan.', 405);
  // Check the pinned runtime origin even when other configuration is missing.
  const origin = request.headers.get('Origin');
  if (!env.CMS_ORIGIN || url.origin !== env.CMS_ORIGIN || (status ? (origin !== null && origin !== env.CMS_ORIGIN) : origin !== env.CMS_ORIGIN) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return problem('ORIGIN', 'Origin CMS tidak diizinkan.', 403);
  const settings = configuration(env);
  if (!settings) return problem('CONFIG_MISSING', 'Deploy belum dikonfigurasi. Pemilik perlu mengatur main Deploy Hook, account ID, Worker tag dan token Workers CI Read; baca docs/DEPLOY-CLOUDFLARE.md.', 503);
  const dashboardUrl = `https://dash.cloudflare.com/${env.CLOUDFLARE_ACCOUNT_ID}/workers/services/view/smtmtc-blog/production/builds`;
  const bearer = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_]{1,512})$/);
  if (!bearer) return problem('AUTH', 'Masuk kembali ke CMS melalui GitHub.', 401);
  const githubHeaders = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${bearer[1]}`, 'User-Agent': 'smtmtc-cms', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    const user = await boundedJSON(fetcher, 'https://api.github.com/user', { headers: githubHeaders });
    if (user?.login !== 'yannn-hash') return problem('AUTH', 'Akun tidak diizinkan untuk deploy.', 403);
    const repo = await boundedJSON(fetcher, 'https://api.github.com/repos/yannn-hash/blog', { headers: githubHeaders });
    if (repo?.full_name !== 'yannn-hash/blog' || repo.permissions?.push !== true) return problem('AUTH', 'Izin push repositori diperlukan.', 403);
  } catch { return problem('AUTH_CHECK', 'Pemeriksaan akses GitHub gagal. Masuk ulang atau coba pemeriksaan lagi.', 401); }
  const id = url.searchParams.get('id');
  if (status && id && !uuid.test(id)) return problem('BUILD_ID', 'ID build tidak valid.', 400);
  if (status) {
    try {
      if (id) {
        const data = await boundedJSON(fetcher, `${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/builds/builds/${id}`, { headers: { Authorization: `Bearer ${env.CLOUDFLARE_BUILDS_READ_TOKEN}` } }, 2 * 1024 * 1024);
        if (data?.success !== true || data.result?.trigger?.external_script_id !== env.CLOUDFLARE_WORKER_TAG || data.result?.build_uuid !== id) throw new Error('invalid tracked build');
        const build = normalizeBuild(data.result);
        if (build.branch !== 'main') throw new Error('invalid branch');
        return reply({ build, dashboardUrl });
      }
      const list = await builds(settings, env, fetcher);
      return reply({ build: list.find(active) ?? list[0] ?? null, dashboardUrl });
    } catch { return problem('MONITOR_UNAVAILABLE', 'Status build belum dapat diperiksa. Status terakhir dipertahankan; ini bukan kegagalan build.', 502); }
  }
  if (pending.has(settings.builds)) return pending.get(settings.builds).then((value) => reply(value.body, value.status));
  const operation = (async () => {
    let list;
    try { list = await builds(settings, env, fetcher); }
    catch { return { status: 502, body: { error: { code: 'MONITOR_UNAVAILABLE', message: 'Build aktif belum dapat diperiksa. Deploy tidak dikirim; coba periksa status lagi.' } } }; }
    const existing = list.find(active);
    if (existing) return { status: 200, body: { build: existing, existing: true, dashboardUrl } };
    let hookInfo;
    try {
      hookInfo = await boundedJSON(fetcher, `${API}/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/builds/workers/smtmtc-blog/deploy_hooks/${settings.hook.split('/').at(-1)}`, { method: 'GET', headers: { Authorization: `Bearer ${env.CLOUDFLARE_BUILDS_READ_TOKEN}` } });
    } catch { return { status: 502, body: { error: { code: 'MONITOR_UNAVAILABLE', message: 'Konfigurasi Deploy Hook belum dapat diperiksa. Deploy tidak dikirim; periksa akses Workers CI Read dan coba lagi.' } } }; }
    if (hookInfo?.success !== true || hookInfo.result?.branch !== 'main' || hookInfo.result?.external_script_id !== env.CLOUDFLARE_WORKER_TAG || hookInfo.result?.deploy_hook_uuid !== settings.hook.split('/').at(-1)) return { status: 503, body: { error: { code: 'CONFIG_MISSING', message: 'Deploy Hook harus cocok dengan Worker smtmtc-blog, tag yang dikonfigurasi, dan branch main. Deploy tidak dikirim; baca docs/DEPLOY-CLOUDFLARE.md.' } } };
    try {
      const data = await boundedJSON(fetcher, settings.hook, { method: 'POST' });
      if (data?.success !== true || !uuid.test(data.result?.build_uuid) || (data.result.already_exists !== undefined && typeof data.result.already_exists !== 'boolean') || (data.result.branch !== undefined && data.result.branch !== 'main') || (data.result.worker !== undefined && data.result.worker !== 'smtmtc-blog') || (data.result.worker_tag !== undefined && data.result.worker_tag !== env.CLOUDFLARE_WORKER_TAG)) throw new Error('invalid trigger');
      return { status: 202, body: { build: { id: data.result.build_uuid, state: 'queued', createdAt: new Date().toISOString(), branch: 'main' }, existing: data.result.already_exists === true, dashboardUrl } };
    } catch { return { status: 502, body: { error: { code: 'START_UNCERTAIN', message: 'Hasil permintaan Deploy belum diketahui. Jangan kirim ulang; periksa status atau dashboard Cloudflare dahulu.' } } }; }
  })();
  pending.set(settings.builds, operation);
  try { const value = await operation; return reply(value.body, value.status); }
  finally { pending.delete(settings.builds); }
}
