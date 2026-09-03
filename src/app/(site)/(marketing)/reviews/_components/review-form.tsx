"use client";

/**
 * Client-side review submission form.
 * Submission requires auth — submitReview returns { ok: false } for anon.
 */

import { useEffect, useState } from "react";
import { useController } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { TextLink } from "@/components/ui/text-link";
import { Textarea } from "@/components/ui/textarea";
import { CharCounter } from "@/components/ui/char-counter";
import { ShimmerCard } from "@/components/ui/shimmer-card";
import { StarRatingInput } from "@/components/ui/star-rating";
import { createClient } from "@/lib/supabase/client";
import { submitReview } from "@/features/reviews";
import { FIELD_LIMITS } from "@/lib/field-limits";
import {
  useAppForm,
  Form,
  FormRootError,
  submitAction,
} from "@/components/form";
import type { FormActionResult } from "@/lib/form-action-result";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .min(1, "Write a few words first")
    .max(FIELD_LIMITS.note),
});

export function ReviewForm() {
  // Auth resolves browser-side so this page (and /reviews) can render statically.
  // null = unresolved; render nothing until known to avoid a wrong-state flash.
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const form = useAppForm(reviewSchema, {
    defaultValues: { rating: 5, body: "" },
  });
  const rating = useController({ name: "rating", control: form.control });
  const body = form.watch("body");

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    // getSession() is the local cookie read (no network on HS256).
    supabase.auth.getSession().then(({ data }) => {
      if (active) setIsSignedIn(data.session !== null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setIsSignedIn(session !== null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isSignedIn === null) {
    // Unresolved — reserve the card height so the layout doesn't jump.
    return <ShimmerCard aria-hidden="true" className="p-6 sm:p-8" />;
  }

  if (!isSignedIn) {
    return (
      <ShimmerCard className="p-6 sm:p-8">
        <p className="text-muted-foreground text-sm">
          <TextLink href="/login">Sign in</TextLink> to leave a review.
        </p>
      </ShimmerCard>
    );
  }

  if (submitted) {
    return (
      <ShimmerCard className="p-6 sm:p-8">
        <p role="status" className="text-foreground text-sm leading-relaxed">
          Thanks — your review is live!
        </p>
      </ShimmerCard>
    );
  }

  async function submit(
    values: z.infer<typeof reviewSchema>,
  ): Promise<FormActionResult> {
    const result = await submitReview(values);
    return result.ok ? { ok: true } : { ok: false, message: result.error };
  }

  const isPending = form.formState.isSubmitting;

  return (
    <ShimmerCard className="p-6 sm:p-8">
      <Form
        form={form}
        onSubmit={submitAction(form, submit, {
          onSuccess: () => setSubmitted(true),
        })}
        className="flex flex-col gap-4"
      >
        <FormRootError />

        <div className="flex flex-col gap-1.5">
          <span id="review-rating-label" className="text-sm font-medium">
            Rating
          </span>
          <StarRatingInput
            value={rating.field.value}
            onChange={rating.field.onChange}
            labelledBy="review-rating-label"
          />
        </div>

        <FormField
          label="Your review"
          name="body"
          error={form.formState.errors.body?.message}
        >
          <Textarea
            {...form.register("body")}
            rows={4}
            maxLength={FIELD_LIMITS.note}
            aria-describedby="review-body-counter"
            placeholder="Tell us about your experience…"
          />
        </FormField>
        <CharCounter
          id="review-body-counter"
          value={body}
          max={FIELD_LIMITS.note}
          className="-mt-2 text-right"
        />

        <div>
          <Button type="submit" variant="brand" disabled={isPending}>
            {isPending ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      </Form>
    </ShimmerCard>
  );
}
