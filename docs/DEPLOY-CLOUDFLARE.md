# Menyiapkan deployment Cloudflare Workers

Proyek ini menghasilkan situs statis. Cloudflare Workers menyajikan file `dist/` melalui binding `ASSETS`; module Worker menangani OAuth serta pemicu/pemantauan deploy `/api/cms/*` dan meneruskan permintaan lain ke aset. Tidak diperlukan adapter SSR atau database. Persiapan lokal tidak menerbitkan situs, mengubah DNS, atau mengaktifkan paket berbayar.

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

Bagian ini menjelaskan pemasangan baru dan deployment awal oleh pemilik blog. Produksi saat ini sudah memakai integrasi GitHub Cloudflare sesuai konfigurasi pemilik; implementasi ini tidak mengubah koneksi tersebut. Untuk instalasi baru, pilih dashboard/Git atau alur CLI di bawah saat siap.

### Melalui dashboard dan integrasi Git

Di Cloudflare, buka Workers & Pages dan buat proyek Worker dari repositori GitHub. Nama menu dapat berubah; pilih alur Worker dengan static assets. Pilih repositori `yannn-hash/blog`, branch yang benar, dan root proyek ini.

Konfigurasi build:

- Install: `npm ci` (atau langkah pemasangan otomatis dashboard).
- Build: `npm run build`.
- Deploy: `node scripts/run.mjs wrangler deploy` (memakai Wrangler dan runtime Node yang dipin).
- Output assets: `./dist`, dibaca dari `wrangler.jsonc`.
- Node host: gunakan 22.23.3 atau lebih baru untuk pemasangan tanpa peringatan engine; script menjalankan Node lokal 22.23.3.

Jika dashboard meminta versi Node, atur `NODE_VERSION` ke versi Node yang dipilih pada pengaturan build. Pastikan devDependencies terpasang karena Wrangler dipakai saat deployment. Sesudah integrasi aktif, commit/push pada branch produksi memicu build/deployment sesuai watch paths. Untuk menahan commit konten sampai tombol Deploy ditekan, wajib ikuti langkah 6. Build gagal tidak boleh dianggap sebagai artikel sudah diterbitkan.

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
5. Sesudah CMS membuat commit di GitHub, gunakan Deploy berkelompok setelah langkah 6 selesai. Sebagai alternatif CLI, jalankan `git pull --ff-only origin main`, check/test, lalu `npm.cmd run deploy` saat siap.

Editor harus mempertahankan `title`, `description`, `pubDate` berbentuk string `YYYY-MM-DD`, `tags`, dan `draft`. `example` opsional. URL mengikuti nama file. Model artikel tetap sama tanpa migrasi database.

Ketika pindah domain, perbarui origin pada `wrangler.jsonc` dan `src/cms/config.mjs`, callback OAuth App menjadi `https://smtmtc.com/api/cms/callback`, lalu build/redeploy dan uji login/deploy lagi. Browser dengan backend simulasi sudah diuji; OAuth dan deployment produksi nyata masih perlu diverifikasi pemilik.

## 6. Deploy berkelompok dari CMS

Langkah ini dikerjakan pemilik di Cloudflare. Kode tidak mengubah konfigurasi akun, melakukan push, memicu build, atau meminta nilai kredensial lewat chat. Aktivasi memerlukan Workers Builds yang terhubung ke **yannn-hash/blog**, branch produksi **main**, Worker **smtmtc-blog**, serta deployment awal kode endpoint ini.

1. Di pengaturan build Worker, pasang **Build watch paths**: include `*`, exclude `src/content/blog/*` dan `public/uploads/*`. Ini pengaturan dashboard Workers Builds, bukan opsi `wrangler.jsonc`. Gunakan path/glob persis dan periksa nested path bila nantinya menambahkan subfolder. Commit yang hanya mengubah path tersebut menunggu Deploy; commit dengan perubahan kode lain tetap otomatis membangun dan dapat menyertakan konten tertunda. Tanpa pengecualian ini, Simpan masih dapat memicu build otomatis.
2. Buat **Deploy Hook** khusus Worker `smtmtc-blog` dengan branch **main**. URL berbentuk `https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/<uuid>`. Sebelum mengirim POST hook, server memakai token Workers CI Read untuk membaca metadata melalui `GET /accounts/<account_id>/builds/workers/smtmtc-blog/deploy_hooks/<uuid>` (path ini memakai nama Worker). Server mewajibkan branch `main`, `external_script_id` sama dengan Worker tag runtime, dan `deploy_hook_uuid` sama dengan UUID URL. Metadata hilang/tidak cocok atau pemeriksaan gagal menghentikan permintaan sebelum POST; editor menampilkan masalah konfigurasi/pemeriksaan, bukan hasil Deploy belum diketahui. Simpan URL sebagai secret runtime `CMS_DEPLOY_HOOK_URL`; jangan taruh pada JavaScript publik, repository, log, atau chat.
3. Buat API token **user-scoped** melalui **My Profile → API Tokens → Create Token → Create Custom Token**. Isi nama `cms-build-status`, lalu pada Permissions pilih **Account → Workers Builds Configuration → Read**. Pada Account Resources, pilih **Include → akun yang memiliki Worker smtmtc-blog**. Nama izin pada referensi API adalah **Workers CI Read**, sedangkan dashboard menampilkan **Workers Builds Configuration**. Token ini memantau Builds API; jangan mengandalkan account-scoped token atau memberi izin write yang tidak diperlukan. Klik **Continue to summary → Create Token**, lalu simpan token melalui prompt secret runtime `CLOUDFLARE_BUILDS_READ_TOKEN`. Token GitHub browser hanya dikirim ke endpoint Worker/GitHub; tidak diteruskan ke Cloudflare.
4. Catat **Account ID** dan **Worker tag**. Worker tag adalah ID script 32 digit heksadesimal yang dipakai Builds API, **bukan** nama `smtmtc-blog`, build UUID, atau version ID. Pemilik dapat mengambil tag dari detail script/Workers API akun, misalnya respons daftar script `GET /accounts/<account_id>/workers/scripts` untuk `id: smtmtc-blog` (field `tag`) dengan akses pengelolaan yang dimilikinya. Jangan memperluas izin token CI Read hanya untuk mencari tag. Nilai nyata `CLOUDFLARE_ACCOUNT_ID` dan `CLOUDFLARE_WORKER_TAG` untuk `smtmtc-blog` sudah terpasang pada `vars` di `wrangler.jsonc`; keduanya ID nonrahasia. Jika memindahkan Worker ke akun/script lain, perbarui kedua nilai sebelum deployment. Untuk Wrangler lokal, contoh ada di `.env.example` dan nilainya dapat diisi dalam `.dev.vars` yang diabaikan Git.
5. Masukkan dua secret melalui prompt Wrangler, lalu lakukan deployment kode/config awal secara manual saat siap. Secrets dan ID harus menjadi binding **runtime**, bukan hanya build environment. Pertahankan secrets OAuth yang sudah dipasang. Perubahan secret dapat menerbitkan versi konfigurasi Worker.

