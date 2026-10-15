const STORAGE_KEY = 'smtmtc-cms-deploy';
const active = (build) => ['queued', 'running'].includes(build?.state);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function publicBuild(value) {
  if (!value || !uuid.test(value.id) || !['queued', 'running', 'success', 'failure', 'cancelled', 'skipped'].includes(value.state) || value.branch !== 'main' || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw new Error('Respons status build tidak valid.');
  return { id: value.id, state: value.state, branch: value.branch, createdAt: value.createdAt };
}
export function deployClient({ token, fetcher = fetch }) {
  async function request(method, id) {
    let response;
    try {
      response = await fetcher(`/api/cms/deploy${method === 'GET' ? `/status${id ? `?id=${encodeURIComponent(id)}` : ''}` : ''}`, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(35000), redirect: 'error' });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(typeof data?.error?.message === 'string' ? data.error.message : 'Permintaan deploy gagal.');
        error.code = data?.error?.code;
        // Only a known pre-trigger rejection makes a failed POST safe to repeat manually.
        error.uncertain = method === 'POST' && !['AUTH', 'AUTH_CHECK', 'ORIGIN', 'CONFIG_MISSING', 'METHOD', 'MONITOR_UNAVAILABLE'].includes(error.code);
        throw error;
      }
      const dashboardUrl = typeof data.dashboardUrl === 'string' && /^https:\/\/dash\.cloudflare\.com\/[a-f0-9]{32}\/workers\/services\/view\/smtmtc-blog\/production\/builds$/i.test(data.dashboardUrl) ? data.dashboardUrl : '';
      return { build: data.build === null ? null : publicBuild(data.build), existing: data.existing === true, dashboardUrl };
    } catch (error) {
      if (error.uncertain === undefined) error.uncertain = method === 'POST';
      throw error;
    }
  }
  return { start: () => request('POST'), status: (id) => request('GET', id) };
}
export function createDeployController({ client, storage, onChange, schedule = setTimeout, cancel = clearTimeout }) {
  let state = { build: null, uncertain: false, requestedAt: 0, dashboardUrl: '', starting: false, checking: false, error: '', checked: false };
  let timer, stopped = false, revision = 0;
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved) state = { ...state, build: saved.build ? publicBuild(saved.build) : null, uncertain: saved.uncertain === true, requestedAt: Number.isFinite(saved.requestedAt) ? saved.requestedAt : 0 };
  } catch {}
  const emit = () => {
    if (stopped) return;
    try { storage.setItem(STORAGE_KEY, JSON.stringify({ build: state.build, uncertain: state.uncertain, requestedAt: state.requestedAt })); } catch {}
    onChange({ ...state, disabled: !state.checked || state.starting || state.checking || state.uncertain || active(state.build) });
  };
  const pollLater = () => {
    cancel(timer);
    if (!stopped && (state.uncertain || active(state.build) || !state.checked)) timer = schedule(() => check(), 5000);
  };
  async function check() {
    if (stopped || state.checking || state.starting) return;
    const current = revision;
    state.checking = true; emit();
    try {
      const { build, dashboardUrl } = await client.status(state.uncertain ? undefined : active(state.build) ? state.build.id : undefined);
      if (stopped || current !== revision) return;
      if (build) {
        // A previous terminal build cannot resolve an unknown POST that may still be queued.
        if (!state.uncertain || active(build) || (build.id !== state.build?.id && Date.parse(build.createdAt) >= state.requestedAt)) {
          state.build = build;
          state.uncertain = false;
        }
      }
      if (dashboardUrl) state.dashboardUrl = dashboardUrl;
      state.error = ''; state.checked = true;
    } catch (error) { if (!stopped && current === revision) state.error = `Pemantauan belum tersedia. ${error.message} Status terakhir dipertahankan.`; }
    finally { if (!stopped && current === revision) { state.checking = false; emit(); pollLater(); } }
  }
  return {
    getState: () => ({ ...state }),
    check,
    async start() {
      if (stopped || !state.checked || state.starting || state.checking || state.uncertain || active(state.build)) return;
      revision++; cancel(timer); state.starting = true; state.uncertain = true; state.requestedAt = Date.now(); state.error = ''; emit();
      try {
        const { build, dashboardUrl } = await client.start();
        if (stopped) return;
        if (!build) throw new Error('Build belum tersedia.');
        state.build = build; state.uncertain = false;
        if (dashboardUrl) state.dashboardUrl = dashboardUrl;
      } catch (error) {
        if (stopped) return;
        state.uncertain = error.uncertain !== false;
        state.error = state.uncertain ? 'Hasil Deploy belum diketahui. Jangan kirim ulang; periksa status atau dashboard Cloudflare dahulu.' : error.message;
      } finally { if (!stopped) { state.starting = false; emit(); pollLater(); } }
    },
    // A human can unlock only after checking the dashboard. This never resends a POST.
    acknowledgeUnknown() { if (state.uncertain && !state.starting) { state.uncertain = false; state.error = ''; state.checked = false; emit(); void check(); } },
    stop() { stopped = true; revision++; cancel(timer); },
  };
}
