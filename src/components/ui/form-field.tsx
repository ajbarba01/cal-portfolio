"use client";

import * as React from "react";
import { Field } from "@base-ui/react/field";
import { useFormContext, useController } from "react-hook-form";

import { cn } from "@/lib/utils";
import { space } from "@/lib/design-tokens";
import { Input } from "@/components/ui/input";

type FormFieldBase = {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  /**
   * Controlled inline error. When provided, the field is marked invalid and the
   * message is shown via `Field.Error match={true}` so base-ui wires
   * `aria-describedby` correctly. Passing `error` (or `value`/`onChange`) keeps
   * the field in controlled mode even inside a <Form>.
   */
  error?: React.ReactNode;
  /**
   * Site-wide convention: required is the unmarked default; optional fields
   * carry a muted "optional" suffix. No asterisks anywhere.
   */
  optional?: boolean;
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
  const {
    label,
    name,
    hint,
    error,
    optional,
    className,
    children,
    ...inputProps
  } = props as FormFieldBase & {
    children?: React.ReactNode;
  } & Omit<React.ComponentProps<typeof Input>, "name">;

  // RHF mode: inside a <Form> (FormProvider) with no controlled props, the
  // field self-wires via useController. Outside a provider — or when the
  // caller passes error/value/onChange — it behaves exactly as before.
  const formContext = useFormContext();
  const isControlled =
    error !== undefined ||
    "value" in props ||
    "onChange" in props ||
    children !== undefined;
  const rhf = formContext !== null && !isControlled;

  return rhf ? (
    <RhfFormField
      label={label}
      name={name}
      hint={hint}
      optional={optional}
      className={className}
      inputProps={inputProps}
    />
  ) : (
    <PlainFormField
      label={label}
      name={name}
      hint={hint}
      error={error}
      optional={optional}
      className={className}
      inputProps={inputProps}
    >
      {children}
    </PlainFormField>
  );
}

function FieldShell({
  name,
  label,
  hint,
  optional,
  invalid,
  errorMessage,
  className,
  children,
}: {
  name: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  optional?: boolean;
  invalid: boolean;
  errorMessage?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `invalid` tells Field.Root the field is in error state; base-ui then sets
    // aria-invalid on the linked control and aria-describedby to the Field.Error id.
    <Field.Root
      name={name}
      invalid={invalid}
      className={cn("flex flex-col", space.field, className)}
    >
      <Field.Label className="text-sm leading-none font-medium">
        {label}
        {optional ? (
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            optional
          </span>
        ) : null}
      </Field.Label>

      {children}

      {hint ? (
        <Field.Description className="text-muted-foreground text-xs">
          {hint}
        </Field.Description>
      ) : null}

      {/* match={true} forces Field.Error visible for a controlled error string,
          ensuring the element gets an id that base-ui links via aria-describedby. */}
      {errorMessage ? (
        <Field.Error match={true} className="text-destructive text-sm">
          {errorMessage}
        </Field.Error>
      ) : null}
    </Field.Root>
  );
}

function RhfFormField({
  label,
  name,
  hint,
  optional,
  className,
  inputProps,
}: {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  optional?: boolean;
  className?: string;
  inputProps: Omit<React.ComponentProps<typeof Input>, "name">;
}) {
  const { field, fieldState } = useController({ name });
  return (
    <FieldShell
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      invalid={fieldState.invalid}
      errorMessage={fieldState.error?.message}
      className={className}
    >
      {/* RHF's useController field object exposes `ref` as a callback-ref
          registrar (not a ref handle being read); the react-compiler linter
          can't tell the two apart and flags the whole destructured object as
          a ref value below. */}
      {/* eslint-disable react-hooks/refs */}
      <Field.Control
        render={
          <Input
            {...inputProps}
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
          />
        }
      />
      {/* eslint-enable react-hooks/refs */}
    </FieldShell>
  );
}

function PlainFormField({
  label,
  name,
  hint,
  error,
  optional,
  className,
  inputProps,
  children,
}: {
  label: React.ReactNode;
  name: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  className?: string;
  inputProps: Omit<React.ComponentProps<typeof Input>, "name">;
  children?: React.ReactNode;
}) {
  return (
    <FieldShell
      name={name}
      label={label}
      hint={hint}
      optional={optional}
      invalid={Boolean(error)}
      errorMessage={error}
      className={className}
    >
      {/* A custom control passed via `children` is wired through Field.Control so
          base-ui links the label + aria-describedby; a bare element won't register
          otherwise. Plain Input fields use the default branch. */}
      {children ? (
        React.isValidElement(children) ? (
          <Field.Control render={children as React.ReactElement} />
        ) : (
          children
        )
      ) : (
        <Field.Control render={<Input {...inputProps} />} />
      )}
    </FieldShell>
  );
}
