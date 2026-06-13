/**
 * Auth zone loading state — renders inside the (auth) layout's centered `<main>`
 * while a login/signup route resolves. The header stays mounted above it.
 */
import { PageLoader } from "@/components/ui/spinner";

export default function AuthLoading() {
  return <PageLoader label="Loading" />;
}
