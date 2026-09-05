/* ============================================================
   ProtoMacro — core/storage/cloud.js
   Supabase provider. One row per user: the full normalized state
   document. RLS (see supabase/schema.sql) restricts every row to
   its owner; the anon key alone cannot read or write anything.

   Interface matches localStorageProvider:
     load() → raw object | null
     save(raw) → {ok, error?}
   plus cloud-only: lastSync, pullRemote().
   ============================================================ */

const TABLE = 'protomacro_state';

export const supabaseCloudProvider = (client) => {
  let userId = null;

  return {
    key: 'cloud',
    label: 'Cloud (Supabase)',
    client,

    setUserId(id) {
      userId = id;
    },
    getUserId() {
      return userId;
    },

    /* Load signed-in user's document. Returns {ok, data|error}. */
    async load() {
      if (!userId) return { ok: false, error: 'not-signed-in' };
      const { data, error } = await client
        .from(TABLE)
        .select('data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, data: data?.data ?? null, updatedAt: data?.updated_at ?? null };
    },

    /* Upsert the full state document. */
    async save(raw) {
      if (!userId) return { ok: false, error: 'not-signed-in' };
      const { error } = await client.from(TABLE).upsert({
        user_id: userId,
        data: raw,
        updated_at: new Date().toISOString()
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },

    async getSession() {
      const { data } = await client.auth.getSession();
      return data?.session ?? null;
    },
    onAuthStateChange(cb) {
      return client.auth.onAuthStateChange((_event, session) => cb(session));
    },
    async signUp(email, password) {
      return client.auth.signUp({ email, password });
    },
    async signIn(email, password) {
      return client.auth.signInWithPassword({ email, password });
    },
    async signOut() {
      return client.auth.signOut();
    }
  };
};
