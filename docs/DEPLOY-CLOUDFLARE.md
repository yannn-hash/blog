# Menyiapkan deployment Cloudflare Workers

Proyek ini menghasilkan situs statis. Cloudflare Workers menyajikan file `dist/` melalui binding `ASSETS`; module Worker hanya menangani broker OAuth `/api/cms/*` dan meneruskan permintaan lain ke aset. Tidak diperlukan adapter SSR atau database. Persiapan lokal tidak menerbitkan situs, mengubah DNS, atau mengaktifkan paket berbayar.

## Sebelum menghubungkan akun

- Akun GitHub dengan akses tulis ke repositori **https://github.com/yannn-hash/blog**.
- Akun Cloudflare dan pilihan Workers **Free**; baca batas yang ditampilkan di dashboard sebelum melanjutkan.
- Node.js minimal 22.18.0 dan npm pada komputer atau lingkungan build. `npm ci` memasang runtime proyek Node 22.23.3; devDependencies dan install scripts harus diaktifkan.
- Build dan pengujian lokal berhasil.

Simpan artikel di Markdown. Jangan upload `.env`, token, `node_modules`, atau `dist` sebagai sumber proyek. `.gitignore` sudah mengabaikannya.

## 1. Menyiapkan Git dengan aman

Periksa isi repositori dan branch default dahulu. Jika remote sudah berisi file, clone repositori tersebut dan gabungkan sumber blog dengan hati-hati; jangan menimpa sejarah atau memakai force push.

Untuk remote yang benar-benar kosong, dari folder proyek:

Jika folder ini sudah memiliki commit lokal dari persiapan BMad, lewati langkah init, add, dan commit yang sudah selesai; cukup hubungkan remote lalu push saat siap.

```powershell
git init
git branch -M main
git remote add origin https://github.com/yannn-hash/blog.git
git status
git add package.json package-lock.json astro.config.mjs tsconfig.json wrangler.jsonc .gitignore .gitattributes .env.example README.md src public scripts tests docs workers
git diff --cached --stat
git commit -m "Membuat blog Astro Riskiyanto"
git push -u origin main
```

Jalankan perintah hanya saat siap mengunggah sumber. Daftar `git add` di atas memilih sumber aplikasi dan dokumentasinya; pendukung BMad serta rencana tetap tersimpan lokal. Pastikan file yang akan masuk commit sesuai pilihan Anda. Autentikasi GitHub memakai cara yang ditawarkan Git/GitHub, tanpa menyimpan token di proyek.

## 2. Pilih deployment pertama

Penerbitan awal akan dilakukan **secara manual oleh pemilik blog**. Gunakan alur CLI di bawah saat siap. Integrasi Git adalah pilihan untuk tahap berikutnya; belum dihubungkan oleh proyek ini.

### Melalui dashboard dan integrasi Git

Di Cloudflare, buka Workers & Pages dan buat proyek Worker dari repositori GitHub. Nama menu dapat berubah; pilih alur Worker dengan static assets. Pilih repositori `yannn-hash/blog`, branch yang benar, dan root proyek ini.

Konfigurasi build:

- Install: `npm ci` (atau langkah pemasangan otomatis dashboard).
- Build: `npm run build`.
- Deploy: `node scripts/run.mjs wrangler deploy` (memakai Wrangler dan runtime Node yang dipin).
- Output assets: `./dist`, dibaca dari `wrangler.jsonc`.
- Node host: gunakan 22.23.3 atau lebih baru untuk pemasangan tanpa peringatan engine; script menjalankan Node lokal 22.23.3.

Jika dashboard meminta versi Node, atur `NODE_VERSION` ke versi Node yang dipilih pada pengaturan build. Pastikan devDependencies terpasang karena Wrangler dipakai saat deployment. Sesudah integrasi aktif, commit/push pada branch produksi memicu build/deployment. Build gagal tidak boleh dianggap sebagai artikel sudah diterbitkan.

