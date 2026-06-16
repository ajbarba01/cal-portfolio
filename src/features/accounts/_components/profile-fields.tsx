"use client";

import { Fragment, useId } from "react";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { Eyebrow } from "@/components/marketing/eyebrow";
import { FIELD_LIMITS } from "@/lib/field-limits";
import type { FormKey } from "@/features/accounts/form-registry";

/**
 * Field specs + a generic renderer for the Owner / Home / Pet profiles. Driving
 * the layout from data (not bespoke JSX per form) keeps the profiles visually
 * identical to each other and to the legacy emergency card: borderless
 * Eyebrow-titled groups, one tokenized FormField per question. Note-length
 * questions use a Textarea so care instructions aren't cramped into one line.
 *
 * Copy is written from the owner's side of the screen — plain questions Cal's
 * clients recognize, with a one-line hint only where the question needs framing.
 *
 * Every field shows an explicit required/optional text label (not color alone)
 * for accessibility.
 */

export type FieldValues = Record<string, string>;

interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "tel";
  max: number;
}

interface FieldGroup {
  title: string;
  fields: FieldSpec[];
}

const {
  name: N,
  phone: P,
  shortText: S,
  note: NT,
  addressLine: A,
  relationship: R,
} = FIELD_LIMITS;

const NOTES_GROUP: FieldGroup = {
  title: "Anything else",
  fields: [
    {
      name: "additional_notes",
      label: "Additional notes",
      hint: "Anything not covered above",
      multiline: true,
      max: NT,
    },
  ],
};

const OWNER_GROUPS: FieldGroup[] = [
  {
    title: "Primary owner",
    fields: [
      { name: "owner_name", label: "Owner name", required: true, max: N },
      {
        name: "owner_pronouns",
        label: "Pronouns",
        hint: "Optional — how Cal should refer to you",
        max: R,
      },
      {
        name: "owner_phone",
        label: "Phone",
        type: "tel",
        required: true,
        max: P,
      },
      {
        name: "backup_contact",
        label: "Backup contact",
        hint: "Another way to reach you — email or a second number",
        max: S,
      },
    ],
  },
  {
    title: "Additional owners (optional)",
    fields: [
      { name: "second_owner_name", label: "Second owner", max: N },
      { name: "second_owner_phone", label: "Their phone", type: "tel", max: P },
      { name: "third_owner_name", label: "Third owner", max: N },
      { name: "third_owner_phone", label: "Their phone", type: "tel", max: P },
    ],
  },
  {
    title: "Emergency contact",
    fields: [
      {
        name: "emergency1_name",
        label: "Contact name",
        required: true,
        max: N,
      },
      {
        name: "emergency1_phone",
        label: "Contact phone",
        type: "tel",
        required: true,
        max: P,
      },
      {
        name: "emergency1_relationship",
        label: "Relationship",
        placeholder: "e.g. Parent, Partner, Friend",
        required: true,
        max: R,
      },
      { name: "emergency1_address", label: "Address", max: A },
    ],
  },
  {
    title: "Second emergency contact (optional)",
    fields: [
      { name: "emergency2_name", label: "Contact name", max: N },
      { name: "emergency2_phone", label: "Contact phone", type: "tel", max: P },
      { name: "emergency2_relationship", label: "Relationship", max: R },
      { name: "emergency2_address", label: "Address", max: A },
    ],
  },
  NOTES_GROUP,
];

const HOME_ACCESS_GROUPS: FieldGroup[] = [
  {
    title: "Getting in",
    fields: [
      { name: "address", label: "Home address", required: true, max: A },
      {
        name: "entry_instructions",
        label: "How to get in",
        hint: "Keys, lockbox, keypad or garage code",
        required: true,
        multiline: true,
        max: NT,
      },
      {
        name: "alarm_instructions",
        label: "Alarm or security system",
        hint: "Any steps to disarm or codes Cal needs",
        multiline: true,
        max: NT,
      },
      { name: "wifi", label: "Wi-Fi", hint: "Network and password", max: S },
      {
        name: "breaker_location",
        label: "Breaker box",
        hint: "Where to find it if the power trips",
        max: S,
      },
    ],
  },
  NOTES_GROUP,
];

