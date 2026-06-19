---
name: rover-sync
description: Use when adding, editing, or removing Rover-imported reviews on the site — reconciling the rover-reviews source file into the database for local or prod. Triggers on "/rover-sync", "sync rover reviews", "add a rover review", or "import a Rover review".
---

# rover-sync

Reconciles Rover-imported reviews from the code-owned source file into the
`reviews` table. The file is the source of truth; the script makes the DB match.
See the `reviews` entry in `docs/DESIGN.md` for the data model.

## Workflow

1. **Edit** `src/content/rover-reviews.ts` — add / change / remove entries in
   `ROVER_REVIEWS`. Each entry needs a stable `key` (kebab slug), `author`,
   `rating` (1–5), `date` (`YYYY-MM-DD`, the original Rover date), and `body`.
   `ROVER_PROFILE_URL` is the single "View on Rover" link for every card.
2. **Sync** — pick the target explicitly:
   - **Local:** `npm run rover:sync`
   - **Prod:** `npm run rover:sync:prod`

   The script prints which DB it hit (`local` / `PROD`) and a summary:
   `+added ~updated -removed`. Reconcile is keyed on `external_key`:
   new key → insert, existing key → update, key gone from file → delete.
   It only ever touches `source = 'rover'` rows; native client reviews are never
   read or modified.

## Hard rules

- **Never rename or reuse a `key`** — that deletes the old row and inserts a new
  one (losing its DB id). Pick a key once and keep it.
- **Prod prerequisites:** the migration must already be applied to prod, and
  `.env.production.local` must hold the prod `NEXT_PUBLIC_SUPABASE_URL` +
  `SUPABASE_SECRET_KEY`. Run the migration push first, then `rover:sync:prod`.
- **Sync local after editing** so `/reviews` reflects the file in dev.
- Don't hand-insert rover rows in SQL — let the script own `external_key`,
  `source`, `status`, and the null `client_id` invariant (the CHECK enforces it).
- Editing the file alone does nothing until you run the sync.
