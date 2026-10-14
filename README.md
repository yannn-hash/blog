# Blog Riskiyanto · smtmtc

Blog pribadi statis dengan Astro, antarmuka bahasa Indonesia, dan artikel Markdown. Domain tujuan: **https://smtmtc.com**. Situs belum diterbitkan dari pekerjaan lokal ini.

## Jalankan di komputer

Gunakan Node.js **22.18.0 atau lebih baru** untuk pemasangan, dan npm. Proyek memasang **Node 22.23.3 lokal** melalui devDependency `node`; seluruh script memakai runtime ini secara eksplisit karena dependensi terkini memerlukan patch Node yang lebih baru. Node sistem tidak diubah. Pemasangan harus menyertakan devDependencies serta install scripts (jangan gunakan `--omit=dev` atau `--ignore-scripts`). Di PowerShell Windows, gunakan `npm.cmd` bila `npm` diblokir execution policy.

```powershell
npm.cmd ci
npm.cmd run dev
```

Buka alamat yang ditampilkan terminal (biasanya `http://localhost:4321`). Hentikan dengan `Ctrl+C`. Untuk pemasangan pertama setelah mengubah dependensi, gunakan `npm.cmd install`; untuk pemasangan yang mengulang lockfile, gunakan `npm.cmd ci`.

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`check` memeriksa Astro/TypeScript. `test` membangun situs lalu menguji aturan publikasi, pencarian, schema, dan keluaran HTML/RSS/sitemap. `build` menghasilkan `dist/`; `preview` menampilkan hasil build secara lokal. Tidak ada database atau token yang dibutuhkan.

## Menulis artikel

Buat `src/content/blog/judul-artikel.md`:

```markdown
---
title: 'Judul artikel'
description: 'Ringkasan pendek untuk daftar artikel dan hasil pencarian.'
pubDate: '2026-10-15'
tags: ['catatan', 'belajar']
draft: true
---

Paragraf pembuka tulisan.

## Subjudul

Isi tulisan berikutnya.
```

Nama file menentukan alamat `/blog/judul-artikel/`. Gunakan huruf kecil, angka, dan tanda hubung pada nama file serta tag. Simpan tanggal dalam tanda kutip dengan format `YYYY-MM-DD`; tanggal kalender yang salah membuat build gagal. `title`, `description`, dan `pubDate` wajib diisi.

Untuk menerbitkan, ubah `draft: false` dan pilih tanggal hari ini atau sebelumnya. Artikel masa depan dan draf tidak muncul di beranda, arsip, detail, topik, pencarian, RSS, maupun sitemap. Tanggal mulai berlaku pukul **00.00 WIB (Asia/Jakarta)**. Karena situs statis, artikel terjadwal baru tampil setelah build/deployment berikutnya; tidak ada penjadwal otomatis. Saat `dev`, mulai ulang server jika melewati batas tanggal; waktu publikasi dikunci saat proses/build dimulai agar seluruh permukaan konsisten.

Tiga artikel awal berlabel `example: true`; ganti dengan tulisan pribadi atau hapus setelah mencoba. Dua file `draf-contoh.md` dan `terjadwal-contoh.md` adalah fixture tersembunyi untuk pengujian, bukan artikel publik.

## Peta proyek

- `src/pages/`: alamat halaman dan endpoint RSS.
- `src/components/`: header, footer, dan daftar tulisan.
- `src/layouts/BaseLayout.astro`: kerangka halaman dan metadata.
- `src/content/blog/`: sumber artikel Markdown.
- `src/content.config.ts`: koleksi dan aturan nama file.
- `src/lib/post-schema.ts`: validasi informasi artikel.
- `src/lib/publication.ts` dan `src/lib/posts.ts`: satu aturan pemilihan artikel publik.
- `src/styles/global.css`: warna, tipografi, dan tata letak responsif.
- `public/`: aset yang disalin tanpa pemrosesan.
- `tests/`: pengujian perilaku dan hasil build.

[Panduan belajar Astro](docs/BELAJAR-ASTRO.md) menjelaskan alur latihan dari halaman pertama sampai menulis artikel. [Panduan Cloudflare](docs/DEPLOY-CLOUDFLARE.md) menjelaskan deployment Workers Free dan tahap CMS berikutnya.

## Repository, hosting, dan editor browser

Repositori yang diberikan: **https://github.com/yannn-hash/blog**. Folder ini belum otomatis terhubung atau didorong ke repositori tersebut; periksa isi/branch remote sebelum mengunggah. Jangan commit `.env`, token, `node_modules`, atau `dist`.

`wrangler.jsonc` memakai `dist/` sebagai static assets dan halaman `404.html` untuk alamat tidak dikenal. Tidak ada konfigurasi custom domain atau perubahan DNS. Penerbitan awal dilakukan secara manual oleh pemilik blog. `npm.cmd run worker:dev` menjalankan simulasi Worker lokal; `npm.cmd run deploy` benar-benar mengunggah ke akun Cloudflare yang terautentikasi, jadi jalankan hanya saat siap menerbitkan.

CMS berbasis Git direncanakan setelah repositori dan autentikasi siap. Belum ada halaman admin atau login yang terhubung. File Markdown akan tetap menjadi sumber artikel: editor menyimpan perubahan ke Git, kemudian build menghasilkan halaman baru. Login OAuth, hak akses repository, preview deployment, dan publish harus dihubungkan serta diuji sebelum dashboard disebut siap.
