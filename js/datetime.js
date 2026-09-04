/* ============================================================
   ProtoMacro — datetime.js
   Single source of truth for local-date formatting.
   Always use these helpers — never toISOString() — so day keys
   stay consistent across modules regardless of timezone.
   ============================================================ */

/* Local YYYY-MM-DD for a Date (defaults to now). */
export const toDateStr = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/* Local YYYY-MM-DD for today. */
export const today = () => toDateStr(new Date());
