import "server-only";
import { cache } from "react";
import { createClient } from "./server";

/**
 * Per-request memoized auth read. React `cache()` dedupes within a single
 * server request, so the layout, page, and any helper that call this share one
 * `auth.getUser()` round trip instead of re-fetching per component.
 */
export const getCachedUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
});
