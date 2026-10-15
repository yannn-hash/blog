# Belajar Astro melalui blog ini

Mulai dari bagian yang kecil. Jalankan `npm.cmd ci`, lalu `npm.cmd run dev` dari folder proyek. Terminal menunjukkan alamat browser; simpan perubahan file untuk melihat pembaruan. `Ctrl+C` menghentikan server.

## 1. Halaman pertama

Buka `src/pages/tentang.astro`. Isi di bawah penanda `---` adalah tampilan halaman. Ubah satu kalimat lalu simpan. Periksa `/tentang/` di browser.

Bagian di antara dua penanda `---` adalah kode yang dijalankan Astro saat menghasilkan halaman. Bagian setelahnya menyerupai HTML dan bisa menyisipkan nilai dengan `{namaVariabel}`.

Alamat mengikuti nama file: `src/pages/index.astro` menjadi `/`, `src/pages/tentang.astro` menjadi `/tentang/`, dan `src/pages/blog/index.astro` menjadi `/blog/`.

## 2. Komponen dan layout

`src/components/Header.astro` menyimpan navigasi yang dipakai di banyak halaman. `Footer.astro` menyimpan bagian bawah. `PostList.astro` menerima daftar artikel melalui `Astro.props`.

`src/layouts/BaseLayout.astro` membungkus setiap halaman dengan HTML, metadata, header, dan footer. `<slot />` adalah tempat isi halaman dimasukkan. Coba ubah teks footer, lalu buka beberapa halaman untuk melihat komponen yang sama digunakan kembali.

## 3. CSS dan ukuran layar

Buka `src/styles/global.css`. Warna utama didefinisikan sebagai variabel di `:root`. Tata letak memakai lebar maksimum sehingga teks tidak melebar tanpa batas. Aturan `@media` menyesuaikan layar kecil.

Coba mengubah `--accent`, lalu periksa keterbacaan tautan dan penanda fokus. Tekan `Tab` untuk menelusuri halaman. Tautan pertama yang muncul adalah “Lewati ke konten”. Uji juga browser berukuran 375px dan 1440px: teks tidak boleh terpotong atau membuat halaman bergulir mendatar.

## 4. Koleksi artikel

`src/content.config.ts` mendefinisikan koleksi `blog` dengan loader `glob()` dari Astro. Loader membaca file Markdown di `src/content/blog`. `postSchema` memvalidasi judul, ringkasan, tanggal, tag, dan penanda draf. Ini adalah Astro Content Collections, bukan pembacaan file manual.

Buat file `src/content/blog/catatan-pertama.md`:

```markdown
---
title: 'Catatan pertama'
description: 'Hal yang ingin saya pelajari berikutnya.'
pubDate: '2026-10-15'
tags: ['belajar']
draft: true
---

Satu hal yang ingin saya pahami.

## Pertanyaan berikutnya

Apa yang bisa dicoba setelah ini?
```

Selama `draft: true`, artikel tidak mempunyai halaman publik. Ubah menjadi `false` untuk mencoba menampilkan artikel. Gunakan tanggal sekarang atau lampau. Tanggal dimulai pada 00.00 WIB (Asia/Jakarta), dan konten terjadwal memerlukan build baru sesudah waktunya. Ubah judul tanpa mengganti nama file jika ingin mempertahankan URL.

## 5. Dari Markdown menjadi halaman

`getPublicPosts()` memakai `getCollection('blog')` dan aturan bersama `isPublished()`. Semua halaman publik memakai fungsi ini. `src/pages/blog/[...slug].astro` menentukan `getStaticPaths()` dari artikel publik, lalu `render(post)` menghasilkan komponen isi Markdown.

Bagian `[...]` menandakan alamat dinamis. Astro membuat satu halaman HTML untuk setiap artikel yang lolos filter saat build. Draf serta artikel masa depan tidak mendapatkan halaman detail.

## 6. Pencarian dan fitur tanpa JavaScript

`src/pages/cari.astro` menampilkan daftar artikel publik sebagai HTML. JavaScript kecil memfilter daftar tersebut berdasarkan judul, deskripsi, dan tag, serta mengumumkan jumlah hasil. Tidak ada database pencarian. Jika JavaScript dimatikan, daftar dan tautan tetap tersedia, dengan petunjuk mencari memakai browser atau topik.

Beranda, tulisan, topik, halaman tentang, dan navigasi bekerja tanpa JavaScript.

## 7. Membangun versi produksi

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

`check` mencari kesalahan tipe. `test` membangun situs dan memeriksa perilaku penting. `build` mengubah Markdown serta komponen menjadi HTML, RSS, sitemap, CSS, dan skrip di `dist`. `preview` membaca hasil tersebut. Mengubah Markdown di sumber belum mengubah situs produksi sampai build dan deployment berhasil.

Jika build gagal, baca nama file dan field pada pesan error. Periksa judul wajib, format tanggal dalam tanda kutip, tanggal kalender yang benar, dan tag huruf kecil. Perbaiki sumber, lalu ulangi build.

## 8. Menulis melalui browser

Decap CMS di `/admin/` mengedit file Markdown yang sama. Jalankan `npm.cmd run dev` di terminal pertama dan `npm.cmd run cms:local` di terminal kedua, lalu buka `http://localhost:4321/admin/`. Buat artikel dengan nama file aman, simpan sebagai draf, dan periksa file hasilnya di `src/content/blog`. Coba ubah judul/tanggal dan pastikan nama file tetap sama. Proxy lokal memakai filesystem tanpa commit Git otomatis.

Di produksi editor membuat commit pada GitHub; pemilik harus menarik perubahan lalu build/deploy manual. Tidak ada database atau deployment otomatis. Setup OAuth App/secrets dan pengujian login nyata masih merupakan langkah manual pemilik. Ikuti [panduan CMS](CMS.md) dan [panduan deployment](DEPLOY-CLOUDFLARE.md).

Referensi resmi: [struktur proyek](https://docs.astro.build/en/basics/project-structure/), [komponen](https://docs.astro.build/en/basics/astro-components/), dan [Content Collections](https://docs.astro.build/en/guides/content-collections/).
