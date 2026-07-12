/**
 * The one server-action result contract for form submits. Server actions
 * validate with the same zod schema the client resolver uses, so
 * `fieldErrors` keys are the form's field names. `message` carries a
 * form-level (root) error. Success payloads that need data (e.g. created
 * ids) extend this shape in their own feature types.
 */
export type FormActionResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string, string>; message?: string };

/** Flatten a zod error into first-message-per-field, ready for setError. */
export function zodFieldErrors(error: {
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    if (key && !(key in out)) out[key] = issue.message;
  }
  return out;
}
