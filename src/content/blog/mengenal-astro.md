---
title: 'Mengenal Astro, mulai dari satu halaman'
description: 'Contoh catatan pengantar tentang halaman, komponen, dan cara Astro menyusun sebuah situs.'
pubDate: '2026-10-12'
tags: ['astro', 'belajar']
example: true
---

Belajar membuat blog bisa dimulai dengan pertanyaan sederhana: apa yang terjadi ketika sebuah halaman dibuka?

Artikel ini adalah **contoh tulisan**, bukan laporan pengalaman pribadi. Tujuannya memperlihatkan seperti apa catatan belajar dapat ditulis di blog ini.

## Halaman adalah titik awal

Di Astro, file di dalam `src/pages` menentukan alamat halaman. File `tentang.astro`, misalnya, menghasilkan halaman `/tentang/`.

Sebuah file Astro memiliki dua bagian: kode di antara tanda `---`, kemudian markup yang ditampilkan kepada pembaca.

```astro
---
const nama = 'Riskiyanto';
---
<h1>Halo, {nama}.</h1>
```

## Mengulang dengan komponen

Header dan footer dipakai di banyak halaman. Daripada menulis ulang, keduanya dapat disimpan sebagai komponen. Layout menyatukannya dengan konten tiap halaman.

> Mulai dari satu bagian yang dapat dipahami. Setelah itu, lihat bagaimana bagian tersebut terhubung dengan bagian lain.

## Langkah kecil berikutnya

1. Buka halaman tentang.
2. Ubah satu kalimat, lalu simpan.
3. Perhatikan perubahan di browser.

Untuk melihat alur penulisan artikel, baca [contoh Markdown](/blog/menulis-dengan-markdown/).