const HOME_SITTING_GROUPS: FieldGroup[] = [
  {
    title: "Staying over",
    fields: [
      {
        name: "sleeping_arrangements",
        label: "Where Cal should sleep",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Home care",
    fields: [
      {
        name: "home_care",
        label: "Household tasks",
        hint: "Plants, mail, trash and recycling days, anything else",
        multiline: true,
        max: NT,
      },
      {
        name: "furniture_policy",
        label: "Furniture",
        hint: "Are pets allowed on beds and couches?",
        max: S,
      },
      { name: "house_rules", label: "House rules", multiline: true, max: NT },
      {
        name: "guest_policy",
        label: "Guests",
        hint: "OK for Cal to have a guest? Cal always asks first",
        max: S,
      },
    ],
  },
  NOTES_GROUP,
];

const PET_CARE_GROUPS: FieldGroup[] = [
  {
    title: "Feeding",
    fields: [
      {
        name: "feeding_schedule",
        label: "Feeding schedule",
        multiline: true,
        max: NT,
      },
      { name: "feeding_amount", label: "Amount per meal", max: S },
      { name: "food_location", label: "Where the food is", max: S },
      {
        name: "treat_instructions",
        label: "Treats",
        hint: "Guidelines or restrictions",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Medical",
    fields: [
      {
        name: "current_medications",
        label: "Medications",
        hint: "Name, dose, frequency, and reason for each",
        multiline: true,
        max: NT,
      },
      {
        name: "allergies",
        label: "Allergies",
        hint: "Allergen and what a reaction looks like",
        multiline: true,
        max: NT,
      },
      {
        name: "medical_history",
        label: "Medical history",
        hint: "Conditions and past surgeries",
        multiline: true,
        max: NT,
      },
      {
        name: "emergency_history",
        label: "Past emergencies",
        hint: "Previous ER visits or hospitalizations",
        multiline: true,
        max: NT,
      },
      {
        name: "vet_emergency_notes",
        label: "For a vet in an emergency",
        hint: "Anything else a vet should know",
        multiline: true,
        max: NT,
      },
    ],
  },
  {
    title: "Behavior",
    fields: [
      { name: "friendly_strangers", label: "With strangers", max: S },
      { name: "friendly_dogs", label: "With other dogs", max: S },
      { name: "friendly_children", label: "With children", max: S },
      {
        name: "behavior_comments",
        label: "Other behavior notes",
        multiline: true,
        max: NT,
      },
    ],
  },
  NOTES_GROUP,
];

const PET_WALK_GROUPS: FieldGroup[] = [
  {
    title: "Walks & outings",
    fields: [
      {
        name: "walk_route",
        label: "Typical route(s)",
        multiline: true,
        max: NT,
      },
      { name: "walk_pace", label: "Distance / pace", max: S },
      {
        name: "leash_harness",
        label: "Leash or harness",
        hint: "Which, and where it's kept",
        max: S,
      },
      {
        name: "offleash",
        label: "Off-leash",
        hint: "Permitted? Off-leash tag?",
        max: S,
      },
      {
        name: "vehicle_restraint",
        label: "In the car",
        hint: "How to secure your dog for an outing",
        multiline: true,
        max: NT,
      },
      {
        name: "walk_entry",
        label: "Getting in for the walk",
        hint: "How Cal enters if you're not home",
        multiline: true,
        max: NT,
      },
    ],
  },
  NOTES_GROUP,
];

/** Groups per profile form. Emergency is rendered by its own legacy component. */
export const PROFILE_GROUPS: Partial<Record<FormKey, FieldGroup[]>> = {
  owner: OWNER_GROUPS,
  home_access: HOME_ACCESS_GROUPS,
  home_sitting: HOME_SITTING_GROUPS,
  pet_care: PET_CARE_GROUPS,
  pet_walk: PET_WALK_GROUPS,
};

/** Every field name a form owns — used to build its initial value bag. */
export function profileFieldNames(formKey: FormKey): string[] {
  const groups = PROFILE_GROUPS[formKey];
  if (!groups) return [];
  return groups.flatMap((g) => g.fields.map((f) => f.name));
}

function FieldGroupBlock({
  group,
  values,
  onChange,
}: {
  group: FieldGroup;
  values: FieldValues;
  onChange: (name: string, value: string) => void;
}) {
  const headingId = useId();
  return (
    <div
      role="group"
      aria-labelledby={headingId}
      className="flex flex-col gap-4"
    >
      <Eyebrow id={headingId}>{group.title}</Eyebrow>
      {group.fields.map((f) => {
        const labelNode = (
          <span className="inline-flex items-center gap-1.5">
            {f.label}
            {f.required ? (
              <span className="text-destructive text-xs font-normal">*</span>
            ) : (
              <span className="text-muted-foreground text-xs font-normal">
                (optional)
              </span>
            )}
          </span>
        );
        const control = {
          value: values[f.name] ?? "",
          maxLength: f.max,
          required: f.required,
          onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
          ) => onChange(f.name, e.target.value),
        };
        return (
          <Fragment key={f.name}>
            {f.multiline ? (
              <FormField label={labelNode} name={f.name} hint={f.hint}>
                <Textarea name={f.name} {...control} />
              </FormField>
            ) : (
              <FormField
                label={labelNode}
                name={f.name}
                hint={f.hint}
                type={f.type ?? "text"}
                placeholder={f.placeholder}
                {...control}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function ProfileFields({
  formKey,
  values,
  onChange,
}: {
  formKey: FormKey;
  values: FieldValues;
  onChange: (name: string, value: string) => void;
}) {
  const groups = PROFILE_GROUPS[formKey] ?? [];
  return (
    <>
      {groups.map((g) => (
        <FieldGroupBlock
          key={g.title}
          group={g}
          values={values}
          onChange={onChange}
        />
      ))}
    </>
  );
}
