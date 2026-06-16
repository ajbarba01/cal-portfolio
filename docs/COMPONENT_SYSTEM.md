# Component System

> The shared UI kit: what each primitive is, **when** to use it, and the sizing
> tiers it's built on. Companion to [FRONTEND.md](FRONTEND.md) (theming
> philosophy, shells, feedback, instant-nav) and [DESIGN.md](DESIGN.md) (brand
> palette + type). This doc owns the **registry + usage contracts**; it does not
> restate theming.

## How to use this doc

Building or changing UI: pick the primitive whose **intent** matches, at the size
the track defines — don't hand-roll a surface, control, or pill. If nothing fits,
add a primitive in `src/components/ui/` (cross-cutting) or co-located with its
feature, and register it here in the **same commit**. View everything live at
`/showcase` (dev-only route).

## Token tiers

Color + radius are two-layer CSS vars in `globals.css` (primitive palette →
semantic roles; see FRONTEND.md "Modular theming"). On top, the system adds
**sizing** tiers (values in `globals.css`, mirrored in `design-tokens.ts` for
discovery):

| Tier          | Tokens                                                         | Owns                                                           |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Control track | `--control-h-{sm,md,lg}`, `--control-px-*`, `--control-radius` | the height / padding / radius every control shares             |
| Card          | `--card-radius`, `--card-pad`                                  | one surface radius (resolved the old `rounded-xl`/`2xl` split) |
| Elevation     | `--elev-1/2` → utilities `shadow-elev-1/2`                     | the two depth steps (rest, lift)                               |

Rule: a control or surface never hardcodes a height / radius / shadow — it
composes the track, `rounded-card`, or an elevation token. House style avoids
drop-shadows on cards; conventional floating-element shadows (toast, popover,
back-to-top, the page sheet) are fine.

## The control track

`controlVariants` (`control-variants.ts`) is the shared shell — height + padding +
radius + border + focus ring — that every single-line control composes, so a text
field, a dropdown, and a same-size button line up by construction instead of each
hardcoding `h-9`. `md` is the form baseline (≈36px), `sm` is dense/admin, `lg` is
touch. Composite controls (the Multiswitch track, the NumberStepper box) use
`controlBox` (height + radius only) to stay height-aligned without the field shell.

Fill is one role site-wide: `bg-background` (the form-on-card recipe). The
`--input` token stays the **border** role (`border-input`), not a fill.

## Surface — the one card

`Surface` is the only card primitive. The shimmer-ring rule is **structural**:
**every outer card (one not nested inside another card) shimmers; nested cards
don't** — so only the outermost edge carries the signature. `variant` encodes it:

| variant       | use for                                                             | look                                   |
| ------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `emphasis`    | an **outer** card (not nested) — the default for any top-level card | shimmer ring                           |
| `interactive` | an outer card that's also clickable                                 | shimmer ring + border/tint hover       |
| `plain`       | a card **nested inside another card**, or a flat sub-section        | border only                            |
| `floating`    | a floating overlay (toast, dropdown menu)                           | border + sanctioned shadow, no shimmer |

`ShimmerCard` is a thin alias of `emphasis`. `floating` carries a sanctioned
`shadow-elev-2` (the no-shadow rule governs page cards, not floating elements). Use `ListRow` for list items (a
Surface at row padding; top-level rows are outer cards → shimmer). The only
sanctioned card lift is `ShimmerCard`'s opt-in `hoverLift` (the service cards).

## Registry — when to use which

| Need                              | Use                                     | Notes                                          |
| --------------------------------- | --------------------------------------- | ---------------------------------------------- |
| on/off boolean (settings, flags)  | `Switch`                                | not a form-value picker                        |
| boolean in a form / row-select    | `Checkbox`                              | native input, custom paint                     |
| single-select among a few options | `RadioGroup`                            | a **form value**                               |
| filter / view toggle (page state) | `Multiswitch`                           | **not** a form value                           |
| number with a unit ($, %)         | `UnitInput`                             |                                                |
| integer with steppers             | `NumberStepper`                         |                                                |
| small status / label pill         | `Badge`                                 | variants incl. `outline` chip; sizes `sm`/`md` |
| inline notice within a page       | `Alert`                                 | info / warning / success / error               |
| empty / error / loading panel     | `EmptyState` / `ErrorState` / `Spinner` | see FRONTEND.md feedback taxonomy              |
| inline link / textual CTA         | `TextLink`                              | the one clay link style                        |
| titled group of form fields       | `FormSection`                           | emphasis Surface, not fieldset/legend          |
| live length count on a long field | `CharCounter`                           | long textareas only; `maxLength` = server cap  |
| section intro (eyebrow + heading) | `SectionHeader`                         | reuses `Eyebrow`                               |
| stat / receipt line               | `StatDisplay`                           | `stacked` or `receipt`                         |
| page title / subtitle / actions   | `PageHeader`                            | a layout shell (FRONTEND.md)                   |

Buttons: exactly one `brand` primary per view — see FRONTEND.md "Button hierarchy".

## Form recipe

A form sits on one or more `emphasis` Surface cards. Titled groups use
`FormSection` (an `emphasis` Surface titled by an `Eyebrow`, wired
`role="group"` + `aria-labelledby`) — **not** native `fieldset`/`legend`, whose
notch misaligns with the shimmer ring. A multi-section form stacks several
FormSections (each its own outer card); a single-section form is one card. Each
field is a `FormField` carrying its label, control, optional `xs` hint, and `sm`
inline error. Controls use the `bg-background` fill; one `brand` submit (control
`md` size, `self-start` desktop / full-width mobile). Validation renders inline at
the field, never as a toast (see FRONTEND.md feedback).

Every text control carries a `maxLength` (and its server schema a matching
`.max()`) drawn from the same semantic tier in `src/lib/field-limits.ts` —
client and server caps share one constant so they cannot drift. Long free-text
textareas (message, review body, booking comments, pet notes) pair the control
with a `CharCounter`; short inputs rely on the silent `maxLength` wall alone.

## /showcase

`/showcase` is a dev-only route (404 in production) that renders every primitive,
every variant, and the family groupings with the real components and live tokens.
It's both the catalog and where visual calls get made. Keep it current when adding
a primitive.

## Portability — port the system, not the brand

What travels to another site is the **system**: the token tiers, the control track,
the Surface-variant pattern, the registry contracts here, and the `/showcase`
scaffold — all authored brand-neutral. A new site reskins by swapping only the
**primitive palette + fonts** (the swap layer in `globals.css`; see DESIGN.md);
nothing above the semantic layer changes.

## Enforcement

- `/showcase` is the visual canon; this registry is the usage canon.
- **Same-commit rule**: a new or changed primitive updates this doc in the same
  commit (AGENTS.md doc discipline).
- Mechanical drift (hand-rolled card surfaces, raw control heights, arbitrary
  colors, off-token fills) is caught by custom ESLint rules in `eslint.config.mjs`.

_Last reviewed: 2026-06-16_
