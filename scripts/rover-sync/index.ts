/**
 * rover:sync — reconcile the `reviews` table's Rover rows to match the
 * `src/content/rover-reviews.ts` source file.
 *
 *   added   = key in file, not yet in DB
 *   updated = key in both (fields overwritten from file)
 *   removed = key in DB, no longer in file
 *
 * Only `source = 'rover'` rows are touched; native client reviews are never read
 * or modified. Run via `npm run rover:sync` (local) or `npm run rover:sync:prod`.
 */

import { makeTarget } from "./client";
import {
  ROVER_REVIEWS,
  type RoverReviewEntry,
} from "../../src/content/rover-reviews";

/** Fail fast on malformed entries before touching the DB. */
function validate(entries: RoverReviewEntry[]): void {
  const seen = new Set<string>();
  for (const e of entries) {
    const where = `rover review "${e.key || "(missing key)"}"`;
    if (!e.key || !/^[a-z0-9-]+$/.test(e.key)) {
      throw new Error(`${where}: key must be a non-empty kebab slug`);
    }
    if (seen.has(e.key)) throw new Error(`${where}: duplicate key`);
    seen.add(e.key);
    if (!Number.isInteger(e.rating) || e.rating < 1 || e.rating > 5) {
      throw new Error(`${where}: rating must be an integer 1–5`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
      throw new Error(`${where}: date must be YYYY-MM-DD`);
    }
    if (!e.author.trim()) throw new Error(`${where}: author is required`);
    if (!e.body.trim()) throw new Error(`${where}: body is required`);
  }
}

async function main(): Promise<void> {
  validate(ROVER_REVIEWS);

  const { db, label, host } = makeTarget();
  console.log(`rover:sync → ${label} (${host})`);

  // Existing Rover keys in the DB (only ever touch source = 'rover').
  const { data: existing, error: readErr } = await db
    .from("reviews")
    .select("external_key")
    .eq("source", "rover");
  if (readErr) throw new Error(`read existing: ${readErr.message}`);

  const existingKeys = new Set(
    (existing ?? []).map((r) => r.external_key as string),
  );
  const fileKeys = new Set(ROVER_REVIEWS.map((e) => e.key));

  const added = ROVER_REVIEWS.filter((e) => !existingKeys.has(e.key));
  const updated = ROVER_REVIEWS.filter((e) => existingKeys.has(e.key));
  const removed = [...existingKeys].filter((k) => !fileKeys.has(k));

  // Upsert every file entry by its stable key.
  if (ROVER_REVIEWS.length > 0) {
    const rows = ROVER_REVIEWS.map((e) => ({
      external_key: e.key,
      source: "rover" as const,
      client_id: null,
      status: "published" as const,
      author_name: e.author,
      rating: e.rating,
      body: e.body,
      created_at: `${e.date}T00:00:00Z`,
    }));
    const { error } = await db
      .from("reviews")
      .upsert(rows, { onConflict: "external_key" });
    if (error) throw new Error(`upsert: ${error.message}`);
  }

  // Delete Rover rows whose key left the file.
  if (removed.length > 0) {
    const { error } = await db
      .from("reviews")
      .delete()
      .eq("source", "rover")
      .in("external_key", removed);
    if (error) throw new Error(`delete: ${error.message}`);
  }

  console.log(
    `done — +${added.length} added, ~${updated.length} updated, -${removed.length} removed`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
