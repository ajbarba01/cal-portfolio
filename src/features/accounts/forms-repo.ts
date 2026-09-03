/**
 * Read side of `form_responses`: one place that knows which columns a response
 * read needs and how a stored row maps onto the scope key its readers look up.
 *
 * The scope key is the registry's rule, not a string convention: an
 * account-scoped form owns one row per client and keys by `form_key` alone; a
 * pet-scoped form owns one row per pet and keys by `form_key:pet_id`. Both the
 * profiles page and the booking requirement gate used to spell that rule out
 * inline, in two shapes that disagreed about rows the write path forbids.
 *
 * The caller supplies the client, so this module stays free of Next.js and of
 * the session/service decision — the profiles page reads under the caller's own
 * RLS, the booking page reads through the service role.
 */

import type { PostgrestError } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { DbClient } from "@/lib/supabase/db-client";

import { formRegistry, type FormKey } from "./form-registry";

/** Canonical column list for a `form_responses` read. Selects derive from this, never from a literal. */
export const FORM_RESPONSE_COLUMNS = "id, form_key, pet_id, data, submitted_at";

/**
 * A `form_responses` row as selected by {@link FORM_RESPONSE_COLUMNS}. Every
 * column but `data` is projected out of the generated schema, so dropping one
 * from either the table or the select list is a compile error.
 *
 * `form_key` is bare text rather than a {@link FormKey}: the column has no
 * check constraint and still holds keys the registry has retired, which is
 * exactly what {@link formResponseKey} exists to filter. `pet_id` is null for
 * account-scoped forms and the owning pet for pet-scoped ones.
 */
export interface FormResponseRow extends Pick<
  Database["public"]["Tables"]["form_responses"]["Row"],
  "id" | "form_key" | "pet_id" | "submitted_at"
> {
  /**
   * The stored jsonb payload. Narrower than the generated `Json` because the
   * only writer, `runSubmitForm`, parses against a registry object schema
   * before it writes, so the column holds an object or nothing.
   */
  data: Record<string, unknown>;
}

/** One client's stored responses, indexed by {@link formResponseKey}. */
export type ClientFormResponses = Record<string, FormResponseRow | undefined>;

/** Supabase-shaped so a caller can destructure `error` like any other read. */
export interface ListClientFormsResult {
  data: ClientFormResponses;
  error: PostgrestError | null;
}

/**
 * The scope key a stored response answers to, or null when the row has no scope
 * the registry recognizes.
 *
 * Null covers three cases, all of which a reader must ignore rather than guess
 * at: a `form_key` the registry has retired (`home` and `pet` predate the
 * per-service split and may still sit in the table), and either half of a
 * scope/`pet_id` contradiction. `runSubmitForm` rejects both contradictions on
 * write, so honouring one here would let an impossible row shadow the real one.
 */
export function formResponseKey(
  row: Pick<FormResponseRow, "form_key" | "pet_id">,
): string | null {
  // hasOwn, not a plain lookup: `form_key` is stored text, and every
  // Object.prototype name would otherwise resolve to a truthy non-entry.
  if (!Object.hasOwn(formRegistry, row.form_key)) return null;
  const { scope } = formRegistry[row.form_key as FormKey];

  if (scope === "account") return row.pet_id ? null : row.form_key;
  return row.pet_id ? `${row.form_key}:${row.pet_id}` : null;
}

/** Index stored responses by scope key, dropping the ones with no scope. */
export function keyFormResponses(rows: FormResponseRow[]): ClientFormResponses {
  const byKey: ClientFormResponses = {};
  for (const row of rows) {
    const key = formResponseKey(row);
    if (key !== null) byKey[key] = row;
  }
  return byKey;
}

/**
 * List one client's stored form responses, indexed by scope key.
 *
 * A failed read returns an empty lookup alongside the error: to a reader, an
 * empty lookup is indistinguishable from a client who has filled nothing in, so
 * the error is the only thing that separates the two.
 */
export async function listClientForms(
  client: DbClient,
  clientId: string,
): Promise<ListClientFormsResult> {
  const { data, error } = await client
    .from("form_responses")
    .select(FORM_RESPONSE_COLUMNS)
    .eq("client_id", clientId);

  if (error) return { data: {}, error };

  // The one surviving cast: `data` is generated as `Json`, and narrowing it to
  // the object every writer stores is a claim the type system cannot check here
  // (see FormResponseRow). Every other column is checked against the schema.
  return {
    data: keyFormResponses((data ?? []) as FormResponseRow[]),
    error: null,
  };
}
