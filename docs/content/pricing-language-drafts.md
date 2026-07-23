# Pricing language drafts — copy-sync review

Cal's approval required on tooltip descriptions and label renames below. Once approved, these become binding via the copy-sync protocol (see `docs/CONTENT.md`).

---

## 1. Shipped tooltip descriptions (confirm or revise)

These strings currently ship in `src/features/pricing/term-descriptions.ts` as tooltips on pricing modifiers and breakdown rows. **Marked shipped as draft — confirm, revise, or approve for final.**

| Structure key | Shipped description                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------- |
| `premiumDays` | Holiday & peak-date rate — a surcharge that applies on major holidays and other high-demand dates. |
| `needyTier`   | Extra-attention care — for pets needing more frequent check-ins or hands-on care during the stay.  |
| `nightsOver4` | Long stay — applies once a booking runs longer than 4 nights.                                      |
| `nightsOver6` | Extended stay — applies once a booking runs longer than 6 nights.                                  |
| `unit:cat`    | Per cat, including the first.                                                                      |
| `unit:dog`    | Per dog, including the first.                                                                      |

**Note on `unit:cat` accuracy:** "including the first" is only accurate when a dog is also on the booking. On a cats-only booking, the first cat is the base rate (not charged the per-cat amount) — see `unitCount()` in `src/features/pricing/modifiers/evaluate.ts`. Flagging for Cal to reword if desired (e.g. distinguish the cats-only case).

**Reconfirmed 2026-07-23** by the copy cleanup pass (`docs/content/voice/copy-register.md`, row F3). The audit re-derived the rule from `unitCount()` independently and reached the same conclusion, then deliberately left the string alone: the writing standard forbids correcting a fact as firmly as inventing one, so this needs Cal's decision rather than a rewrite. The audit also checked `Per dog, including the first.` on the same code path and found the key unreachable in practice — dogs price via `tiered_per_unit`, never `flat_per_unit` — so no change is warranted there.

---

## 2. Admin-config label renames (Cal applies directly in admin editor)

The following label changes live in each service's pricing configuration (admin editor), **not shipped in code**. The descriptions reference modifier structure (above), so they survive the rename without code changes.

| Current label  | → New label              |
| -------------- | ------------------------ |
| Premium night  | Holiday & peak-date rate |
| Needy pet care | Extra-attention care     |

**Note:** Cal edits these directly in the admin-config UI per service. Once applied, the descriptions in Section 1 automatically key off the modifier structure and remain in sync.

---

## 3. FAQ candidates

**Long stay**, **extended stay**, **premium / holiday & peak-date**, and **needy / extra-attention care** are candidates for the FAQ pass (tester-confusion themes: pricing terms, approval flow, service area).

Cross-ref: `docs/superpowers/specs/2026-07-12-tester-feedback-action-plan.md` § F (Pricing language & definitions) and § G (Content & copy, FAQ action).

---

_Awaiting Cal approval for copy-sync gate._
