import type { PublicService } from "@/features/booking/services-repo";
import type { PricingType } from "@/features/pricing";
import { copy, type CopyId } from "@/content/marketing";

function descriptionFallback(
  pricingType: PublicService["pricingType"],
): string {
  switch (pricingType) {
    case "house_sitting":
      return copy["service.house_sitting.card.body"];
    case "check_in":
      return copy["service.check_in.card.body"];
    case "walk":
      return copy["service.walk.card.body"];
    case "training":
      return copy["service.training.card.body"];
    case "meet_greet":
      return copy["service.meet_greet.card.body"];
    default: {
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Returns the card description copy, preserving a real non-empty description
 * and falling back to pricing-type-specific placeholder copy otherwise.
 */
export function serviceCardDescription(service: PublicService): string {
  if (typeof service.description === "string" && service.description.trim()) {
    return service.description;
  }

  return descriptionFallback(service.pricingType);
}

/**
 * Returns the display label for the card's default duration, if any.
 * House sitting is shown as Overnight; other services use configured minutes.
 */
export function serviceCardDurationLabel(
  service: PublicService,
): string | null {
  const { pricingType } = service;

  switch (pricingType) {
    case "house_sitting":
      return "Overnight";
    case "check_in":
    case "walk":
    case "training":
    case "meet_greet":
      return service.default_duration_min !== null
        ? `${service.default_duration_min} min`
        : null;
    default: {
      const _exhaustive: never = pricingType;
      throw new Error(`Unknown pricingType: ${String(_exhaustive)}`);
    }
  }
}

/**
 * The public (publicly bookable) pricing types — everything except meet-and-greet,
 * which is onboarding-only and never appears on the services index or a public
 * booking page (it redirects to /onboarding). The editorial copy slots below
 * exist only for these.
 */
const PUBLIC_PRICING_TYPES = [
  "house_sitting",
  "check_in",
  "walk",
  "training",
] as const;
type PublicPricingType = (typeof PUBLIC_PRICING_TYPES)[number];

function isPublicPricingType(t: PricingType): t is PublicPricingType {
  return (PUBLIC_PRICING_TYPES as readonly string[]).includes(t);
}

/** Long-form lede copy ID for a service's booking page (null for meet-and-greet). */
const DETAIL_LEDE_COPY: Record<PublicPricingType, CopyId> = {
  house_sitting: "service.house_sitting.detail.lede",
  check_in: "service.check_in.detail.lede",
  walk: "service.walk.detail.lede",
  training: "service.training.detail.lede",
};
export function serviceDetailLedeCopyId(
  pricingType: PricingType,
): CopyId | null {
  return isPublicPricingType(pricingType)
    ? DETAIL_LEDE_COPY[pricingType]
    : null;
}

/** Long-form body copy ID for a service's booking page (null for meet-and-greet). */
const DETAIL_BODY_COPY: Record<PublicPricingType, CopyId> = {
  house_sitting: "service.house_sitting.detail.body",
  check_in: "service.check_in.detail.body",
  walk: "service.walk.detail.body",
  training: "service.training.detail.body",
};
export function serviceDetailBodyCopyId(
  pricingType: PricingType,
): CopyId | null {
  return isPublicPricingType(pricingType)
    ? DETAIL_BODY_COPY[pricingType]
    : null;
}

/** "What's included" item copy IDs for a service's booking page (empty for meet-and-greet). */
const INCLUDED_COPY: Record<PublicPricingType, readonly CopyId[]> = {
  house_sitting: [
    "service.house_sitting.included.1",
    "service.house_sitting.included.2",
    "service.house_sitting.included.3",
    "service.house_sitting.included.4",
  ],
  check_in: [
    "service.check_in.included.1",
    "service.check_in.included.2",
    "service.check_in.included.3",
    "service.check_in.included.4",
  ],
  walk: [
    "service.walk.included.1",
    "service.walk.included.2",
    "service.walk.included.3",
    "service.walk.included.4",
  ],
  training: [
    "service.training.included.1",
    "service.training.included.2",
    "service.training.included.3",
    "service.training.included.4",
  ],
};
export function serviceIncludedCopyIds(
  pricingType: PricingType,
): readonly CopyId[] {
  return isPublicPricingType(pricingType) ? INCLUDED_COPY[pricingType] : [];
}
