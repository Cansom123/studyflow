/* ===========================
   BACKUP-CODE CRYPTO UTILITIES (pure functions, no app state)
   Eighth module in the multi-file split. The recovery path when email is
   too rate-limited to rely on (Supabase's shared sender caps out fast).
   Codes are random, hashed with SHA-256 before they ever leave the
   browser, and each is single-use so a leaked code can't be replayed.
   Both functions use only the standard Web Crypto API -- no reads from
   cachedAssignments/USER_ID/the DOM, which is what makes them safe to pull
   out, same as every other module in this split.
=========================== */

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomBackupCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.slice(0, 4) + '-' + hex.slice(4, 8) + '-' + hex.slice(8, 10);
}