```powershell
node scripts/run.mjs wrangler secret put CMS_DEPLOY_HOOK_URL
node scripts/run.mjs wrangler secret put CLOUDFLARE_BUILDS_READ_TOKEN
npm.cmd run check
npm.cmd test
npm.cmd run deploy
```

Perintah di atas benar-benar mengubah Cloudflare ketika dijalankan pemilik; nilai secret hanya masuk prompt. Periksa nama/account Worker sebelum melanjutkan. Endpoint yang belum lengkap mengembalikan 503 dengan petunjuk setup. `POST /api/cms/deploy` dan `GET /api/cms/deploy/status` memeriksa token bearer GitHub, akun `yannn-hash`, repo persis `yannn-hash/blog`, dan izin push pada setiap permintaan. Origin harus sesuai `CMS_ORIGIN`; POST dari origin lain ditolak. Endpoint hanya memanggil hook yang dikonfigurasi serta daftar builds pada account/tag runtime. Metadata mentah build (yang bisa berisi variabel environment) dan secrets tidak dikirim ke browser.

Sebelum POST hook, Worker mencari build aktif `main`; jika ada, editor mengikuti build tersebut. API list dibaca dengan pagination dan anggaran pemindaian sepuluh detik; jika listing tidak lengkap/terlalu besar/lambat, pemicu gagal tertutup dan meminta pemeriksaan status/dashboard. Tidak ada batas tetap jumlah halaman riwayat. Setelah ID diketahui, pemantauan memakai endpoint build langsung dan memeriksa Worker tag serta branch. Status `queued`, `initializing`, `running`, dan `stopped` beserta outcome diterjemahkan menjadi antrean, berjalan, berhasil, gagal, dibatalkan, atau dilewati. Kesalahan jaringan pemantauan mempertahankan status terakhir dan tidak dianggap build gagal. Dua klik dalam satu tab/Worker isolate dibatasi, tetapi build kode atau permintaan lintas isolate dapat berlomba dengan pemeriksaan aktif. Respons hook `already_exists` diikuti sebagai build yang sama; pengaturan ini bukan jaminan transaksi global.

Jika respons POST hilang, CMS menyimpan keadaan **belum diketahui**, tidak mengulang POST otomatis, dan melanjutkan GET setelah refresh di tab yang sama. Build lama yang sudah selesai tidak menyelesaikan keadaan ini. Periksa dashboard/riwayat build, tunggu bila perlu, lalu gunakan pilihan pengakuan eksplisit di panel hanya sesudah hasil permintaan lama jelas. Jangan mencoba mengatasi kegagalan monitoring dengan mengirim Deploy berulang.

### Checklist smoke test produksi oleh pemilik

- Login sebagai `yannn-hash`; simpan dua edit artikel dan satu gambar. Pastikan ketiganya ada di `main` dan **tidak** membuat build otomatis setelah watch paths aktif.
- Klik Deploy sekali. Pastikan satu build `main` dimulai, tombol dinonaktifkan, status bergerak dari antrean/berjalan hingga hasil akhir. Refresh selama build dan pastikan tidak ada POST baru.
- Buka tautan dashboard dan cocokkan hasil build/deployment dengan situs publik. Draf/future tetap tersembunyi; artikel terbit terlihat konsisten.
- Pada artikel percobaan yang sudah dicadangkan, uji konfirmasi judul persis, path yang benar hilang, media tetap ada, dan situs publik menunggu Deploy.
- Buat commit kode yang memang ingin diterbitkan. Pastikan auto-build tetap berjalan dan pahami bahwa konten yang telah tersimpan dapat ikut.
- Simulasikan offline hanya pada browser untuk pemantauan; pastikan panel tidak menyebut build gagal dan tidak mengulang POST. Untuk hasil POST belum diketahui, periksa dashboard sebelum membuka kunci permintaan baru.

Verifikasi ini belum dijalankan terhadap akun produksi. Pengujian otomatis Worker, proxy lokal, dan browser simulasi tidak membuktikan secrets, watch paths, atau hook produksi sudah benar.

Artikel terjadwal tidak otomatis terbit ketika jam berganti: Worker menyajikan build terakhir. Jalankan build setelah waktu publikasi atau tambahkan otomatisasi build terjadwal pada tahap berikutnya jika diperlukan.

Referensi resmi: [Astro di Cloudflare](https://docs.astro.build/en/guides/deploy/cloudflare/), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [konfigurasi routing aset](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), dan [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
