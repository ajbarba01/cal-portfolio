/**
 * Money formatting for booking surfaces.
 *
 * The canonical two-decimal formatter lives in the pricing feature; this file
 * only re-exports it so booking components keep one import path.
 */
export { centsToDollars } from "@/features/pricing";
