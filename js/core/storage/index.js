/* ============================================================
   ProtoMacro — core/storage/index.js
   Storage facade. Feature modules NEVER touch localStorage —
   they call saveState()/STATE from state.js, which routes here.

   Provider selection:
   - guest (default): localStorageProvider
   - account: cloudProvider (Supabase) — only when env-configured
     AND the user signed in AND migration confirmed.

   Exposes mode so the UI can render the sync-status pill.
   ============================================================ */

import { localStorageProvider } from './local.js';

/* Env-gated Supabase config (anon key only — safe for browser) */
export const cloudConfig = {
  url: (import.meta.env?.VITE_SUPABASE_URL || '').trim(),
  anonKey: (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim()
};
export const cloudConfigured = () => !!(cloudConfig.url && cloudConfig.anonKey);

let cloudProvider = null; // lazy — only constructed after user opts in

export async function getCloudProvider() {
  if (!cloudConfigured()) return null;
  if (!cloudProvider) {
    const { createClient } = await import('@supabase/supabase-js');
    const { supabaseCloudProvider } = await import('./cloud.js');
    cloudProvider = supabaseCloudProvider(
      createClient(cloudConfig.url, cloudConfig.anonKey)
    );
  }
  return cloudProvider;
}

let active = localStorageProvider;

export const storageMode = () => active.key;

export const setGuestMode = () => {
  active = localStorageProvider;
};

export const setAccountMode = async () => {
  const provider = await getCloudProvider();
  if (!provider) return false;
  active = provider;
  return true;
};

export const getProvider = () => active;
export const localProvider = localStorageProvider;
