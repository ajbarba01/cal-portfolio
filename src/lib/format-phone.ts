/**
 * Progressive US phone mask for display/input. Pure — strips non-digits, caps at
 * 10, and formats as "(AAA) BBB-CCCC", revealing punctuation as digits arrive.
 * Storage stays whatever the action persists; this is presentation only.
 */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 3) return `(${d}`;
  if (d.length === 3) return `(${d})`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
