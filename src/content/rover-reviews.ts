/**
 * Rover-sourced reviews — the single edit surface for imported Rover testimonials.
 *
 * This file is the source of truth. To add / edit / remove a Rover review,
 * change the `ROVER_REVIEWS` array below, then run `npm run rover:sync` (see
 * `scripts/rover-sync/`) to reconcile the `reviews` table:
 *   - new `key`          → row inserted
 *   - changed fields     → row updated
 *   - removed `key`      → row deleted
 *
 * Rover rows are minted only by the service-role sync script — clients cannot
 * create them (RLS insert requires `client_id = auth.uid()`, and Rover rows
 * carry a null `client_id`). The "View on Rover" link is one site-wide URL.
 */

/** The single Rover profile/reviews URL every imported review links to. */
// TODO(cal): replace with Cal's real Rover profile URL.
export const ROVER_PROFILE_URL = "https://www.rover.com/sit/alyb82516";

export interface RoverReviewEntry {
  /**
   * Stable identity, e.g. "priya-s-2026-03". Persisted as `reviews.external_key`
   * and used to match file ⇄ row on sync. NEVER rename or reuse a key — doing so
   * deletes the old row and inserts a new one (losing its DB id).
   */
  key: string;
  /** Reviewer's display name as shown on the card. */
  author: string;
  /** Whole-star rating, 1–5. */
  rating: number;
  /** Original Rover review date, "YYYY-MM-DD". Drives the newest-first sort. */
  date: string;
  /** The review text. */
  body: string;
}

export const ROVER_REVIEWS: RoverReviewEntry[] = [
  // Example entry — replace with Cal's real Rover reviews:
  // {
  //   key: "priya-s-2026-03",
  //   author: "Priya S.",
  //   rating: 5,
  //   date: "2026-03-14",
  //   body: "Used Cal through Rover for two house-sits last year. Detailed updates, spotless house, and the dogs adored him.",
  // },
  {
    key: "kevin-m-2026-08",
    author: "Kevin M.",
    rating: 5,
    date: "2026-08-10",
    body: "Cal was able to watch Zoe on short notice and did an amazing job. Cal's communication was always super fast and they left the house in great shape. I would definitely work with Cal again!",
  },
];
