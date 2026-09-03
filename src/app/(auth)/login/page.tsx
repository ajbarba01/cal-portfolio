import { AuthCard } from "../_components/auth-card";
import { AuthSwitchLink } from "../_components/auth-switch-link";
import { LoginForm } from "./_components/login-form";

/**
 * Sign in. Nothing here reads the request: `?returnTo=` and `?error=` are read
 * client-side by the parts that need them, so the page prerenders (ENGINEERING
 * §13) and a visitor sent back by `/claim` or the auth callback still gets the
 * form in the first paint.
 */
export default function LoginPage() {
  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back."
      footer={
        <>
          No account? <AuthSwitchLink href="/signup">Sign up</AuthSwitchLink>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
