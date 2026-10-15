import { articleFormat, beforeSave } from './content.mjs';
import { cmsConfig } from './config.mjs';
import { initializeActions } from './ui.mjs';
import './actions.css';

const help = document.getElementById('cms-help');
window.CMS_MANUAL_INIT = true;
const script = document.createElement('script');
script.src = '/admin/vendor/decap-cms-3.17.1.js';
script.onload = () => {
  try {
    const cms = window.CMS;
    if (!cms) throw new Error('Bundle CMS tidak tersedia.');
    cms.registerCustomFormat('smtmtc-markdown', 'md', articleFormat);
    cms.registerEventListener({ name: 'preSave', handler: beforeSave });
    cms.init({ config: cmsConfig(window.location.hostname) });
    initializeActions(window);
    help.textContent = 'Editor sedang dimuat. Jika editor tidak muncul, muat ulang halaman atau periksa konsol browser.';
    setTimeout(() => { if (document.querySelector('#nc-root')?.childElementCount) help.hidden = true; }, 3000);
  } catch (error) {
    help.textContent = `Editor gagal dimuat. ${error.message} Coba muat ulang atau baca panduan CMS di repositori.`;
  }
};
script.onerror = () => { help.textContent = 'Editor gagal diunduh. Periksa koneksi lalu muat ulang halaman.'; };
document.head.append(script);
