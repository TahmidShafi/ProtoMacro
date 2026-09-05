/* ============================================================
   ProtoMacro — core/storage/local.js
   localStorage provider. Same synchronous interface as cloud.js:
     load() → raw object | null
     save(raw) → {ok, error?}
   Quota errors are surfaced, never swallowed.
   ============================================================ */

const LS_KEY = 'protomacro_v1';

export const localStorageProvider = {
  key: 'local',
  label: 'This device',

  load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('[ProtoMacro] local load failed:', e);
      return null;
    }
  },

  save(raw) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(raw));
      return { ok: true };
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      return { ok: false, error: quota ? 'quota' : 'write', cause: e };
    }
  },

  clear() {
    try {
      localStorage.removeItem(LS_KEY);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }
};
