import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { articleFormat, beforeSave, validateArticle, validatePath } from '../src/cms/content.mjs';
import { cmsConfig } from '../src/cms/config.mjs';
import { postSchema } from '../src/lib/post-schema.ts';

// Minimal immutable interface to assert hook's contract without a second CMS dependency.
function entry(data, rest = {}) {
  const dataMap = { toJS: () => data };
  return { get: (key) => key === 'data' ? dataMap : rest[key] };
}
const data = { title: 'Catatan: ya', description: 'Ringkasan', pubDate: '2026-10-15', tags: ['astro', '123'], draft: true, example: false, body: '## Judul\n\nIsi **Markdown**.\n' };

test('YAML1.2 roundtrip quotes dates and strings; booleans, body and Astro schema retain types', async () => {
  const raw = articleFormat.toFile(data);
  assert.match(raw, /pubDate: '2026-10-15'/);
  assert.match(raw, /draft: true/);
  assert.match(raw, /example: false/);
  assert.deepEqual(articleFormat.fromFile(raw), data);
  assert.equal(postSchema.safeParse(articleFormat.fromFile(raw)).success, true);
  assert.equal(articleFormat.fromFile('---\ntitle: yes\npubDate: 2026-10-15\n---\ntext').title, 'yes');
  assert.equal(typeof articleFormat.fromFile('---\npubDate: 2026-10-15\n---\ntext').pubDate, 'string');
  for (const file of await readdir('src/content/blog')) {
    if (file.endsWith('.md')) assert.equal(postSchema.safeParse(articleFormat.fromFile(articleFormat.toFile(articleFormat.fromFile(await readFile(`src/content/blog/${file}`, 'utf8'))))).success, true);
  }
});

test('invalid date/tag/types/filename blocked; new filename required; existing title/date edits keep path', () => {
  for (const patch of [{ title: '' }, { description: '' }, { pubDate: '2026-02-31' }, { pubDate: new Date() }, { tags: ['123', 23] }, { tags: ['Tidak Aman'] }, { draft: 'false' }, { example: 'false' }, { filename: '../escape' }, { filename: 'bad_name' }]) assert.throws(() => validateArticle({ ...data, ...patch }));
  assert.throws(() => beforeSave({ entry: entry(data, { newRecord: true }) }));
  for (const filename of ['bad_name', 'bad~name', '', '你好', '../escape']) assert.throws(() => beforeSave({ entry: entry({ ...data, filename }, { newRecord: true }) }));
  const fresh = entry({ ...data, filename: 'artikel-baru' }, { newRecord: true });
  assert.equal(beforeSave({ entry: fresh }), fresh.get('data'));
  for (const filename of ['src/content/blog/existing-path.md', 'src/content/blog/nested/existing-path.md']) {
    const existing = entry({ ...data, title: 'Judul baru', pubDate: '2026-10-14' }, { newRecord: false, path: filename, slug: filename.slice(17, -3) });
    assert.equal(beforeSave({ entry: existing }), existing.get('data'));
    assert.equal(existing.get('path'), filename);
  }
  for (const filename of ['../escape.md', 'src/content/blog/Bad.md', 'src/content/blog/x_1.md', 'src/content/blog/x/../y.md']) assert.throws(() => validatePath(filename));
  assert.throws(() => articleFormat.fromFile('---\ntitle: a\ntitle: b\n---\nbody'));
  assert.throws(() => articleFormat.fromFile('body without frontmatter'));
});

test('formatter roundtrips incomplete local draft backups while preSave still rejects them', () => {
  for (const partial of [{}, { title: 'Belum selesai', draft: true }, { title: '', pubDate: '2026-02-31', body: 'Isi sementara' }]) {
    const raw = articleFormat.toFile(partial);
    assert.deepEqual(articleFormat.fromFile(raw), { ...partial, body: partial.body ?? '' });
    assert.ok(!raw.endsWith('undefined'));
    assert.throws(() => beforeSave({ entry: entry(articleFormat.fromFile(raw), { newRecord: true }) }));
  }
});

test('existing entry without tags saves and keeps Astro empty-array default', () => {
  const { tags, ...withoutTags } = data;
  const existing = entry(withoutTags, { newRecord: false, path: 'src/content/blog/existing-path.md', slug: 'existing-path' });
  assert.equal(beforeSave({ entry: existing }), existing.get('data'));
  const saved = articleFormat.fromFile(articleFormat.toFile(withoutTags));
  assert.equal(saved.tags, undefined);
  assert.deepEqual(postSchema.parse(saved).tags, []);
  assert.throws(() => beforeSave({ entry: entry({ ...withoutTags, tags: null }, { newRecord: false }) }));
});

test('admin uses GitHub main, Indonesian fields, manual init, no workflow and exact loopback proxy', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1']) assert.equal(cmsConfig(host).local_backend.url, 'http://127.0.0.1:8081/api/v1');
  for (const host of ['evil-localhost', 'localhost.example', '127.0.0.1.example', 'smtmtc-blog.smtmtc.workers.dev']) assert.equal(cmsConfig(host).local_backend, undefined);
  const config = cmsConfig('smtmtc-blog.smtmtc.workers.dev');
  assert.equal(config.locale, 'id');
  assert.equal(config.backend.repo, 'yannn-hash/blog');
  assert.equal(config.backend.branch, 'main');
  assert.equal(config.load_config_file, false);
  assert.equal(config.publish_mode, undefined);
  assert.equal(config.collections[0].fields.find((field) => field.name === 'draft').default, true);
  assert.equal(config.collections[0].fields.find((field) => field.name === 'example').default, false);
  assert.equal(config.collections[0].fields.find((field) => field.name === 'tags').required, false);
});

test('all vendored runtime bytes match provenance and stay below Cloudflare single asset limit', async () => {
  const provenance = JSON.parse(await readFile('public/admin/vendor/provenance.json', 'utf8'));
  assert.equal(provenance.version, '3.17.1');
  assert.match(provenance.integrity, /^sha512-/);
  for (const [file, hash] of Object.entries(provenance.sha256)) {
    const bytes = await readFile(`public/admin/vendor/${file}`);
    assert.ok(bytes.length < 25 * 1024 * 1024);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
  assert.ok(Object.keys(provenance.sha256).some((file) => /^\d+\.decap-cms\.js$/.test(file)));
  assert.ok(provenance.sha256['decap-cms.js.LICENSE.txt']);
  assert.ok(provenance.sha256.LICENSE);
});