### Melalui CLI

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
node scripts/run.mjs wrangler login
npm.cmd run deploy
```

`wrangler login` membuka alur autentikasi Cloudflare. `deploy` membangun dan mengunggah aset ke akun tersebut, menggunakan nama Worker `smtmtc-blog`. Periksa akun/nama Worker sebelum menjalankannya. Tidak ada token yang perlu ditulis ke `.env`.

Untuk simulasi lokal, gunakan `npm.cmd run worker:dev`; ini tidak menerbitkan situs. Konfigurasi `not_found_handling: "404-page"` menggunakan `dist/404.html` dengan status HTTP 404 untuk alamat tidak dikenal. `html_handling: "force-trailing-slash"` menyelaraskan URL dengan konfigurasi Astro.

## 3. Memeriksa URL percobaan

Sesudah deployment, gunakan URL yang benar-benar diberikan Cloudflare. Coba beranda, arsip, artikel, topik, halaman tentang, pencarian, RSS, serta alamat yang tidak ada. Draf dan artikel masa depan harus menghasilkan 404. Pada tahap ini canonical dan sitemap tetap menunjuk domain tujuan `https://smtmtc.com`.

## 4. Menghubungkan smtmtc.com

Tahap domain perlu pemeriksaan tersendiri: domain harus berada pada zona aktif Cloudflare, penggunaan record DNS yang ada harus diperiksa, dan domain utama ditetapkan. Sesudah siap, tambahkan Custom Domain melalui dashboard Worker dan ikuti alur Cloudflare. Proyek ini sengaja belum mempunyai `routes` atau `custom_domain`, sehingga menjalankan deployment tidak mengubah domain produksi.

Periksa HTTPS, redirect URL, canonical, RSS, dan sitemap setelah domain aktif. Jangan menghapus record yang masih dipakai layanan lain.

## 5. CMS berbasis Git dan OAuth

Decap CMS 3.17.1 kini tersedia di `/admin/`, dengan repositori `yannn-hash/blog` pada `main`. Broker Worker membutuhkan OAuth App milik pengguna; login produksi belum diverifikasi. Panduan lengkap, dua terminal lokal, scope, secrets dan pemeriksaan browser ada di [CMS.md](CMS.md).

1. Buat GitHub **OAuth App** secara manual dengan callback persis `https://smtmtc-blog.smtmtc.workers.dev/api/cms/callback` dan homepage `https://smtmtc-blog.smtmtc.workers.dev`.
2. Atur `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, dan `CMS_SESSION_SECRET` (acak minimal 32 karakter) dengan `node scripts/run.mjs wrangler secret put NAMA_SECRET`. Masukkan nilainya hanya pada prompt Wrangler. Jangan simpan di public/JavaScript browser/Git/frontmatter.
3. `CMS_ORIGIN` di konfigurasi sudah menunjuk origin workers.dev saat ini. Jalankan check/test lalu deployment manual hanya saat siap.
4. Uji popup login, akun tanpa izin, akun yannn-hash, simpan draf, gambar, serta artikel terbit. Broker meminta scope `public_repo`, yang mencakup semua repo publik yang dapat diakses akun; pembatasan broker ke repo blog tidak mempersempit token GitHub.
5. Sesudah CMS membuat commit di GitHub, jalankan `git pull --ff-only origin main`, check/test, lalu `npm.cmd run deploy`. CMS tidak otomatis memperbarui situs publik.

Editor harus mempertahankan `title`, `description`, `pubDate` berbentuk string `YYYY-MM-DD`, `tags`, dan `draft`. `example` opsional. URL mengikuti nama file. Model artikel tetap sama tanpa migrasi database.

Ketika pindah domain, perbarui origin pada `wrangler.jsonc` dan `src/cms/config.mjs`, callback OAuth App menjadi `https://smtmtc.com/api/cms/callback`, lalu build/redeploy dan uji login lagi. Browser QA serta OAuth produksi nyata masih perlu dilakukan pemilik; keduanya tidak tersedia pada lingkungan pengerjaan ini.

Artikel terjadwal tidak otomatis terbit ketika jam berganti: Worker menyajikan build terakhir. Jalankan build setelah waktu publikasi atau tambahkan otomatisasi build terjadwal pada tahap berikutnya jika diperlukan.

Referensi resmi: [Astro di Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [konfigurasi routing aset](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), dan [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
