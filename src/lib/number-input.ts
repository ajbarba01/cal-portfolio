/** Pure helpers for sanitized numeric inputs (no leading zeros, clamp, step-snap). */
export function sanitizeIntInput(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d === "") return "";
  const n = parseInt(d, 10);
  return Number.isNaN(n) ? "" : String(n);
}
export function clampToStep(
  value: number,
  opts: { min: number; max: number; step: number },
): number {
  const { min, max, step } = opts;
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  const fixed = Math.round(snapped * 1e6) / 1e6;
  return Math.min(max, Math.max(min, fixed));
}
