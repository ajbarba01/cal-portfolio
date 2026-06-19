/**
 * Thin IO layer for reading published reviews.
 * Uses the passed client (session or anon) — anon reads are allowed by RLS
 * for rows where status = 'published'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { abbreviateAuthorName } from "./display-name";

export type ReviewSource = "native" | "rover";

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
 */
export async function listPublishedReviews(
  supabase: SupabaseClient,
): Promise<PublishedReview[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, author_name, rating, body, created_at, source")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    // Public surfaces (wall + SEO JSON-LD) only ever see first name + last
    // initial — full surnames never leave this read boundary.
    author_name: abbreviateAuthorName(row.author_name as string),
    rating: row.rating as number,
    body: row.body as string,
    created_at: row.created_at as string,
    source: row.source as ReviewSource,
  }));
}
