/* ============================================================
   ProtoMacro — core/bus.js
   Minimal typed-ish event bus. Replaces ad-hoc hook registries
   (mode.js goalsHooks, tracker/planner bind*Update) with one
   consistent pub/sub primitive.
   ============================================================ */

const listeners = new Map(); // event -> Set<fn>

export const on = (event, fn) => {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
};

export const off = (event, fn) => {
  const set = listeners.get(event);
  if (set) set.delete(fn);
};

export const emit = (event, payload) => {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (e) {
      console.warn(`[ProtoMacro] listener for "${event}" failed:`, e);
    }
  }
};
