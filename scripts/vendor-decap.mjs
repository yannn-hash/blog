// Download only the prebuilt distribution: no Decap build dependency tree.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';

const version = '3.17.1';
const registry = `https://registry.npmjs.org/decap-cms/${version}`;
const metadata = await (await fetch(registry)).json();
if (metadata.version !== version || !metadata.dist.integrity.startsWith('sha512-')) throw new Error('Metadata registry tidak valid.');
const archive = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer());
const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
if (integrity !== metadata.dist.integrity) throw new Error('Integritas npm SHA512 tidak cocok.');
const tar = gunzipSync(archive);
const wanted = new Map([['package/dist/decap-cms.js', `decap-cms-${version}.js`], ['package/dist/decap-cms.js.LICENSE.txt', 'decap-cms.js.LICENSE.txt'], ['package/dist/cms.css', 'cms.css'], ['package/dist/dd5d52671a5763720504.wasm', 'dd5d52671a5763720504.wasm'], ['package/dist/f728dc876b39e5273411.wasm', 'f728dc876b39e5273411.wasm']]);
const hashes = {};
await mkdir('public/admin/vendor', { recursive: true });
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.subarray(0, 100).toString().replace(/\0.*$/s, '');
  const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, '').trim() || '0', 8);
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('Tar tidak valid.');
  // Webpack lazy-loaded locale/syntax modules retain their original filenames.
  if (/^package\/dist\/\d+\.decap-cms\.js$/.test(name)) wanted.set(name, name.slice('package/dist/'.length));
  if (wanted.has(name)) {
    const bytes = tar.subarray(offset + 512, offset + 512 + size);
    if (bytes.length !== size || size >= 25 * 1024 * 1024) throw new Error('Ukuran aset tidak aman.');
    const filename = wanted.get(name);
    await writeFile(`public/admin/vendor/${filename}`, bytes);
    hashes[filename] = createHash('sha256').update(bytes).digest('hex');
    wanted.delete(name);
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (wanted.size) throw new Error(`Berkas distribusi hilang: ${[...wanted.keys()]}`);
// This npm archive omits the root MIT license. Use its immutable gitHead.
const releaseCommit = '9d1bb3beb69668cc43256dbe52a6dedae76d5436'; // decap-cms@3.17.1 annotated tag
const licenseURL = `https://raw.githubusercontent.com/decaporg/decap-cms/${releaseCommit}/LICENSE`;
const licenseResponse = await fetch(licenseURL);
if (!licenseResponse.ok) throw new Error('Lisensi upstream gagal diunduh.');
const license = Buffer.from(await licenseResponse.arrayBuffer());
await writeFile('public/admin/vendor/LICENSE', license);
hashes.LICENSE = createHash('sha256').update(license).digest('hex');
await writeFile('public/admin/vendor/provenance.json', JSON.stringify({ package: 'decap-cms', version, registry, tarball: metadata.dist.tarball, integrity, licenseURL, sha256: hashes, update: 'node scripts/vendor-decap.mjs' }, null, 2) + '\n');
console.log(`Decap CMS ${version}: integritas terverifikasi, bundle dan lisensi tersimpan.`);
