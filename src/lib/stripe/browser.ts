import { loadStripe, type Stripe, type Appearance } from "@stripe/stripe-js";

/** Module-scope singleton — loadStripe must be called once, outside render. */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error(
        "Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — set it in .env.local.",
      );
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

/**
 * PaymentElement appearance, mapped to the "Trail" design tokens. Stripe's
 * iframe can't read our CSS vars, so the semantic token values are RESOLVED to
 * concrete values here — keep in sync with src/app/globals.css. Values below are
 * the light-theme resolutions (dark-mode appearance theming is a later refinement):
 *   colorBackground #ffffff  → --card / --popover (sand-0)
 *   colorText       #2b2520  → --foreground (sand-900)
 *   colorTextSecondary #6e6354 → --muted-foreground (sand-500)
 *   colorPrimary    #ae5a35  → --brand (clay-fill)
 *   colorDanger     #cf3b2e  → --destructive (warm red)
 *   borderRadius    6px      → --radius (0.375rem)
 *   .Input border   #e7decf  → --input (sand-200)
 *   focus ring      #8a4226  → --ring (clay-strong); visible focus = a11y floor
 */
export const paymentAppearance: Appearance = {
  theme: "stripe",
  variables: {
    fontFamily: '"Public Sans", system-ui, sans-serif',
    borderRadius: "6px",
    colorBackground: "#ffffff",
    colorText: "#2b2520",
    colorTextSecondary: "#6e6354",
    colorPrimary: "#ae5a35",
    colorDanger: "#cf3b2e",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      border: "1px solid #e7decf",
      boxShadow: "none",
    },
    ".Input:focus": {
      border: "1px solid #8a4226",
      boxShadow: "0 0 0 1px #8a4226",
    },
    ".Label": {
      color: "#6e6354",
    },
  },
};
