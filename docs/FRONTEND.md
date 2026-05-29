# Frontend & Design

> Authority for **the design system, theming, and the design→code pipeline** (general, portable). Project-specific pages, brand direction, and the concrete palette live in [DESIGN.md](DESIGN.md). For code conventions see [CODE_STYLE.md](CODE_STYLE.md); for architecture see [ENGINEERING.md](ENGINEERING.md).

Goal: a distinctive, professional UI that **avoids the generic AI look**, with a styling system modular enough that **palettes and components swap with minimal effort**.

---

## A. Design-tool pipeline (cheapest-first)

1. **(Optional) BareMinimum.design** — free, no-signup; turns a prompt or screenshot into ASCII/TUI wireframes (export text / Markdown / PNG / React-shadcn). Use it for **zero-cost structural sketches** to agree layout _before_ spending Claude Design budget. **Do not** build production UI from its skeletal code export. Optional — overlaps Claude Design's wireframe mode.

2. **Claude Design** (separate weekly limit that does **not** consume Claude Code quota):
   - **Onboard it on this repo** so it reads `design-tokens.ts` and existing components and reuses the design system — without that grounding it produces the generic modern-startup look.
   - **Wireframe mode first** (cheaper tokens) to settle structure; switch to polished mockups only once structure is locked.
   - **Dense prompts win:** name the artifact type, audience, content structure, and constraints. Use chat for layout/structure changes, inline canvas comments for local tweaks.
   - Heavy sessions can burn >50% of a weekly allotment — iterate in wireframe mode, polish sparingly.

3. **"Send to Claude Code" handoff** — exports a bundle: component tree (machine-readable), the tokens actually used, layout hierarchy, and referenced assets. Claude Code builds from the tree and tokens, **not** by inferring from pixels.

4. **Claude Code build** — invoke the `frontend-design` skill to force deliberate aesthetic choices, then implement with **shadcn/ui** + `design-tokens.ts`.

---

## B. Modular theming (swap palettes / components with minimal effort)

- **Two-layer tokens.**
  - _Primitive layer_ — the raw palette (`blue500`, `stone100`, …). Never referenced by components directly.
  - _Semantic layer_ — roles (`color.primary`, `color.surface`, `color.danger`, `text.muted`). Components reference **only semantic roles**.
- **CSS variables drive the semantic layer.** Swapping a palette = remap variables in one place; **no component edits**. Enables runtime theming (e.g. dark mode) for free.
- **shadcn/ui owned components** consume semantic tokens — never hardcoded colors. Swap a component by editing its source in-repo; swap the look by editing the token map.
- `tailwind.config` references tokens; **no inline magic color/spacing values** in components.

```
primitive palette ─▶ semantic roles (CSS vars) ─▶ tailwind config ─▶ shadcn components
        ▲ swap here to re-palette                          ▲ components never hardcode color
```

---

## C. Design system

Tokens live in two files: **`src/app/globals.css`** owns color + radius as two-layer CSS variables (primitive palette → semantic roles; the runtime source of truth, incl. dark mode), and **`src/lib/design-tokens.ts`** owns the non-color TS tokens (motion, breakpoints, z-index) + the canonical list of semantic color roles. Typography is set via `next/font` in the root layout.

**Anti-generic rules:**

- Never default to Inter / Roboto / Open Sans / Arial. Pick a distinctive display + body pairing.
- Real contrast: weight extremes (200 vs 800), size jumps of 3×+ (not 1.5×).
- **Commit to a visual direction.** The project's specific direction and palette live in [DESIGN.md](DESIGN.md) — set them there, not here.

**Baseline requirements (every UI):**

- **Responsive, mobile-first.**
- **Accessibility floor** — semantic HTML, sufficient color contrast, visible focus states, full keyboard navigation.
- **Imagery** — `next/image`, defined aspect ratios, lazy loading.

---

_Last reviewed: 2026-05-29_
