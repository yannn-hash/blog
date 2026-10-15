import { contentActions, credentials, entryPath, isLoopback } from './actions.mjs';
import { createDeployController, deployClient } from './deploy.mjs';

const NOTICE = 'smtmtc-cms-notice';
const states = { queued: 'Build mengantre', running: 'Build berjalan', success: 'Deployment berhasil. Situs sudah diperbarui.', failure: 'Build gagal. Situs belum diperbarui; periksa log di Cloudflare.', cancelled: 'Build dibatalkan. Situs belum diperbarui.', skipped: 'Build dilewati. Situs belum diperbarui.' };
function element(document, tag, text, attributes = {}) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}
export function initializeActions(window) {
  if (window.__smtmtcActions) return window.__smtmtcActions;
  const { document } = window;
  let controller, identity, deployButton, panel, statusText, checkButton, unknownButton, dashboardLink, modal, scheduled = false, noticeSavedAt = 0;
  const buttons = new Map();
  const storage = window.sessionStorage;
  function notice(text, savedAt = 0) {
    noticeSavedAt = savedAt;
    if (panel) panel.querySelector('[data-cms-notice]').textContent = text;
  }
  function renderStatus(state) {
    if (!panel) return;
    deployButton.disabled = state.disabled;
    checkButton.disabled = state.checking || state.starting;
    unknownButton.hidden = !state.uncertain || state.starting;
    dashboardLink.hidden = !state.dashboardUrl;
    if (state.dashboardUrl) dashboardLink.href = state.dashboardUrl;
    statusText.textContent = state.starting ? 'Mengirim permintaan Deploy…' : state.uncertain ? 'Hasil permintaan Deploy belum diketahui. Periksa status atau dashboard sebelum mengizinkan permintaan baru.' : state.build ? `${states[state.build.state]} · ${state.build.id}` : state.checking ? 'Memeriksa build aktif…' : 'Simpan semua perubahan terlebih dahulu, lalu Deploy untuk memperbarui situs.';
    const error = panel.querySelector('[data-cms-deploy-error]');
    error.textContent = state.error;
    // The saved notice records a past event; the live build status describes publication now.
    if (state.build?.state === 'success' && noticeSavedAt > 0 && Date.parse(state.build.createdAt) >= noticeSavedAt) {
      const saved = panel.querySelector('[data-cms-notice]');
      saved.textContent = saved.textContent.replace('Situs publik menunggu Deploy.', 'Periksa hasilnya bersama status build di atas.');
    }
  }
  function mountHeader(root, user) {
    const header = root.querySelector('header');
    if (!header) return;
    if (deployButton && !header.contains(deployButton)) { deployButton.remove(); deployButton = null; }
    if (!deployButton) {
      deployButton = element(document, 'button', 'Deploy', { type: 'button', class: 'cms-action cms-deploy', 'data-cms-action': 'deploy' });
      const quick = [...header.querySelectorAll('button,[role="button"]')].find((button) => /quick add|tambah cepat/i.test(button.textContent));
      const account = header.querySelector('[aria-label="Account options dropdown"]');
      let branch = quick;
      while (branch?.parentElement && branch.parentElement !== header && (!account || !branch.parentElement.contains(account))) branch = branch.parentElement;
      if (branch?.parentElement && account) branch.after(deployButton);
      else (quick?.parentElement ?? header).append(deployButton);
      deployButton.addEventListener('click', () => { void controller?.start(); });
    }
    if (!panel?.isConnected) {
      panel = element(document, 'section', '', { class: 'cms-status', 'aria-label': 'Status penyimpanan dan deploy', 'data-cms-panel': '' });
      const explanation = element(document, 'p', 'Deploy menyertakan semua artikel dan media yang sudah disimpan di main. Perubahan editor yang belum disimpan tidak ikut.');
      statusText = element(document, 'p', '', { role: 'status', 'aria-live': 'polite' });
      const error = element(document, 'p', '', { role: 'status', 'data-cms-deploy-error': '' });
      const saved = element(document, 'p', '', { role: 'status', 'data-cms-notice': '' });
      checkButton = element(document, 'button', 'Periksa status', { type: 'button', class: 'cms-action' });
      unknownButton = element(document, 'button', 'Saya sudah memeriksa dashboard; izinkan Deploy baru', { type: 'button', class: 'cms-action' });
      unknownButton.hidden = true;
      dashboardLink = element(document, 'a', 'Buka build di Cloudflare', { target: '_blank', rel: 'noopener noreferrer', class: 'cms-dashboard-link' });
      dashboardLink.hidden = true;
      panel.append(explanation, statusText, error, saved, checkButton, unknownButton, dashboardLink);
      header.after(panel);
      checkButton.addEventListener('click', () => { void controller?.check(); });
      unknownButton.addEventListener('click', () => controller?.acknowledgeUnknown());
      try {
        const raw = storage.getItem(NOTICE);
        if (raw) {
          try { const saved = JSON.parse(raw); notice(saved.text ?? '', saved.savedAt ?? 0); }
          catch { notice(raw); }
        }
      } catch {}
    }
    if (user.backend === 'local') {
      deployButton.disabled = true;
      statusText.textContent = 'Mode lokal: perubahan tersimpan di komputer. Deploy tersedia setelah login GitHub di situs produksi.';
      checkButton.hidden = true;
    } else {
      checkButton.hidden = false;
      if (!controller) {
        controller = createDeployController({ client: deployClient({ token: user.token }), storage, onChange: renderStatus });
        void controller.check();
      } else renderStatus({ ...controller.getState(), disabled: !controller.getState().checked || controller.getState().starting || controller.getState().checking || controller.getState().uncertain || ['queued', 'running'].includes(controller.getState().build?.state) });
    }
  }
  function openDelete(path, trigger, user) {
    if (modal) return;
    const actions = contentActions({ user, hostname: window.location.hostname });
    const dialog = element(document, 'dialog', '', { class: 'cms-delete-dialog', 'aria-labelledby': 'cms-delete-title', 'aria-describedby': 'cms-delete-description' });
    modal = dialog;
    const heading = element(document, 'h2', 'Hapus artikel', { id: 'cms-delete-title' });
    const description = element(document, 'p', 'Memuat judul dan versi artikel…', { id: 'cms-delete-description' });
    const filename = element(document, 'code', path);
    const label = element(document, 'label', 'Ketik judul persis untuk menghapus', { for: 'cms-delete-confirm' });
    const input = element(document, 'input', '', { id: 'cms-delete-confirm', autocomplete: 'off', spellcheck: 'false' });
    input.disabled = true;
    const message = element(document, 'p', '', { role: 'status', 'aria-live': 'polite' });
    const cancel = element(document, 'button', 'Batal', { type: 'button', class: 'cms-action' });
    const remove = element(document, 'button', 'Hapus', { type: 'button', class: 'cms-action cms-danger' });
    remove.disabled = true;
    const reload = element(document, 'button', 'Muat ulang daftar', { type: 'button', class: 'cms-action' });
    reload.hidden = true;
    const footer = element(document, 'div', '', { class: 'cms-dialog-actions' });
    footer.append(cancel, remove, reload);
    dialog.append(heading, description, filename, label, input, message, footer);
    document.body.append(dialog);
    let entry, busy = false, failed = false;
    const close = () => { if (busy) return; dialog.close(); dialog.remove(); modal = null; if (trigger.isConnected) trigger.focus(); };
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    reload.addEventListener('click', () => window.location.reload());
    input.addEventListener('input', () => { remove.disabled = busy || failed || !entry || input.value !== entry.title; });
    remove.addEventListener('click', async () => {
      if (busy || failed || !entry || input.value !== entry.title) return;
      busy = true; remove.disabled = true; cancel.disabled = true; input.disabled = true;
      message.textContent = 'Menghapus artikel…';
      try {
        await actions.remove(entry);
        const text = `Penghapusan “${entry.title}” tersimpan. Media tetap tersimpan. Situs publik menunggu Deploy.`;
        const savedAt = Date.now();
        try { storage.setItem(NOTICE, JSON.stringify({ text, savedAt })); } catch {}
        notice(text, savedAt);
        // A full route reload invalidates Decap's cached collection without touching its private store.
        window.location.reload();
      } catch (error) {
        failed = true; busy = false; cancel.disabled = false; reload.hidden = false;
        message.textContent = `${error.message || 'Penghapusan belum dapat dipastikan.'} Artikel tetap ditampilkan; muat ulang untuk memeriksa hasil sebelum mencoba lagi.`;
      }
    });
    dialog.showModal(); cancel.focus();
    actions.load(path).then((value) => {
      if (modal !== dialog) return;
      entry = value;
      description.textContent = `Hapus “${entry.title}”? Penghapusan disimpan ke backend. Media tetap tersimpan dan situs publik berubah setelah Deploy.`;
      input.disabled = false; input.focus();
    }).catch((error) => { if (modal === dialog) { failed = true; message.textContent = error.message || 'Artikel belum dapat dimuat. Muat ulang daftar.'; reload.hidden = false; } });
  }
  function reconcile() {
    scheduled = false;
    const root = document.getElementById('nc-root');
    const user = credentials(window.localStorage);
    const key = user ? `${user.backend}:${user.token ?? ''}` : '';
    if (key !== identity) {
      controller?.stop(); controller = null; identity = key;
      deployButton?.remove(); deployButton = null; panel?.remove(); panel = null;
      for (const button of buttons.values()) button.remove();
      buttons.clear();
    }
    if (!root || !user || (user.backend === 'local' && !isLoopback(window.location.hostname))) return;
    mountHeader(root, user);
    for (const [anchor, button] of buttons) {
      if (!anchor.isConnected || !anchor.parentElement?.contains(button) || entryPath(anchor.href, window.location.href) !== button.dataset.cmsPath) { button.remove(); buttons.delete(anchor); }
    }
    for (const anchor of root.querySelectorAll('a[href]')) {
      const path = entryPath(anchor.href, window.location.href);
      if (!path || buttons.has(anchor)) continue;
      const host = anchor.closest('li');
      if (!host) continue;
      host.setAttribute('data-cms-entry', '');
      const button = element(document, 'button', 'Hapus', { type: 'button', class: 'cms-action cms-entry-delete', 'data-cms-action': 'delete', 'data-cms-path': path, 'aria-label': `Hapus artikel ${path.slice(17, -3)}` });
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openDelete(path, button, user); });
      host.append(button); buttons.set(anchor, button);
    }
  }
  const observer = new window.MutationObserver((records) => {
    // Ignore our text/status updates to avoid self-triggered reconciliation loops.
    if (records.every((record) => record.target.closest?.('[data-cms-panel], [data-cms-action], .cms-delete-dialog'))) return;
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(reconcile); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', reconcile);
  window.addEventListener('storage', reconcile);
  reconcile();
  const api = { refresh: reconcile, destroy() { observer.disconnect(); controller?.stop(); window.removeEventListener('hashchange', reconcile); window.removeEventListener('storage', reconcile); } };
  window.__smtmtcActions = api;
  return api;
}
