/**
 * Onboarding zone loading state — buffered page loading circle (below the
 * persistent header) while the onboarding route resolves.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function OnboardingLoading() {
  return <DelayedPageLoader />;
}
