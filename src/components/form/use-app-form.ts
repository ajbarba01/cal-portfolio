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
 */
export function useAppForm<TSchema extends z.ZodObject<z.ZodRawShape>>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, "resolver" | "mode">,
): UseFormReturn<z.infer<TSchema>> {
  return useForm({
    resolver: standardSchemaResolver(schema),
    mode: "onTouched",
    ...options,
  } as UseFormProps<z.infer<TSchema>>) as UseFormReturn<z.infer<TSchema>>;
}
