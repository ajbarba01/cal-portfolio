# Content Protocol (copy-sync)

> Model-neutral rules for transplanting Cal's marketing copy into the site and keeping it in sync. Any agent (Claude/Codex/Gemini) follows this doc. Claude reaches it via the `copy-sync` skill. Marker grammar for `[[ ]]` placeholders lives in `docs/DESIGN.md` ("Copy placeholders") and is not restated here.

## Artifacts

| File                          | Role                                                 | Authority                        |
| ----------------------------- | ---------------------------------------------------- | -------------------------------- |
| `docs/content/cal-source.md`  | Cal's verbatim text, by ID.                          | **Source of truth**              |
| `src/content/marketing.ts`    | Typed registry: ID → live string. Components import. | Render target (built separately) |
| `docs/content/copy-ledger.md` | Per-ID status/provenance/diff state.                 | Bridge                           |
| `docs/CONTENT.md`             | This protocol.                                       | Process SoT                      |

## Stable IDs

`<page>.<section>[.<index>].<slot>`. The same token is the heading in `cal-source.md`, the heading in `copy-ledger.md`, and the key in `marketing.ts`. The ID is the link — trace any string by grepping its ID. IDs are stable; never renumber a slot that already has a ledger entry.

## Authority rule

`cal-source.md` wins. The website is downstream. **But** user-confirmed transforms persist: a re-run must not undo a confirmed adaptation unless Cal's raw text itself changed. The diff that decides "changed" is `cal-source` text vs the ledger's `applied-from` — not the live string.

## Provenance taxonomy

- `cal-verbatim` — Cal's exact words; only capitalization/punctuation adapted to the slot.
- `cal-confirmed-edit` — Cal's words plus a grammar/wording change the user approved.
- `agent-resolved` — an action item the agent filled per Cal's directive (e.g. a resolved hyperlink target).
- `public-fact` — real external info (e.g. ASPCA poison line); verifiable, not a claim about Cal.
- `placeholder` — untouched stub.

## The protocol (run these in order)

1. **Intake** — take Cal's text dump raw. Make no edits yet.
2. **Map** — infer the target ID for each chunk (handles loose `Header:` / `Trust point N:` labels). Present a mapping table and get the user's confirmation. Anything ambiguous → flag and ask before proceeding.
3. **Capture** — write the confirmed chunks verbatim into `cal-source.md` under their IDs. Authority is now locked.
4. **Diff** — per touched ID, compare `cal-source` text vs ledger `applied-from`: new / changed / unchanged. Also run drift detection: if the live registry string ≠ ledger `live-text`, the code was hand-edited — flag it, do not silently overwrite.
5. **Transform + confirm gate** — auto-allowed without asking: capitalization and punctuation to fit the slot. Everything else STOPS:
   - action item (e.g. `(<-- hyperlink)`) → resolve the target, then confirm the target with the user;
   - any grammar or wording concern → ask and confirm before changing;
   - unsure whether text is literal copy or a directive → ask.
     Record every confirmed change as a `transform` in the ledger.
6. **Apply** — write the final string into `marketing.ts` for the ID. If the ID is not in the registry yet (extraction pending), leave the ledger entry `status: placeholder`, record the captured source, and report it — do not fail.
7. **Verify + report** — typecheck/build, run `rg "\[\["` for remaining stubs, and report per ID: placed / still-placeholder / flagged / drift.

## Guardrails (defined in `docs/DESIGN.md`, enforced here)

- Colorado only; no towns/cities/neighborhoods. Region terms like "Front Range" are flagged for confirmation.
- Never invent services, claims, philosophy, or biographical detail — Cal supplies all substance.
- Public emergency resources (ASPCA, 24/7 vet ER) are allowed as real `public-fact` entries.

## Edge cases

- **Missing registry ID:** record in source + ledger as pending, report; never fail the run.
- **Split-JSX prose** (text wrapping a link, e.g. about-page references): decompose into sub-IDs (`.pre` / `.link` / `.post`) or a single templated entry; keep it consistent across runs.

## Invocation (Claude)

- `/copy-sync` + pasted dump → full run.
- Plain ask ("sync this copy from Cal: …") → auto-triggers.
- `/copy-sync status` → read-only report of every ID; no writes.

---

_Last reviewed: 2026-06-09_
