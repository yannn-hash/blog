# Menulis lewat editor browser

Editor Decap CMS 3.17.1 tersedia di **/admin/**. Artikel tetap Markdown di `src/content/blog`; tidak ada database, SSR, atau editorial workflow. Produksi memakai repositori **yannn-hash/blog**, branch **main**, dan hanya akun GitHub **yannn-hash** dengan izin push yang diterima broker login.

Implementasi sudah dapat diuji lokal. **Login GitHub produksi belum diverifikasi dengan OAuth App nyata; browser QA belum dilakukan karena browser tidak tersedia di lingkungan pengerjaan.** Jangan menganggap pemasangan kode sebagai bukti login produksi sudah aktif.

## Coba lokal dengan dua terminal

Pasang dependensi beserta devDependencies/install scripts:

```powershell
npm.cmd ci
```

Terminal pertama:

```powershell
npm.cmd run dev
```

Terminal kedua, dari folder proyek yang sama:

```powershell
npm.cmd run cms:local
```

Buka `http://localhost:4321/admin/` lalu masuk melalui backend lokal. Proxy di `127.0.0.1:8081` menulis langsung ke folder proyek dalam mode filesystem, tanpa kredensial GitHub dan tanpa commit Git otomatis. Runner memakai Node lokal 22.23.3, memaksa host loopback, folder proyek, dan CORS loopback meskipun lingkungan berisi pengaturan lain. Proxy tidak berjalan otomatis bersama situs. Tutup kedua terminal dengan Ctrl+C setelah selesai. Jangan meneruskan port proxy melalui tunnel, reverse proxy, atau jaringan publik.

Backend lokal hanya diaktifkan pada hostname loopback persis (`localhost`, `127.0.0.1`, atau `::1`); hostname seperti `localhost.example` tidak mengaktifkannya. Gunakan `localhost` atau `127.0.0.1` untuk editor karena CORS proxy mendukung kedua hostname ini. Pada hostname produksi, editor selalu memakai GitHub.

Hentikan `cms:local` sebelum menjalankan `npm.cmd test`. Pengujian memakai port 8081 untuk proxy sementara dan sengaja menolak memakai proxy yang sudah berjalan.

## Menulis, menyimpan draf, dan gambar

1. Pilih **Artikel → Artikel baru**. Isi nama file/alamat, misalnya `catatan-pertama`. Nama ini wajib untuk artikel baru dan hanya menerima huruf kecil, angka, serta tanda hubung. Judul boleh memakai bahasa Indonesia dan tanda baca. Artikel lama mempertahankan path meskipun judul/tanggal berubah.
2. Isi judul, ringkasan, tanggal `YYYY-MM-DD` (WIB), topik berupa daftar string, dan isi Markdown. Topik boleh kosong. Tanggal kalender palsu, tag tak aman, serta nama file yang tidak sesuai ditolak sebelum penyimpanan.
3. **Simpan sebagai draf** aktif secara bawaan. **Artikel contoh** tidak aktif. Tombol simpan/publish Decap menyimpan file ke backend; field `draft` menentukan tampil atau tersembunyi pada blog. Tidak ada antrean persetujuan.
4. Unggah gambar melalui editor/media. File masuk `public/uploads` dan tautan Markdown menggunakan `/uploads/...`. File media bersifat publik setelah deployment; gunakan nama file aman tanpa informasi pribadi.
5. Untuk menerbitkan, matikan draf dan pilih hari ini atau sebelumnya. Tanggal disimpan sebagai string YAML bertanda kutip; boolean tetap boolean. Artikel masa depan dan draf disembunyikan di beranda, arsip, detail, topik, pencarian, RSS, dan sitemap.

Penerbitan mengikuti pukul 00.00 **Asia/Jakarta**. Situs statis hanya berubah setelah build/deployment baru. Artikel terjadwal tidak otomatis muncul saat jam berganti.

## Menyiapkan OAuth App (manual oleh pemilik)

Di akun GitHub yannn-hash, buka Settings → Developer settings → OAuth Apps → New OAuth App. Isikan:

- Nama: misalnya `smtmtc CMS`.
- Homepage URL: `https://smtmtc-blog.smtmtc.workers.dev`.
- Authorization callback URL persis: **`https://smtmtc-blog.smtmtc.workers.dev/api/cms/callback`**.

Ini adalah **OAuth App**, bukan GitHub App. Jangan menaruh client secret/token di browser, Git, frontmatter, atau chat. Broker meminta scope **public_repo**. Scope ini memberi akses tulis ke seluruh repositori publik yang dapat diakses akun, bukan hanya blog. Broker membatasi login menjadi yannn-hash dan memeriksa push pada `yannn-hash/blog`, tetapi token GitHub tetap mempunyai breadth scope tersebut. GitHub kadang mengembalikan parent scope `repo` jika otorisasi sebelumnya lebih luas; broker menerimanya sebagai superset. Cabut otorisasi aplikasi melalui pengaturan GitHub jika diperlukan.

Atur secrets di Worker `smtmtc-blog` lewat Wrangler (prompt menerima nilai, jangan masukkan nilainya ke command/history):

```powershell
node scripts/run.mjs wrangler secret put GITHUB_CLIENT_ID
node scripts/run.mjs wrangler secret put GITHUB_CLIENT_SECRET
node scripts/run.mjs wrangler secret put CMS_SESSION_SECRET
```

Untuk secret sesi, buat nilai acak minimal 32 karakter melalui password manager atau generator lokal, lalu tempel hanya ke prompt secret. Jangan gunakan contoh placeholder. `CMS_ORIGIN` sudah dipin ke URL workers.dev pada `wrangler.jsonc`, dan harus sama dengan origin admin. Belum ada secrets yang disertakan proyek. Jika konfigurasi belum lengkap, endpoint login mengembalikan 503 dengan petunjuk.

Untuk pengembangan Worker, `.env.example` hanya berisi placeholder: salin ke `.dev.vars`, isi secara lokal bila diperlukan, dan jangan commit. Semua varian `.dev.vars.*` diabaikan kecuali `.dev.vars.example`. Astro tidak membaca secret ini ke halaman admin. Secure cookie OAuth memerlukan origin HTTPS yang dikonfigurasi; login lokal sehari-hari memakai proxy filesystem dan tidak memerlukan secrets.

Broker menggunakan state dan PKCE S256 serta cookie HMAC HttpOnly/Secure/SameSite=Lax berumur sepuluh menit. Callback memeriksa cookie/state, akun, scope, dan izin repo sebelum memberikan token lewat handshake popup dengan origin dan opener persis. Token tidak ditempatkan pada URL atau log aplikasi. Jika login gagal, tutup popup dan coba lagi dari `/admin/`; periksa konfigurasi OAuth App/secrets jika tetap gagal.

## Build/deployment tetap manual

Di produksi, menyimpan dari CMS membuat commit di GitHub `main`. **Tidak ada deployment otomatis yang dikonfigurasi.** Tarik perubahan terlebih dahulu, lalu periksa dan deploy secara manual:

```powershell
git status
git pull --ff-only origin main
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run deploy
```

Selesaikan perubahan lokal/konflik sebelum pull. `npm test` sudah membangun situs; `deploy` membangun lagi kemudian mengunggah Worker/aset ke akun Cloudflare aktif. Periksa akun/Worker sebelum menjalankannya. Pemasangan ini tidak menjalankan push, deploy, perubahan DNS, atau membuat OAuth App.

## Verifikasi produksi setelah setup

Setelah pemilik mengatur secrets dan deploy, buka `/admin/`, login sebagai yannn-hash, simpan satu draf, ubah judul/tanggal artikel yang sama, dan unggah gambar percobaan. Pastikan commit/path benar di GitHub, lalu tarik perubahan dan build/deploy manual. Uji draf tetap 404 dan artikel terbit muncul konsisten pada seluruh permukaan publik. Uji penolakan akun lain serta popup ditutup/izin ditolak. Browser harus mengizinkan popup untuk situs ini. Pengujian lokal dengan mock GitHub tidak menggantikan langkah ini.

## Pindah ke smtmtc.com

Setelah domain siap, ubah ketiga bagian ini bersama-sama: `CMS_ORIGIN` di `wrangler.jsonc`, konstanta origin di `src/cms/config.mjs`, serta Homepage/callback OAuth App menjadi `https://smtmtc.com` dan **`https://smtmtc.com/api/cms/callback`**. Jalankan check/test, build dan redeploy manual, lalu uji login ulang dari origin baru. Jangan memberi wildcard origin atau membiarkan callback lama sebagai jalur login baru. Cookie login lama tidak berlaku lintas origin.

## Memperbarui bundle vendor

Bundle dibawa sendiri dari distribusi npm resmi; tidak ada ratusan dependensi build CMS yang dipasang. `public/admin/vendor/provenance.json` mencatat SHA512 tarball npm dan SHA256 setiap file (bundle, lazy chunks, CSS, WASM, dan lisensi). Root MIT license berasal dari commit release yang dipin karena archive npm tidak menyertakannya. Aset terbesar sekitar 4,9 MB, di bawah batas 25 MiB per aset.

```powershell
npm.cmd run cms:vendor
```

Perintah itu mereproduksi **versi 3.17.1** dan memeriksa SHA512 sebelum mengekstrak path yang dikenal. Untuk upgrade, ubah pin versi dan commit lisensi secara eksplisit dalam `scripts/vendor-decap.mjs`, periksa perubahan nama runtime upstream, lalu jalankan ulang check/test dan browser QA. Hapus aset versi lama hanya setelah memeriksa nama/path hasil update. Jangan mengambil bundle dari CDN saat runtime.

Referensi API: [custom format](https://github.com/decaporg/decap-cms/blob/9d1bb3beb69668cc43256dbe52a6dedae76d5436/packages/decap-cms-core/src/lib/registry.ts), [preSave](https://decapcms.org/docs/registering-events/), dan [GitHub OAuth web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#web-application-flow).
