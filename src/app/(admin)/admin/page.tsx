import { redirect } from "next/navigation";

/**
 * Admin index is not a page — the persistent sidebar is the dashboard nav.
 * Redirect to the first section so `/admin` is never a dead end.
 */
export default function AdminIndexPage() {
  redirect("/admin/availability");
}
