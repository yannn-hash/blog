import { articleFormat, validatePath } from './content.mjs';

export const LOCAL_ENDPOINT = 'http://127.0.0.1:8081/api/v1';
export const isLoopback = (hostname) => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
export function credentials(storage) {
  try {
    const user = JSON.parse(storage.getItem('decap-cms-user'));
    if (user?.backendName === 'proxy') return { backend: 'local' };
    if (user?.backendName === 'github' && typeof user.token === 'string' && /^[A-Za-z0-9_]{1,512}$/.test(user.token)) return { backend: 'github', token: user.token };
  } catch {}
  return null;
}
export function entryPath(href, base) {
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin || url.pathname !== new URL(base).pathname) return null;
    const match = url.hash.match(/^#\/collections\/blog\/entries\/([^?#]+)(?:\?.*)?$/);
    if (!match) return null;
    const slug = decodeURIComponent(match[1]);
    const path = `src/content/blog/${slug}.md`;
    validatePath(path);
    return path;
  } catch { return null; }
}
async function json(response) {
  if (!response.ok) {
    if ([404, 409, 422].includes(response.status)) throw new Error('Artikel tidak ditemukan atau telah berubah. Muat ulang daftar sebelum mencoba lagi.');
    throw new Error('Permintaan gagal. Periksa akses dan koneksi, lalu muat ulang daftar.');
  }
  return response.json();
}
export function contentActions({ user, hostname, fetcher = fetch }) {
  const local = user?.backend === 'local' && isLoopback(hostname);
  if (!local && user?.backend !== 'github') throw new Error('Masuk ke CMS terlebih dahulu.');
  const headers = local ? { 'Content-Type': 'application/json' } : { Accept: 'application/vnd.github+json', Authorization: `Bearer ${user.token}`, 'X-GitHub-Api-Version': '2022-11-28' };
  async function proxy(action, params) {
    return json(await fetcher(LOCAL_ENDPOINT, { method: 'POST', headers, body: JSON.stringify({ action, params }), signal: AbortSignal.timeout(10000), redirect: 'error' }));
  }
  const url = (path) => `https://api.github.com/repos/yannn-hash/blog/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  return {
    async load(path) {
      validatePath(path);
      let raw, sha;
      if (local) {
        const data = await proxy('getEntry', { branch: 'main', path });
        if (data?.file?.path !== path || typeof data.data !== 'string') throw new Error('Respons artikel tidak valid. Muat ulang daftar.');
        raw = data.data;
      } else {
        const data = await json(await fetcher(`${url(path)}?ref=main`, { headers, signal: AbortSignal.timeout(10000), redirect: 'error' }));
        if (data?.path !== path || !/^[a-f0-9]{40,64}$/.test(data.sha) || data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('Respons artikel tidak valid. Muat ulang daftar.');
        raw = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), (character) => character.charCodeAt(0)));
        sha = data.sha;
      }
      const { title } = articleFormat.fromFile(raw);
      if (typeof title !== 'string' || !title.trim()) throw new Error('Judul artikel tidak valid. Periksa file Markdown.');
      return { path, title, sha };
    },
    async remove(entry) {
      validatePath(entry.path);
      if (local) return proxy('deleteFile', { branch: 'main', path: entry.path, options: { commitMessage: `Hapus artikel: ${entry.path}` } });
      if (!/^[a-f0-9]{40,64}$/.test(entry.sha)) throw new Error('Versi artikel tidak tersedia. Muat ulang daftar.');
      return json(await fetcher(url(entry.path), { method: 'DELETE', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Hapus artikel: ${entry.path}`, sha: entry.sha, branch: 'main' }), signal: AbortSignal.timeout(10000), redirect: 'error' }));
    },
  };
}
