"use client";

import * as React from "react";
import { Field } from "@base-ui/react/field";

import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";

type FormFieldBase = {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  /**
   * Controlled inline error. When provided, the field is marked invalid and the
   * message is shown via `Field.Error match={true}` so base-ui wires `aria-describedby`
   * correctly — preferred over a bare `<p>` which would not get the aria linkage.
   */
  error?: React.ReactNode;
  className?: string;
};

// Either pass input props (rendered as a styled Input) OR a custom control via
// `children` — never both. The `children` branch forbids input props so they
// can't be silently dropped.
type FormFieldProps =
  | (FormFieldBase & { children: React.ReactNode } & {
      [K in keyof Omit<
        React.ComponentProps<typeof Input>,
        "name" | "children"
      >]?: never;
    })
  | (FormFieldBase & { children?: undefined } & Omit<
        React.ComponentProps<typeof Input>,
        "name"
      >);

export function FormField(props: FormFieldProps) {
  const { label, name, hint, error, className, children, ...inputProps } =
    props as FormFieldBase & {
      children?: React.ReactNode;
    } & Omit<React.ComponentProps<typeof Input>, "name">;
  const isInvalid = Boolean(error);

  return (
    // `invalid` tells Field.Root the field is in error state; base-ui then sets
    // aria-invalid on the linked control and aria-describedby to the Field.Error id.
    <Field.Root
      name={name}
      invalid={isInvalid}
      className={cn("flex flex-col", space.field, className)}
    >
      <Field.Label className="text-sm leading-none font-medium">
        {label}
      </Field.Label>

      {children ?? <Field.Control render={<Input {...inputProps} />} />}

      {hint ? (
        <Field.Description className="text-muted-foreground text-xs">
          {hint}
        </Field.Description>
      ) : null}

      {/* match={true} forces Field.Error visible for a controlled error string,
          ensuring the element gets an id that base-ui links via aria-describedby. */}
      {error ? (
        <Field.Error match={true} className="text-destructive text-xs">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}
