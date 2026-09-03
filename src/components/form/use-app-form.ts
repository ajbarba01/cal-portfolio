"use client";

import {
  useForm,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import type { z } from "zod";

/**
 * The app's `useForm` preset: zod resolver from the given schema and
 * `onTouched` validation (validate on blur; live re-validate once a field
 * has errored; everything validates on submit). RHF's full API is returned
 * unhidden — this exists so every form starts from the same defaults, not
 * to wrap RHF away.
 *
 * Field values are typed on the schema's INPUT side and the submit handler on
 * its output side, which is what the resolver actually produces. Typing both on
 * `z.infer` (the output) misdescribes any schema whose parse changes the shape,
 * and forces callers to cast their default values back into place.
 */
export function useAppForm<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema,
  options?: Omit<
    UseFormProps<z.input<TSchema>, unknown, z.output<TSchema>>,
    "resolver" | "mode"
  >,
): UseFormReturn<z.input<TSchema>, unknown, z.output<TSchema>> {
  return useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    resolver: standardSchemaResolver(schema),
    mode: "onTouched",
    ...options,
  });
}
