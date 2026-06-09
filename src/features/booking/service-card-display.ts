import type { PublicService } from "@/features/booking/services-repo";
import { copy } from "@/content/marketing";

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
