/* ============================================================
   ProtoMacro — core/auth.js
   Optional account system. Guest by default; accounts only for
   cloud backup + cross-device sync. Env-gated: with no Supabase
   config the UI explains cloud is unavailable and guest mode
   continues to work fully.
   ============================================================ */
import { cloudConfigured, getCloudProvider, setAccountMode, setGuestMode } from './storage/index.js';
import { openModal, formModal } from './modal.js';
import { toast } from '../utils.js';
import { emit } from './bus.js';

let session = null;
let provider = null;
let authUnsub = null;

export const isSignedIn = () => !!session;
export const getUserEmail = () => session?.user?.email ?? null;

export async function initAuth() {
  if (!cloudConfigured()) return;
  provider = await getCloudProvider();
  if (!provider) return;

  const existing = await provider.getSession();
  if (existing) {
    await adoptSession(existing);
  }
  authUnsub = provider.onAuthStateChange(async (newSession) => {
    if (newSession && !session) await adoptSession(newSession);
    if (!newSession && session) {
      session = null;
      provider.setUserId(null);
      setGuestMode();
      emit('auth:signed-out');
    }
  });
}

async function adoptSession(s) {
  session = s;
  provider.setUserId(s.user.id);
  await setAccountMode();
  emit('auth:signed-in', { userId: s.user.id });
}

export async function signOut() {
  if (!provider) return;
  await provider.signOut();
  session = null;
  provider.setUserId(null);
  setGuestMode();
  toast('Signed out — data stays on this device too.', 'info');
  emit('auth:signed-out');
}

/* ---------------- auth modal (sign in / sign up) ---------------- */

export const openAuthModal = ({ mode = 'signin' } = {}) => {
  if (!cloudConfigured()) {
    openModal({
      title: 'Cloud sync is not configured',
      body: `
        <p class="entity-sub">
          ProtoMacro runs fully offline in guest mode — nothing here requires an account.
          To enable optional cloud backup &amp; cross-device sync, the host needs to configure
          a Supabase project (<code>VITE_SUPABASE_URL</code> + <code>VITE_SUPABASE_ANON_KEY</code>).
        </p>
        <p class="disclaimer">Your data is currently stored only in this browser. Use Settings → Backup to export it manually.</p>
      `,
      actions: [{ label: 'Continue privately', class: 'btn btn-primary' }]
    });
    return;
  }

  formModal({
    title: mode === 'signup' ? 'Create account' : 'Sign in',
    fields: [
      { id: 'email', label: 'Email', type: 'email', placeholder: 'you@example.com' },
      { id: 'password', label: `Password${mode === 'signup' ? ' (6+ characters)' : ''}`, type: 'password', placeholder: '••••••••' }
    ],
    submitLabel: mode === 'signup' ? 'Create account' : 'Sign in'
  })
    .then(async (values) => {
      if (!values || !values.email || !values.password) return;
      try {
        if (mode === 'signup') {
          const { error } = await provider.signUp(values.email.trim(), values.password);
          if (error) throw error;
          toast('Account created — check your inbox if confirmation is required.', 'success');
        } else {
          const { error } = await provider.signIn(values.email.trim(), values.password);
          if (error) throw error;
        }
      } catch (e) {
        const msg = /invalid login|Invalid login/.test(e.message)
          ? 'Wrong email or password.'
          : /at least 6/.test(e.message)
            ? 'Password must be at least 6 characters.'
            : e.message;
        toast(msg, 'error');
      }
    });
};

/* ---------------- first-run choice ---------------- */

let asked = false;
export function maybeShowWelcome() {
  if (asked || !cloudConfigured() || session) return;
  try {
    if (localStorage.getItem('protomacro_welcomed')) return;
  } catch { /* private mode */ }
  asked = true;
  try {
    localStorage.setItem('protomacro_welcomed', '1');
  } catch { /* ignore */ }

  openModal({
    title: '💪 Welcome to ProtoMacro',
    body: `
      <p class="entity-sub" style="margin-bottom:14px;">
        Everything works privately on this device — no account needed, ever.
        Optionally, create an account for cloud backup and cross-device sync.
      </p>
    `,
    actions: [
      { label: 'Continue Privately', class: 'btn btn-primary' },
      { label: 'Create Account', class: 'btn btn-ghost', onClick: () => openAuthModal({ mode: 'signup' }) }
    ]
  });
}

/* ---------------- settings account card ---------------- */

export function initAccountUI(statusEl, actionsEl) {
  if (!statusEl || !actionsEl) return;

  const render = () => {
    if (!cloudConfigured()) {
      statusEl.textContent = 'Guest mode — data is stored only in this browser. (Cloud sync not configured on this deployment.)';
      actionsEl.innerHTML = '';
      return;
    }
    if (isSignedIn()) {
      statusEl.innerHTML = `Signed in as <strong>${escapeHtml(getUserEmail())}</strong> — cloud sync active.`;
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" data-account="migrate">Sync existing local data</button>
        <button type="button" class="btn btn-ghost btn-sm" data-account="signout">Sign out</button>
      `;
    } else {
      statusEl.textContent = 'Guest mode — data is stored only in this browser.';
      actionsEl.innerHTML = `
        <button type="button" class="btn btn-primary btn-sm" data-account="signup">Create Account</button>
        <button type="button" class="btn btn-ghost btn-sm" data-account="signin">Sign In</button>
      `;
    }
  };

  actionsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-account]');
    if (!btn) return;
    const action = btn.dataset.account;
    if (action === 'signin') openAuthModal({ mode: 'signin' });
    else if (action === 'signup') openAuthModal({ mode: 'signup' });
    else if (action === 'signout') signOut();
    else if (action === 'migrate') {
      import('../migration-wizard.js').then((m) => m.openMigrationWizard());
    }
  });

  render();
  window.addEventListener('auth:changed', render);
  import('./bus.js').then(({ on }) => {
    on('auth:signed-in', render);
    on('auth:signed-out', render);
  });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
