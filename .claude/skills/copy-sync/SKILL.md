---
name: copy-sync
description: Use when transplanting Cal's marketing copy into the site or syncing revisions — placing text into src/content/marketing.ts from a dump, updating already-placed copy, or reporting copy status. Triggers on "/copy-sync", "sync this copy from Cal", pasted Cal text, or "copy status".
---

# copy-sync

Follow the protocol in `docs/CONTENT.md` exactly. It is the model-neutral source of truth; this skill only routes you there.

## Checklist (from docs/CONTENT.md — create a TodoWrite item per step)

1. Intake — take the dump raw, no edits.
2. Map — infer IDs, present mapping table, get confirmation; flag anything ambiguous.
3. Capture — write confirmed chunks verbatim into `docs/content/cal-source.md`.
4. Diff — `cal-source` vs ledger `applied-from` (new/changed/unchanged) + drift detection.
5. Transform + confirm gate — auto-adapt only capitalization/punctuation; STOP and confirm for action items, grammar/wording, or directive-vs-copy ambiguity.
6. Apply — write the final string to `src/content/marketing.ts`; if the ID is not in the registry yet, keep the ledger entry pending and report (do not fail).
7. Verify + report — typecheck, `rg "\[\["`, report placed / placeholder / flagged / drift.

## Hard rules

- Words are Cal's, verbatim. Only capitalization and punctuation may change without asking.
- `docs/content/cal-source.md` is authority; user-confirmed transforms persist across runs.
- Record provenance for every ID (`cal-verbatim` / `cal-confirmed-edit` / `agent-resolved` / `public-fact`).
- Honor the copy guardrails in `docs/DESIGN.md` (Colorado-only, no invented claims; flag region terms like "Front Range").

`/copy-sync status` → read-only: report every ledger ID's status, write nothing.
