/**
 * Thin IO layer for reading published reviews.
 * Uses the passed client (session or anon) — anon reads are allowed by RLS
 * for rows where status = 'published'.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PublishedReview {
  id: string;
  author_name: string;
  rating: number;
  body: string;
  created_at: string;
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
    .select("id, author_name, rating, body, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id as string,
    author_name: row.author_name as string,
    rating: row.rating as number,
    body: row.body as string,
    created_at: row.created_at as string,
  }));
}
