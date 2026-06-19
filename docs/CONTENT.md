# Content Protocol (copy-sync)

> Model-neutral rules for transplanting Cal's marketing copy into the site and keeping it in sync. Any agent (Claude/Codex/Gemini) follows this doc; Claude reaches it via the `copy-sync` skill. Marker grammar for `[[ ]]` placeholders lives in `docs/DESIGN.md` ("Copy placeholders") — not restated.

## Artifacts

| File                          | Role                                               | Authority                        |
| ----------------------------- | -------------------------------------------------- | -------------------------------- |
| `docs/content/cal-source.md`  | Cal's verbatim text, by ID.                        | **Source of truth**              |
| `src/content/marketing.ts`    | Typed registry: ID → live string (links inline).   | Render target (built separately) |
| `src/content/linkify.ts`      | Pure `segmentCopy` — parses a body's link markers. | Inline-link engine               |
| `docs/content/copy-ledger.md` | Per-ID status/provenance/diff state.               | Bridge                           |
| `docs/CONTENT.md`             | This protocol.                                     | Process SoT                      |

**Inline links.** A copy body is **one string** in `marketing.ts` — never split into `.pre`/`.link`/`.post` IDs. An inline link is written **into the body** with **markdown syntax**: `[label](href)` (e.g. `…through the [resources](/resources) available…`). The marker encodes the link's exact position, so duplicate labels are unambiguous and it can't collide with the `[[ ... ]]` placeholder grammar (a link needs `](` adjacency; `[[ ... ]]` never has it). The `MarketingCopy` component (`src/components/marketing/marketing-copy.tsx`) parses the body with pure `segmentCopy`, renders each marker as a `next/link`; a body with no markers renders as plain prose. **Every marketing copy slot renders through `MarketingCopy`** (by ID), not raw `{copy[id]}` — so a marker added to any slot just works. Exceptions: plain string attributes (`alt`, `aria-label`) and copy nested in an `<a>`/`<button>` (a link can't nest there), which stay raw `copy[id]`.

## Stable IDs

`<page>.<section>[.<index>].<slot>`. The same token is the heading in `cal-source.md`, the heading in `copy-ledger.md`, and the key in `marketing.ts`. The ID is the link — trace any string by grepping its ID. IDs are stable; never renumber a slot with an existing ledger entry.

## Authority rule

`cal-source.md` wins; the website is downstream. **But** user-confirmed transforms persist: a re-run must not undo a confirmed adaptation unless Cal's raw text itself changed. The diff deciding "changed" is `cal-source` text vs the ledger's `applied-from` — not the live string.

## Provenance taxonomy

- `cal-verbatim` — Cal's exact words; only capitalization/punctuation adapted to the slot.
- `cal-confirmed-edit` — Cal's words plus a grammar/wording change the user approved.
- `agent-resolved` — an action item the agent filled per Cal's directive (e.g. resolved hyperlink target).
- `public-fact` — real external info (e.g. ASPCA poison line); verifiable, not a claim about Cal.
- `placeholder` — untouched stub.

## The protocol (run these in order)

1. **Intake** — take Cal's text dump raw. No edits yet.
2. **Map** — infer the target ID for each chunk (handles loose `Header:` / `Trust point N:` labels). Present a mapping table, get the user's confirmation. Anything ambiguous → flag and ask before proceeding.
3. **Capture** — write the confirmed chunks verbatim into `cal-source.md` under their IDs. Authority is now locked.
4. **Diff** — per touched ID, compare `cal-source` text vs ledger `applied-from`: new / changed / unchanged. Also drift-detect: if the live registry string ≠ ledger `live-text`, the code was hand-edited — flag it, don't silently overwrite.
5. **Transform + confirm gate** — auto-allowed without asking: capitalization and punctuation to fit the slot. Everything else STOPS:
   - action item (e.g. `(<-- hyperlink)`) → resolve the target, then confirm the target with the user. A resolved inline link is written **into the body** as a `[label](href)` markdown marker, **not** by splitting the body: strip the directive note, wrap the link word in the marker, keep the body one string. `label` stays Cal's verbatim word(s);
   - any grammar or wording concern → ask and confirm before changing;
   - unsure whether text is literal copy or a directive → ask.
     Record every confirmed change as a `transform` in the ledger (for links: `agent-resolved`, naming the `[label](href)` marker).
6. **Apply** — write the final string into `marketing.ts` for the ID. If the ID isn't in the registry yet (extraction pending), leave the ledger entry `status: placeholder`, record the captured source, report it — don't fail.
7. **Verify + report** — typecheck/build, run `rg "\[\["` for remaining stubs, report per ID: placed / still-placeholder / flagged / drift.

## Guardrails (defined in `docs/DESIGN.md`, enforced here)

- Colorado only; no towns/cities/neighborhoods. Region terms like "Front Range" flagged for confirmation.
- Never invent services, claims, philosophy, or biographical detail — Cal supplies all substance.
- Public emergency resources (ASPCA, 24/7 vet ER) allowed as real `public-fact` entries.
- **POV.** Marketing copy in `marketing.ts` is **Cal's first person**; non-marketing/system text is **third person** about Cal ("Cal will get back to you"). Client-signed consent and Cal-signed emails are exceptions. Full rule + surfaces in DESIGN.md ("Point of view").

## Edge cases

- **Missing registry ID:** record in source + ledger as pending, report; never fail the run.
- **Inline-link prose** (text wrapping a link, e.g. about-page references): keep the body **one entry**, write the link inline as a `[label](href)` marker (see _Inline links_ above). Do **not** split into `.pre`/`.link`/`.post` sub-IDs — that fragments the verbatim block and breaks the Step 4 diff. While a slot is still a `[[ ... ]]` placeholder there is no marker yet; the marker is added when Cal's real copy lands.

## Invocation (Claude)

- `/copy-sync` + pasted dump → full run.
- Plain ask ("sync this copy from Cal: …") → auto-triggers.
- `/copy-sync status` → read-only report of every ID; no writes.

---

_Last reviewed: 2026-06-19_ (added POV guardrail: marketing first person, system text third person; client-consent + email exceptions — full rule in DESIGN.md)
