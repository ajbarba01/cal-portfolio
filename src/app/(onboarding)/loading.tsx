/**
 * Onboarding zone loading state — renders inside the (onboarding) layout (below
 * the persistent header) while the onboarding route resolves.
 */
import { PageLoader } from "@/components/ui/spinner";

export default function OnboardingLoading() {
  return <PageLoader label="Loading" />;
}
