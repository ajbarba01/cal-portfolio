import { SignupCard } from "./_components/signup-card";

/**
 * Create account. Nothing here reads the request — `?returnTo=` is read
 * client-side by the parts that need it — so the page prerenders
 * (ENGINEERING §13).
 */
export default function SignupPage() {
  return <SignupCard />;
}
