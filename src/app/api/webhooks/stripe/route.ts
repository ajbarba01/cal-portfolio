import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyStripeEvent, StripeGateway } from "@/features/payments";
import { PAYMENTS_ENABLED } from "@/lib/payments-enabled";

export async function POST(request: NextRequest) {
  // Payments off sitewide: no intent is ever minted, so nothing legitimate can
  // arrive here and the Stripe env vars are not guaranteed to be set. Answer as
  // if the endpoint does not exist, before an unset key can turn into a 500 that
  // reads like an outage.
  if (!PAYMENTS_ENABLED) {
    return new NextResponse(null, { status: 404 });
  }

  // Built per request: reading Stripe env at module load breaks `next build`
  // page-data collection when the key isn't present.
  const gateway = new StripeGateway();

  // Raw body MUST be read as text for signature verification — never request.json().
  const verified = gateway.verifyWebhook(
    await request.text(),
    request.headers.get("stripe-signature"),
  );

  if (!verified.ok) {
    return new NextResponse(
      verified.reason === "missing_signature"
        ? "Missing stripe-signature header"
        : "Invalid signature",
      { status: 400 },
    );
  }

  const result = await applyStripeEvent(
    createServiceClient(),
    verified.event,
    gateway,
  );

  if (!result.ok) {
    console.error(`[stripe-webhook] applyStripeEvent failed: ${result.error}`);
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
