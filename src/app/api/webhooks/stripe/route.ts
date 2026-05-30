import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { applyStripeEvent } from "@/features/payments/webhook-core";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} — set it in .env.local before starting the server.`,
    );
  }
  return value;
}

export async function POST(request: NextRequest) {
  // Instantiate Stripe lazily inside the handler — reading env at module load
  // breaks `next build` page-data collection when the key isn't present.
  const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-05-27.dahlia",
  });

  // Raw body MUST be read as text for signature verification — never request.json().
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      requireEnv("STRIPE_WEBHOOK_SECRET"),
    );
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  const serviceClient = createServiceClient();
  const result = await applyStripeEvent(serviceClient, {
    type: event.type,
    data: { object: event.data.object as unknown as Record<string, unknown> },
  });

  if (!result.ok) {
    console.error(`[stripe-webhook] applyStripeEvent failed: ${result.error}`);
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}
