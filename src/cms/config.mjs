export const CMS_ORIGIN = 'https://smtmtc-blog.smtmtc.workers.dev';
export function cmsConfig(hostname) {
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  return {
    load_config_file: false,
    locale: 'id',
    backend: { name: 'github', repo: 'yannn-hash/blog', branch: 'main', base_url: CMS_ORIGIN, auth_endpoint: 'api/cms/auth', auth_scope: 'public_repo' },
    ...(local ? { local_backend: { url: 'http://127.0.0.1:8081/api/v1' } } : {}),
    site_url: CMS_ORIGIN,
    display_url: CMS_ORIGIN,
    media_folder: 'public/uploads',
    public_folder: '/uploads',
    collections: [{
      name: 'blog', label: 'Artikel', label_singular: 'Artikel', folder: 'src/content/blog', create: true,
      extension: 'md', format: 'smtmtc-markdown', slug: '{{fields.filename}}',
      fields: [
        { name: 'filename', label: 'Nama file / alamat artikel', widget: 'string', required: false, hint: 'Wajib untuk artikel baru: huruf kecil, angka, tanda hubung. Artikel lama tetap memakai nama file semula.', pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Gunakan huruf kecil, angka, dan tanda hubung.'] },
        { name: 'title', label: 'Judul', widget: 'string' },
        { name: 'description', label: 'Ringkasan', widget: 'text' },
        { name: 'pubDate', label: 'Tanggal terbit (WIB)', widget: 'datetime', date_format: 'YYYY-MM-DD', time_format: false, format: 'YYYY-MM-DD', picker_utc: true },
        { name: 'tags', label: 'Topik', widget: 'list', required: false, default: [], field: { name: 'tag', label: 'Topik', widget: 'string', pattern: ['^[a-z0-9]+(?:-[a-z0-9]+)*$', 'Gunakan huruf kecil, angka, dan tanda hubung.'] } },
        { name: 'draft', label: 'Simpan sebagai draf', widget: 'boolean', default: true },
        { name: 'example', label: 'Artikel contoh', widget: 'boolean', default: false },
        { name: 'body', label: 'Isi artikel', widget: 'markdown' },
      ],
    }],
  };
}
