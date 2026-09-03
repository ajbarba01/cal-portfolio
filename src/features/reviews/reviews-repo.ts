/**
 * Thin IO layer for reading published reviews.
 * Uses the passed client (session or anon) — anon reads are allowed by RLS
 * for rows where status = 'published'.
 */

import type { DbClient } from "@/lib/supabase/db-client";
import type { Enums } from "@/lib/supabase/database.types";
import { abbreviateAuthorName } from "./display-name";

export type ReviewSource = Enums<"review_source">;

export interface PublishedReview {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: string;
  source: ReviewSource;
}

/**
 * Returns all published reviews ordered newest-first.
 * Anon-readable via RLS (`status = 'published'`).
 *
 * Throws when the query fails. The only caller is the statically rendered
 * /reviews page: returning [] on a failed read would bake an empty wall for a
 * full ISR day, while a throw leaves the last good page in place.
 */
export async function listPublishedReviews(
  supabase: DbClient,
): Promise<PublishedReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, author_name, rating, body, created_at, source")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Published reviews read failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...row,
    // Public surfaces (wall + SEO JSON-LD) only ever see first name + last
    // initial — full surnames never leave this read boundary.
    author_name: abbreviateAuthorName(row.author_name),
  }));
}
