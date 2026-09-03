/**
 * An argument-recording stand-in for a Supabase client, for tests that inject a
 * client into a core instead of reaching the local stack.
 *
 * The hand-rolled fakes this replaces returned the builder from every filter
 * method and threw the arguments away, so deleting a production predicate — an
 * `.in("night", …)`, say — left every test green. This double records each
 * builder call with its arguments, so a test can assert the query that was
 * actually issued.
 *
 * It is a stub, not a PostgREST implementation: filters never narrow the rows.
 * Configure what each chain should see and assert on the recorded calls.
 */

import type { DbClient } from "@/lib/supabase/db-client";

/** A PostgREST-shaped result. Filters do not narrow it; configure it per chain. */
export type FakeResponse = { data: unknown; error: unknown };

/**
 * One recorded builder call. `table` is the `.from()` table, the `.rpc()`
 * function name, or the storage bucket, depending on which surface was used.
 */
export type FakeCall = { table: string; method: string; args: unknown[] };

/**
 * The calls of a single `.from()` / `.rpc()` chain, in call order. Storage calls
 * are not chains and appear only in {@link FakeSupabaseControls._calls}.
 */
export type FakeQuery = { table: string; _calls: FakeCall[] };

/** Narrows a recorded-call lookup. An omitted field matches everything. */
export type FakeCallFilter = { table?: string; method?: string };

/** The assertion surface the double adds to the `SupabaseClient` it impersonates. */
export type FakeSupabaseControls = {
  /** Every recorded call across every chain, in call order. */
  readonly _calls: readonly FakeCall[];
  /** One entry per chain, so repeated reads of one table stay distinguishable. */
  readonly _queries: readonly FakeQuery[];
  /** The recorded calls matching `filter`, in call order. */
  calls(filter?: FakeCallFilter): FakeCall[];
};

/**
 * A `DbClient` as far as the code under test is concerned, plus the assertion
 * surface. The generated schema is deliberately kept: a bare `SupabaseClient`
 * defaults its schema generic, so a double typed that way would satisfy every
 * repository signature regardless of the table or column it names.
 */
export type FakeSupabaseClient = DbClient & FakeSupabaseControls;

export type FakeSupabaseOptions = {
  /**
   * Responses keyed by table name, or by function name for `.rpc()`. An array is
   * a FIFO queue: each new chain on that key takes the next entry. A key with no
   * entry, or an exhausted queue, resolves to an empty successful result.
   */
  tables?: Record<string, FakeResponse | FakeResponse[]>;
  storage?: {
    /** Builds the signed URL for a path. Defaults to `https://signed.test/<path>`. */
    signedUrl?: (path: string) => string;
    /** When set, signing fails with this error instead of returning URLs. */
    error?: unknown;
  };
};

const EMPTY_RESPONSE: FakeResponse = { data: [], error: null };

const DEFAULT_SIGNED_URL_HOST = "https://signed.test";

/** Builder methods that return the builder, so a chain keeps going. */
const CHAINABLE_METHODS = [
  "select",
  "eq",
  "neq",
  "in",
  "gte",
  "gt",
  "lte",
  "lt",
  "is",
  "order",
  "limit",
  "range",
  "insert",
  "update",
  "upsert",
  "delete",
] as const;

/** Builder methods that resolve the chain's response directly. */
const TERMINAL_METHODS = ["single", "maybeSingle"] as const;

/** Creates a Supabase client double that records every call it is given. */
export function createFakeSupabase(
  options: FakeSupabaseOptions = {},
): FakeSupabaseClient {
  const allCalls: FakeCall[] = [];
  const queries: FakeQuery[] = [];
  const queueCursors = new Map<string, number>();

  const nextResponse = (key: string): FakeResponse => {
    const configured = options.tables?.[key];
    if (configured === undefined) return EMPTY_RESPONSE;
    if (!Array.isArray(configured)) return configured;
    const index = queueCursors.get(key) ?? 0;
    queueCursors.set(key, index + 1);
    return configured[index] ?? EMPTY_RESPONSE;
  };

  const record = (call: FakeCall, query?: FakeQuery) => {
    query?._calls.push(call);
    allCalls.push(call);
  };

  const startChain = (table: string, initialCall?: FakeCall) => {
    const query: FakeQuery = { table, _calls: [] };
    queries.push(query);
    if (initialCall) record(initialCall, query);

    // Resolved once per chain: awaiting a chain twice must not shift the queue.
    let response: FakeResponse | undefined;
    const settle = () => (response ??= nextResponse(table));

    const builder: Record<string, unknown> = {};
    for (const method of CHAINABLE_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record({ table, method, args }, query);
        return builder;
      };
    }
    for (const method of TERMINAL_METHODS) {
      builder[method] = (...args: unknown[]) => {
        record({ table, method, args }, query);
        return Promise.resolve(settle());
      };
    }
    builder.then = (
      onFulfilled?: (value: FakeResponse) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(settle()).then(onFulfilled, onRejected);

    return builder;
  };

  const signedUrlFor =
    options.storage?.signedUrl ??
    ((path: string) => `${DEFAULT_SIGNED_URL_HOST}/${path}`);
  const storageError = options.storage?.error;

  const storageBucket = (bucket: string) => ({
    createSignedUrl: (path: string, expiresIn: number) => {
      record({
        table: bucket,
        method: "createSignedUrl",
        args: [path, expiresIn],
      });
      return Promise.resolve(
        storageError !== undefined
          ? { data: null, error: storageError }
          : { data: { signedUrl: signedUrlFor(path) }, error: null },
      );
    },
    createSignedUrls: (paths: string[], expiresIn: number) => {
      record({
        table: bucket,
        method: "createSignedUrls",
        args: [paths, expiresIn],
      });
      return Promise.resolve(
        storageError !== undefined
          ? { data: null, error: storageError }
          : {
              data: paths.map((path) => ({
                path,
                signedUrl: signedUrlFor(path),
                error: null,
              })),
              error: null,
            },
      );
    },
  });

  const client = {
    from: (table: string) => startChain(table),
    rpc: (fn: string, ...params: unknown[]) =>
      startChain(fn, { table: fn, method: "rpc", args: [fn, ...params] }),
    storage: { from: storageBucket },
    _calls: allCalls,
    _queries: queries,
    calls: (filter: FakeCallFilter = {}) =>
      allCalls.filter(
        (call) =>
          (filter.table === undefined || call.table === filter.table) &&
          (filter.method === undefined || call.method === filter.method),
      ),
  };

  return client as unknown as FakeSupabaseClient;
}
