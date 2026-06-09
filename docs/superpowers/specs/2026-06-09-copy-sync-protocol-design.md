# Copy-Sync Protocol — Design

> Spec for a repeatable protocol that transplants Cal's verbatim marketing text into the website, tracks provenance, and stays in sync as Cal revises. Brainstormed 2026-06-09.

---

## Problem

Marketing copy is stubbed with `[[ ... ]]` placeholders (DESIGN.md "Copy placeholders"). Cal supplies real text incrementally, as a loosely-labeled dump (`Header:`, `Trust point 1:`), sometimes with inline action notes (`(<-- hyperlink)`). We need a protocol that:

1. Places new header/body/item text into the correct slot and records it as implemented.
2. Detects and re-applies changes when Cal revises text already placed (diff-driven).
3. Transplants words **exactly** — only capitalization/punctuation may auto-adapt to the slot; any grammar/wording change is confirmed with the user first; obvious action requests (e.g. "insert hyperlink") are resolved by the agent and the resolution confirmed; if unsure whether text is literal copy or a directive, ask.
4. Keeps a clear, bidirectional link between the text source and the website location so edits are easy.

## Decisions (locked during brainstorming)

- **Cadence:** recurring sync (living), not one-shot. Needs durable tracking + stable IDs + per-run diff.
- **Authority:** the source doc wins, but **user-confirmed transforms persist** — a re-run must not undo a confirmed change unless Cal's raw text itself changed.
- **Copy store:** central typed registry (approach B). Copy is extracted out of TSX into one `src/content` layer keyed by stable ID; components import by ID.
- **Delivery:** the protocol rules live in a **model-neutral doc** (`docs/CONTENT.md`) because this is a multi-agent repo (AGENTS.md is the shared SoT). Claude gets a thin `copy-sync` skill that points to that doc. Codex/Gemini read the same doc.
- **Extraction:** the one-time move of existing copy into the registry happens **separately/soon**, outside this protocol. The skill assumes the registry exists and degrades gracefully if a target ID is missing.

## Artifacts

| File                                | Role                                                                             | Authority           |
| ----------------------------------- | -------------------------------------------------------------------------------- | ------------------- |
| `docs/content/cal-source.md`        | Cal's verbatim text, organized by ID. Captured before any edit.                  | **Source of truth** |
| `src/content/marketing.ts`          | Typed registry: ID → final live string. Components import.                       | Render target       |
| `docs/content/copy-ledger.md`       | Per-ID tracking: status, provenance, applied-from, live-text, transforms, notes. | Bridge / diff state |
| `docs/CONTENT.md`                   | The protocol rules (model-neutral).                                              | Process SoT         |
| `.claude/skills/copy-sync/SKILL.md` | Thin Claude shim → "follow docs/CONTENT.md."                                     | Invocation          |

DESIGN.md "Copy placeholders" remains the marker-grammar reference; the protocol references it and does not restate it (single-source-of-truth rule).

## Stable ID = the link

Scheme: `<page>.<section>[.<index>].<slot>`. The same token appears in `cal-source.md`, `copy-ledger.md`, and as the **key** in `marketing.ts` — so the link is exact, not a comment, and survives line-number churn.

Examples (mapped from current placeholders):

- `home.hero.hook`, `home.hero.body`, `home.trust.1.title`, `home.trust.1.body`, `home.why.header`, `home.cta.header`, `home.cta.body`
- `about.eyebrow`, `about.summary`, `about.bio.p1`..`p3`, `about.approach.1.title`/`.detail`, `about.references.*` (see split-JSX edge case)
- `services.overview`, `services.pricing.header`, `services.pricing.body`
- `reviews.purpose`, `contact.header`, `contact.subtitle`, `gallery.eyebrow`, `gallery.body`, `footer.tagline`
- `resources.1.name`/`.desc`, `resources.faq.3.q`/`.a`
- `service.house_sitting.card.body`, `service.check_in.card.body`, `service.walk.card.body`, `service.training.card.body`, `service.meet_greet.card.body`

Tracing any live string → grep its ID across the four files.

## Ledger format

One markdown block per ID; the protocol parses by heading. `applied-from` is stored verbatim (no hashing) so it is both human-readable and an exact diff anchor.

