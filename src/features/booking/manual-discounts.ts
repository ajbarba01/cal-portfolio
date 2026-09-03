/**
 * Pure manual-discount helpers.
 *
 * A manual discount is a `pct_discount` or `flat_per_night_toggle` modifier a
 * service's pricing config marks `manual: true`. The quote engine applies one
 * only when the booking's `enabledManualIds` names it, so Cal decides per
 * booking whether it comes off the price. That is the mechanism the Kiche
 * discount was built on, generalized here to every manual modifier a config
 * carries (Kiche, off-leash, vetted second dog, Friends & Family,
 * Complimentary).
 *
 * These helpers are the pure core behind the admin apply action: listing the
 * discounts a booking can carry, re-quoting its frozen quote with one of them
 * toggled, and computing any refund owed when a now-lower total drops below
 * what the client already paid.
 *
 * No IO, no clock reads (ENGINEERING #5).
 */

import { quote } from "@/features/pricing";
import type { Modifier, QuoteBreakdown, QuoteInput } from "@/features/pricing";

/** Id of the Kiche discount — Cal's own dog tagging along on a booking. */
export const KICHE_ID = "kiche";

/**
 * Id of the discount that also zeroes travel.
 *
 * Travel is the last quote phase and is never discounted, so a 100% discount on
 * its own still leaves the mileage line standing. A complimentary booking is
 * free end to end, so the miles go too (DECISIONS 4).
 */
export const COMPLIMENTARY_ID = "complimentary";

/** One manual discount a booking's config offers: the id to toggle, Cal's label. */
export interface ManualDiscount {
  id: string;
  label: string;
}

/**
 * The manual discounts declared by a modifier list, in config order. Labels come
 * from the config rows themselves, so the wording Cal sees is the wording the
 * database holds.
 */
export function manualDiscounts(
  modifiers: readonly Modifier[],
): ManualDiscount[] {
  return modifiers.flatMap((mod) =>
    (mod.kind === "pct_discount" || mod.kind === "flat_per_night_toggle") &&
    mod.manual === true
      ? [{ id: mod.id, label: mod.label }]
      : [],
  );
}

/**
 * Whether a STORED QuoteInput's frozen config carries a manual modifier with the
 * given id — the modifier-config replacement for the old per-pricing-type
 * support check. Tolerant of malformed or legacy stored inputs (returns false
 * rather than throwing). Pure.
 */
export function quoteInputSupportsManual(
  storedQuoteInput: unknown,
  id: string,
): boolean {
  const modifiers = (storedQuoteInput as Partial<QuoteInput> | null)?.config
    ?.modifiers;
  if (!Array.isArray(modifiers)) return false;
  return manualDiscounts(modifiers).some((discount) => discount.id === id);
}

/**
 * The stored id set with `id` switched on or off. Set-based, so re-applying an
 * id already enabled is a no-op and no duplicate ever reaches the engine.
 */
export function toggleManualIds(
  current: readonly string[] | undefined,
  id: string,
  on: boolean,
): string[] {
  const next = new Set(current ?? []);
  if (on) next.add(id);
  else next.delete(id);
  return [...next];
}

/**
 * The Cal-set parts of a STORED quote input: the manual discounts applied to the
 * booking and any one-off adjustment recorded on it. Both survive a re-quote, so
 * an unrelated edit cannot undo a price Cal set by hand.
 *
 * Reads jsonb straight off the database, so anything of the wrong shape (legacy
 * `{}`, a hand-edited row) contributes nothing rather than throwing. Pure.
 */
export function storedManualInputs(storedQuoteInput: unknown): {
  enabledManualIds: string[];
  customAdjustments: QuoteInput["customAdjustments"];
} {
  const stored = storedQuoteInput as Partial<QuoteInput> | null;
  const ids = stored?.enabledManualIds;
  const adjustments = stored?.customAdjustments;
  return {
    enabledManualIds: Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === "string")
      : [],
    customAdjustments: Array.isArray(adjustments) ? adjustments : undefined,
  };
}

/**
 * A quote input carrying exactly `ids` as its enabled manual discounts, with the
 * Complimentary travel rule applied: travel is quoted after every discount, so
 * the miles themselves are dropped rather than discounted.
 *
 * QUOTE TIME ONLY — wrap the call to `quote()`, never the input a booking is
 * frozen with. The miles are a fact about the trip; a stored input that has lost
 * them cannot re-price the travel line when Cal removes the discount.
 */
export function withManualIds(
  input: QuoteInput,
  ids: readonly string[],
): QuoteInput {
  const enabledManualIds = [...new Set(ids)];
  return {
    ...input,
    enabledManualIds,
    billableMiles: enabledManualIds.includes(COMPLIMENTARY_ID)
      ? 0
      : input.billableMiles,
  };
}

