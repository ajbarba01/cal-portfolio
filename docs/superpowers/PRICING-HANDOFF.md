# Pricing engine — handoff (retired)

> **Retired.** This was the running handoff for the 2026-06 pricing-engine overhaul, kept so a fresh agent could pick the work up mid-flight. All four of its phases shipped and its "do next" list is closed, so it is no longer a place to take instructions from. It stays as a stub only because two specs of that era link to it.

**Do not act on the old contents.** Two claims in particular were still true when they were written and are false now: the pricing-modifier migration and the `pets.birthdate` migration were both described as unpushed, and both have long since been applied to production. Every migration in `supabase/migrations/` up to the launch-readiness set is on prod; the live services already serve modifier-shaped configs.

Where the same ground is now covered:

- **The pricing model** — what kinds of rule exist, the order they apply in, who may change what, and why the database rather than any document is the source of truth for rates: [DESIGN.md](../DESIGN.md), "Pricing model".
- **What the engine actually does** — `src/features/pricing/`: the rule union in `modifier-types.ts`, the phase order in `modifiers/evaluate.ts`, and the tests beside them.
- **Why a given decision was made** — the specs and plans under `docs/superpowers/`, and the commit history.

---

_Last reviewed: 2026-09-03_
