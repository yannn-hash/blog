import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublished } from '../src/lib/publication.ts';
import { matchesSearch } from '../src/lib/search.ts';
import { postSchema } from '../src/lib/post-schema.ts';

test('publikasi: tanggal lampau/hari ini diterbitkan, draf/masa depan disembunyikan', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  assert.equal(isPublished({ draft: false, pubDate: new Date('2026-10-14') }, now), true);
  assert.equal(isPublished({ draft: false, pubDate: now }, now), true);
  assert.equal(isPublished({ draft: true, pubDate: new Date('2026-10-14') }, now), false);
  assert.equal(isPublished({ draft: false, pubDate: new Date('2026-10-16') }, now), false);
});

test('pencarian: kosong, huruf besar, judul, deskripsi, tag, dan tidak cocok', () => {
  const post = { title: 'Mengenal Astro', description: 'Mulai satu halaman', tags: ['belajar'] };
  for (const query of ['', '   ', 'ASTRO', 'satu halaman', 'BELAJAR']) assert.equal(matchesSearch(post, query), true);
  assert.equal(matchesSearch(post, 'tidak cocok'), false);
  assert.equal(matchesSearch(post, '<script>'), false);
});

test('schema menolak metadata kosong, tanggal palsu, serta tag tak aman', () => {
  const data = { title: 'Catatan', description: 'Ringkasan', pubDate: '2026-10-15', tags: ['astro'] };
  const valid = postSchema.parse(data);
  assert.equal(valid.draft, false);
  assert.equal(valid.pubDate.toISOString(), '2026-10-14T17:00:00.000Z');
  for (const patch of [{ title: undefined }, { title: ' ' }, { description: '' }, { pubDate: 'bukan tanggal' }, { pubDate: '2026-02-31' }, { tags: ['<script>'] }]) {
    assert.equal(postSchema.safeParse({ ...data, ...patch }).success, false);
  }
  assert.equal(postSchema.safeParse({ ...data, pubDate: '2024-02-29' }).success, true);
  assert.equal(postSchema.safeParse({ ...data, pubDate: '2025-02-29' }).success, false);
});

test('tanggal artikel mulai dipublikasikan tepat tengah malam WIB', () => {
  const data = postSchema.parse({ title: 'Hari ini', description: 'Batas WIB', pubDate: '2026-10-15' });
  assert.equal(isPublished(data, new Date('2026-10-14T16:59:59.999Z')), false);
  assert.equal(isPublished(data, new Date('2026-10-14T17:00:00.000Z')), true);
});