/**
 * Re-runs a booking's STORED quote with a single manual modifier toggled on or
 * off. The stored QuoteInput is the frozen, server-written quote — re-quoting it
 * changes only the toggled manual line (no travel/premium/settings
 * re-derivation), so the price delta is exactly the discount Cal is applying or
 * removing, and any other manual discount already on the booking survives. Pure.
 */
export function requoteWithManual(
  storedQuoteInput: QuoteInput,
  id: string,
  on: boolean,
): QuoteBreakdown {
  return quote(
    withManualIds(
      storedQuoteInput,
      toggleManualIds(storedQuoteInput.enabledManualIds, id, on),
    ),
  );
}

/**
 * Cents to refund when a new (lower) total drops below what the client already
 * paid — the overpayment created by applying a discount post-payment. Clamps to
 * 0 (removing a discount raises the total → no refund; an underpayment is
 * surfaced by the owing system, never auto-charged here).
 */
export function manualOverpayRefundCents(
  paidCents: number,
  newFinalCents: number,
): number {
  return Math.max(0, paidCents - newFinalCents);
}

/** Numbers the admin discount switch needs to render its apply/remove confirm. */
export interface ManualDiscountPreview {
  /** Which manual modifier this preview is for. */
  id: string;
  /** Current applied state (drives the switch). */
  applied: boolean;
  /** The booking's total as it stands now. */
  currentFinalCents: number;
  /** What the total becomes if the switch is flipped. */
  toggledFinalCents: number;
  /** Refund issued if applying now to an already-paid booking; 0 otherwise. */
  refundIfApplyCents: number;
  /** Amount the client has already paid. */
  paidCents: number;
}

/**
 * Builds one discount switch's preview numbers from a booking's STORED quote, or
 * returns null when that quote cannot be re-priced or does not carry the
 * discount at all.
 *
 * The stored `quote_inputs` is jsonb (typed `unknown` at the DB edge): seeded or
 * legacy bookings can carry `{}` or otherwise malformed shapes, on which
 * `quote()` throws. Because the admin edit page computes this preview at render,
 * an uncaught throw there crashes the whole page. Returning null lets the page
 * omit the switch instead — there is nothing coherent to re-price, so the
 * apply/remove action would be meaningless anyway. Pure.
 */
export function manualDiscountPreview(args: {
  quoteInputs: unknown;
  modifierId: string;
  applied: boolean;
  currentFinalCents: number;
  paidCents: number;
}): ManualDiscountPreview | null {
  if (!quoteInputSupportsManual(args.quoteInputs, args.modifierId)) return null;

  let toggled: QuoteBreakdown;
  try {
    // Guarded above: the stored input carries a modifier list holding this id.
    toggled = requoteWithManual(
      args.quoteInputs as QuoteInput,
      args.modifierId,
      !args.applied,
    );
  } catch {
    return null;
  }

  return {
    id: args.modifierId,
    applied: args.applied,
    currentFinalCents: args.currentFinalCents,
    toggledFinalCents: toggled.finalCents,
    // Refund only matters when applying (removing raises the total).
    refundIfApplyCents: args.applied
      ? 0
      : manualOverpayRefundCents(args.paidCents, toggled.finalCents),
    paidCents: args.paidCents,
  };
}

/** One switch on the admin discount list: a preview plus the label Cal reads. */
export interface ManualDiscountRow extends ManualDiscountPreview {
  label: string;
}

/**
 * Every manual discount a service offers that this booking can actually carry,
 * with its current state and the numbers its confirm dialog needs.
 *
 * Two discounts are dropped from the list rather than shown as refusals: one the
 * booking's frozen quote cannot re-price (the service declared it after this
 * booking froze its config, so applying it would be refused), and Kiche on a
 * booking the client has not marked Kiche welcome. What is left is exactly the
 * set the apply action accepts.
 *
 * @param modifiers - the service's CURRENT modifier list, which names the
 * discounts and their labels; whether the booking can carry one is decided by
 * its own frozen quote.
 */
export function manualDiscountRows(args: {
  modifiers: readonly Modifier[];
  quoteInputs: unknown;
  kicheApplied: boolean;
  kicheWelcome: boolean;
  currentFinalCents: number;
  paidCents: number;
}): ManualDiscountRow[] {
  const { enabledManualIds } = storedManualInputs(args.quoteInputs);

  return manualDiscounts(args.modifiers).flatMap((discount) => {
    if (discount.id === KICHE_ID && !args.kicheWelcome) return [];
    const preview = manualDiscountPreview({
      quoteInputs: args.quoteInputs,
      modifierId: discount.id,
      // Kiche's applied state is its own column (the edit re-quote reads it);
      // every other manual discount lives in the frozen input's id list.
      applied:
        discount.id === KICHE_ID
          ? args.kicheApplied
          : enabledManualIds.includes(discount.id),
      currentFinalCents: args.currentFinalCents,
      paidCents: args.paidCents,
    });
    return preview ? [{ ...preview, label: discount.label }] : [];
  });
}
