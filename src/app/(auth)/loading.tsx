/**
 * Auth zone loading state — buffered page loading circle inside the (auth)
 * layout's centered `<main>` while a login/signup route resolves.
 */
import { DelayedPageLoader } from "@/components/ui/delayed-page-loader";

export default function AuthLoading() {
  return <DelayedPageLoader />;
}
