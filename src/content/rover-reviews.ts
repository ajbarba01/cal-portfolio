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
  {
    key: "elana-t-2025-08",
    author: "Elana T.",
    rating: 5,
    date: "2025-08-18",
    body: "Cal was such a kind and caring sitter for Oreo. They asked many thoughtful questions before and during their stay, which I appreciated. Oreo had an upset stomach the week of their stay, and they were patient about her issues and even took her to the vet to get her checked out and to get some medicine for her. Cal also communicated promptly every step of the way at the vet and as Oreo's condition improved. They left my house sparkling clean and Oreo seemed to be content and in a good mood when I got back. Cal was so great and I'd highly recommend them as a sitter!",
  },
  {
    key: "kevin-m-2026-08",
    author: "Kevin M.",
    rating: 5,
    date: "2025-08-10",
    body: "Cal was able to watch Zoe on short notice and did an amazing job. Cal's communication was always super fast and they left the house in great shape. I would definitely work with Cal again!",
  },
  {
    key: "jake-s-2025-03",
    author: "Jake S.",
    rating: 5,
    date: "2025-03-23",
    body: "Cal took great care of our animals on short notice. She was wonderful, very communicative throughout the trip and did an excellent job.",
  },
  {
    key: "april-m-2024-08",
    author: "April M.",
    rating: 5,
    date: "2024-08-07",
    body: "Cal is amazing! I have a very shy kitty and Cal was so helpful while I was on vacation to find her when she hid extremely well. Cal did a great job with all aspects of caring for my cats and I feel so grateful. Thank you!!",
  },
  {
    key: "ashley-h-2024-07",
    author: "Ashley H.",
    rating: 5,
    date: "2024-07-28",
    body: "Cal is an exceptional petsitter! Our two cats, who have complex food and medication needs, were perfectly cared for. Cal handled everything flawlessly, from cleaning up two hairballs to playing with them and giving them plenty of snuggles. We especially appreciated the adorable daily photos that kept us updated throughout our trip. We couldn't be happier with the care Cal provided!",
  },
  {
    key: "diane-m-2024-07",
    author: "Diane M.",
    rating: 5,
    date: "2024-07-25",
    body: "Cal did a great job watching our cats!",
  },
  {
    key: "marcia-r-2024-06",
    author: "Marcia R.",
    rating: 5,
    date: "2024-06-17",
    body: "Cal did an amazing job! Lucie was a happy dog and got all her medication, food, walk, and play needs met.",
  },
  {
    key: "lizzy-h-2024-06",
    author: "Lizzy H.",
    rating: 5,
    date: "2024-06-12",
    body: "cal is so nice, reliable and knowledgeable. I am so excited to continue working with cal!!!",
  },
  {
    key: "emily-w-2023-07",
    author: "Emily W.",
    rating: 5,
    date: "2023-07-30",
    body: "Cal did an outstanding job of taking care of my two dogs. I have an elderly German Shepherd who is a picky eater with a sensitive stomach and Cal was patient and kind with her. Cal adjusted the walk schedule so that the old dog was not pushed but the young dog got enough exercise. Cal asked appropriate questions so that I knew they were working hard to keep to the dogs' usual routine. Cal sent photos every day. I would hire Cal again in a heartbeat!",
  },
  {
    key: "madeleine-k-g-2023-07",
    author: "Madeleine K. G.",
    rating: 5,
    date: "2023-07-22",
    body: "Cal is an absolutely upstanding sitter! They took amazing care of my two great danes and my sighthound puppy. I have never felt more comfortable leaving my angels in someone else's hands. Cal took them on adventures and upkept our house and made sure to meet all of their needs. We love you Cal! I will be utilizing Cal for my sitting needs in the future. Best sitter yet!",
  },
  {
    key: "abigail-f-2023-06",
    author: "Abigail F.",
    rating: 5,
    date: "2023-06-11",
    body: "Cal was wonderful watching my dog! She was responsive and went above and beyond to make sure Carina was taken care of.",
  },
  {
    key: "jessica-f-2023-06",
    author: "Jessica F.",
    rating: 5,
    date: "2023-06-11",
    body: "Cal was such an amazing walker/ friend for our dog Rambo while we’re traveling and staying in Boulder for the week! Thank you so much for your flexibility and for caring for Rambo so much!",
  },
  {
    key: "jen-g-2022-07",
    author: "Jen G.",
    rating: 5,
    date: "2022-07-02",
    body: "Great with cats, too",
  },
  {
    key: "karim-b-2022-06",
    author: "Karim B.",
    rating: 5,
    date: "2022-06-11",
    body: "Took great care of our cats. Would hire again!",
  },
  {
    key: "nina-r-2022-05",
    author: "Nina R.",
    rating: 5,
    date: "2022-05-15",
    body: "Dependable and goes above and beyond",
  },
];