```
### home.trust.1.body
- status: placed
- provenance: cal-verbatim
- consumed-by: src/app/(marketing)/page.tsx
- applied-from: |
    Through my experiences as an EMT, Wilderness First Responder...
- live-text: |
    Through my experiences as an EMT, Wilderness First Responder...
- transforms:
    - resolved "(<-- hyperlink)" -> /resources (confirmed 2026-06-09)
- notes: -
```

- **Diff driver:** compare the `cal-source.md` raw text vs the ledger's `applied-from`. Equal → skip. Differ → reprocess and re-confirm transforms.
- **Drift detection:** if the live registry string ≠ ledger `live-text`, someone hand-edited the code; flag it (do not silently overwrite).
- `live-text` differs from `applied-from` only by the listed, confirmed `transforms`.

### Status values

`placeholder` (still `[[ ]]`) · `placed` · `changed` (source differs from applied-from, pending re-apply) · `drift` (live ≠ ledger) · `flagged` (needs user decision).

### Provenance taxonomy (answers "what is Cal's vs not")

- `cal-verbatim` — Cal's exact words; only capitalization/punctuation adapted to the slot.
- `cal-confirmed-edit` — Cal's words plus a grammar/wording change the user approved.
- `agent-resolved` — an action item the agent filled per Cal's directive (e.g. a resolved hyperlink target).
- `public-fact` — real external info (e.g. ASPCA poison line) — verifiable, not a claim about Cal.
- `placeholder` — untouched stub.

## Protocol steps (the skill checklist)

1. **Intake** — take Cal's dump raw. No edits yet.
2. **Map** — infer the target ID for each chunk. Present a mapping table and **get confirmation**. Anything ambiguous or unsure → flag and ask. Handles loose `Header:` / `Trust point N:` labels.
3. **Capture** — write the confirmed chunks verbatim into `cal-source.md` by ID. Authority is now locked.
4. **Diff** — for each touched ID, compare `cal-source` vs ledger `applied-from`: new / changed / unchanged. Also run drift detection (live registry vs ledger `live-text`).
5. **Transform + confirm gate** — auto-allowed without asking: capitalization and punctuation to fit the slot. Everything else stops:
   - action item (e.g. `(<-- hyperlink)`) → agent resolves the target, then **confirms the target**;
   - grammar or wording concern → **ask and confirm before changing**;
   - unsure whether text is literal copy or a directive → **ask**.
     Every confirmed change is recorded as a `transform`.
6. **Apply** — write the final string into `marketing.ts`; update the ledger (`status`, `provenance`, `applied-from`, `live-text`, `transforms`).
7. **Verify** — typecheck/build, run `rg "\[\["` for remaining stubs, and report: placed / still-placeholder / flagged / drift.

### Invocation surface

- `/copy-sync` + pasted dump → full run (map → confirm → place).
- Plain ask ("sync this copy from Cal: …") → auto-triggers the skill.
- `/copy-sync status` → read-only report of every ID; no writes.

## Edge cases

- **Missing registry IDs:** if extraction hasn't created an ID yet, the skill records the entry in `cal-source.md` + ledger as `placeholder`/pending and reports it, rather than failing.
- **Split-JSX prose** (e.g. about page "…see the [[]] page" wraps a link element): the slot is decomposed into sub-IDs (`about.references.pre` / `.link` / `.post`) or a single templated entry. The protocol documents this case so it is handled consistently.
- **service-card-display.ts** strings move to the registry during extraction; its test repoints to the registry value in the same change (outside this protocol, but noted so the IDs line up).

## Guardrails (enforced, defined in DESIGN.md — not restated)

- Colorado-only; no towns/cities/neighborhoods. "Front Range" (region term) is **flagged for confirmation** as the canonical example of this gate.
- No inventing services, claims, philosophy, or biographical detail — Cal supplies all substance.
- Public emergency resources (ASPCA, 24/7 vet ER) are allowed as real `public-fact` entries.

## Doc discipline

Per AGENTS.md same-commit rule, introducing `src/content/` and `docs/content/` updates the DESIGN.md layout/copy section in the same commit that adds them.

## Scope / YAGNI

**In:** the four artifacts, the thin `copy-sync` skill, the seven-step protocol. **Out:** build-time content loader, i18n, CMS UI, visual diff tooling. The registry is plain typed TS that components import — nothing more.

---

_Last reviewed: 2026-06-09_
