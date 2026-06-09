import type { PublicService } from "@/features/booking/services-repo";

function descriptionFallback(
  pricingType: PublicService["pricingType"],
): string {
  switch (pricingType) {
    case "house_sitting":
      return "[[BODY: short house-sitting service description]]";
    case "check_in":
      return "[[BODY: short check-in service description]]";
    case "walk":
      return "[[BODY: short walk service description]]";
    case "training":
      return "[[BODY: short training service description]]";
    case "meet_greet":
      return "[[BODY: short meet-and-greet service description]]";
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
