import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const read = (file) => readFile(path.join(root, file), 'utf8');
const articleLinks = (html) => [...new Set([...html.matchAll(/href="(\/blog\/[^"?#]+\/)"/g)].map((match) => match[1]))];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(file));
    else result.push(file);
  }
  return result;
}

test('artikel publik konsisten pada beranda, arsip, pencarian, RSS, dan sitemap', async () => {
  // Feed saat ini menjadi daftar pembanding, sehingga artikel contoh boleh diganti/dihapus.
  const feed = await read('rss.xml');
  const posts = [...feed.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const link = item.match(/<link>([^<]+)<\/link>/)?.[1];
    assert.ok(link, 'Item RSS harus mempunyai tautan artikel.');
    return { url: new URL(link).pathname, tags: [...item.matchAll(/<category>([^<]+)<\/category>/g)].map((match) => match[1]) };
  });
  const urls = posts.map((post) => post.url);
  assert.deepEqual(articleLinks(await read('index.html')), urls.slice(0, 3), 'Beranda hanya menampilkan tiga artikel terbaru.');
  for (const file of ['blog/index.html', 'cari/index.html']) {
    assert.deepEqual(articleLinks(await read(file)), urls, `Daftar artikel berbeda pada ${file}`);
  }
  const sitemap = await read('sitemap-0.xml');
  for (const post of posts) {
    assert.ok(sitemap.includes(`https://smtmtc.com${post.url}`), `${post.url} tidak ditemukan pada sitemap.`);
    const text = await read(`${post.url.slice(1)}index.html`);
    assert.match(text, /Riskiyanto/);
    assert.ok(text.includes(`https://smtmtc.com${post.url}`));
    for (const tag of post.tags) {
      assert.ok(articleLinks(await read(`tag/${tag}/index.html`)).includes(post.url), `${post.url} tidak ditemukan pada topik ${tag}.`);
    }
  }
});

test('draf dan tulisan terjadwal tidak bocor pada file publik apa pun', async () => {
  for (const file of await filesIn(root)) {
    const text = await readFile(file, 'utf8');
    for (const hidden of ['FIXTURE_DRAFT_PRIVATE', 'FIXTURE_FUTURE_PRIVATE', 'fixture-private', 'fixture-future', 'draf-contoh', 'terjadwal-contoh']) {
      assert.equal(text.includes(hidden), false, `${hidden} bocor ke ${file}`);
    }
  }
  await assert.rejects(access(path.join(root, 'blog/draf-contoh/index.html')));
  await assert.rejects(access(path.join(root, 'blog/terjadwal-contoh/index.html')));
});

test('metadata, fallback pencarian, dan halaman 404 tersedia', async () => {
  const home = await read('index.html');
  assert.match(home, /lang="id"/);
  assert.match(home, /href="#konten"/);
  assert.match(home, /rel="canonical" href="https:\/\/smtmtc.com\/"/);
  const search = await read('cari/index.html');
  assert.match(search, /<noscript>/);
  assert.match(search, /for="query"/);
  assert.match(search, /aria-live="polite"/);
  const missing = await read('404.html');
  assert.match(missing, /Halaman tidak ditemukan/);
  assert.match(missing, /noindex, follow/);
  assert.ok((await read('robots.txt')).includes('https://smtmtc.com/sitemap-index.xml'));
});

test('semua tautan internal HTML mengarah ke keluaran yang ada', async () => {
  for (const file of (await filesIn(root)).filter((file) => file.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const url = decodeURIComponent(match[1]);
      const target = path.join(root, url.endsWith('/') ? `${url}index.html` : url);
      await assert.doesNotReject(access(target), `${url} rusak pada ${path.relative(root, file)}`);
    }
  }
});
