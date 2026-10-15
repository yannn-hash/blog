import { parse, stringify } from 'yaml';

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validateArticle(data) {
  for (const key of ['title', 'description']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) throw new Error(`${key}: wajib diisi.`);
  }
  if (typeof data.pubDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.pubDate)) throw new Error('Tanggal harus YYYY-MM-DD.');
  const date = new Date(`${data.pubDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.pubDate) throw new Error('Tanggal kalender tidak valid.');
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.some((tag) => typeof tag !== 'string' || !slug.test(tag)))) throw new Error('Tag harus huruf kecil, angka, dan tanda hubung.');
  for (const key of ['draft', 'example']) if (data[key] !== undefined && typeof data[key] !== 'boolean') throw new Error(`${key}: harus boolean.`);
  if (typeof data.body !== 'string') throw new Error('Isi harus Markdown.');
  if (data.filename !== undefined && data.filename !== '' && (typeof data.filename !== 'string' || !slug.test(data.filename))) throw new Error('Nama file artikel tidak aman.');
  return data;
}

export function validatePath(filename) {
  if (!/^src\/content\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\.md$/.test(filename)) throw new Error('Nama file artikel tidak aman.');
}

export const articleFormat = {
  fromFile(content) {
    const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) throw new Error('Frontmatter YAML wajib tersedia.');
    const data = parse(match[1], { version: '1.2', maxAliasCount: 0, uniqueKeys: true });
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Frontmatter harus objek.');
    return { ...data, body: match[2] };
  },
  toFile(data) {
    const { body = '', ...frontmatter } = data;
    return `---\n${stringify(frontmatter, { version: '1.2', defaultStringType: 'QUOTE_SINGLE', defaultKeyType: 'PLAIN', lineWidth: 0 })}---\n${body}`;
  },
};

// Decap's preSave hook returns the immutable DATA map, not the entry map.
export function beforeSave({ entry }) {
  const data = validateArticle(entry.get('data').toJS());
  const entryPath = entry.get('path');
  if (entryPath) validatePath(entryPath);
  const entrySlug = entry.get('slug');
  if (entrySlug && !entrySlug.split('/').every((part) => slug.test(part))) throw new Error('Slug artikel tidak aman.');
  if (entry.get('newRecord') && !slug.test(data.filename ?? '')) throw new Error('Isi nama file untuk artikel baru dengan huruf kecil, angka, dan tanda hubung.');
  return entry.get('data');
}
