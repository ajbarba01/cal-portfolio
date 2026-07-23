# Writing-Voice Cleanup Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every user-visible non-Cal string on the site against the calibrated `writing-in-voice` standard, then apply the small number of rewrites the audit warrants.

**Architecture:** Two phases with a maintainer gate between them. Phase 1 extracts a candidate string inventory mechanically, then six audit passes inspect those candidates in their source context and record flagged entries in one register at `docs/content/voice/copy-register.md`. Phase 2 rewrites only what the maintainer approved in the register, one commit per surface, with test updates shipping in the same commit as the string they assert. Spec: `docs/superpowers/specs/2026-07-22-writing-voice-design.md` ("Cleanup pass"). Standard: `C:/Users/Zander/.claude/skills/writing-in-voice/`. Regression artifact: `docs/content/voice/fixtures.md`.

**Tech Stack:** TypeScript / Next.js App Router source strings, zod schemas, vitest. One throwaway Node extraction script (source embedded in Task 1, run from the scratchpad, never committed). Everything else is markdown and hand edits.

## Global Constraints

**Scope, in:** client-facing UI microcopy (labels, buttons, hints, section titles, placeholders, empty states across marketing chrome, auth, onboarding, account, booking), feedback text (validation messages, server errors, toasts, gate panels, refusal reasons), and admin-only surfaces.

**Scope, out — never edit a string in any of these:**

- `src/content/marketing.ts` — Cal owns it under `docs/CONTENT.md`'s authority rule. Any string rendered through `<MarketingCopy id="…" />` or `copy["…"]` is Cal's, wherever it appears.
- `src/content/rover-reviews.ts` — third-party reviewers' verbatim words.
- `src/features/notifications/emails.ts` — email templates belong to tester-feedback Group H and inherit the finished voice.
- `src/app/showcase/**` — dev-only catalog, 404s in production.
- Developer-facing text: code comments, JSDoc, docs under `docs/`, thrown invariant errors a user never sees (`Booking '${id}' has no service`), Supabase select strings, log prefixes.
- Tests, except where a test asserts a string this plan changes.

**Hard rules on content:**

- **Never invent a fact and never correct one.** `"Per cat, including the first."` is factually wrong on a cats-only booking. Both calibration rounds correctly left it alone and flagged it. A rewriter that "fixes" a fact is guessing at pricing logic it cannot see.
- **`src/features/pricing/term-descriptions.ts` routes through copy-sync.** Those tooltip strings are pending Cal's approval in `docs/content/pricing-language-drafts.md`. A warranted change is recorded as a `route:copy-sync` register row and a line added to the drafts doc — it never lands in the source file.
- **POV per `docs/DESIGN.md` ("Point of view"):** non-marketing/system text is third person about Cal. Never introduce a gendered pronoun for Cal — use "Cal" or they/them. Client-signed consent (`EXPENSE_AUTH_TEXT`) stays the client's first person and is not a defect.
- **Form conventions per `docs/COMPONENT_SYSTEM.md`:** required is the unmarked default; optional fields carry the muted `optional` suffix, no asterisks anywhere.
- **Validation messages are shared client and server.** They live in zod schemas both sides parse, so those schema files are copy files.
- **Tests assert exact strings.** Copy changes ship with their test updates in the _same_ commit, never as follow-up. Before changing any string, grep it across tests (exact command in each rewrite task).

**Calibration findings that size this work:**

- **The standard is deliberately conservative.** Across 22 real strings it changed 2. That is approved behaviour — a standard that cannot leave good text alone churns working copy. Expect roughly one flagged entry per twenty in-scope strings. **A task that flags or rewrites most of its strings is a defect signal: stop and report rather than commit.**
- **`cal.md` barely binds on interface copy.** Almost no string on the site is _about_ Cal, so its traits have no surface to apply to. This pass runs mostly on `references/craft.md` and `references/ai-tells.md`. Do not budget effort for voice-matching across the corpus.
- **Do not re-flag strings `fixtures.md` already approved as correct.** That file's "Approved as already correct" and "Blind round" tables are settled judgements. Re-opening one requires a reason recorded in the register, not a silent rewrite.

**Process constraints:**

- **Prose subagents run on sonnet, not opus.** Opus was blocked twice by a content filter on plan 1's writing tasks — zero bytes written, on two differently-worded prompts. Sonnet ran the identical task immediately. Mechanical tasks (Task 1) may use either.
- **Never use PowerShell `Set-Content` / `Out-File` on UTF-8 sources or markdown.** It mojibakes every em dash. Use the Edit and Write tools only.
- Work on `main`, no worktree. Stage files by name.
- Commit messages: subject line only, Conventional Commits, no body, no trailers, no "Generated with" footer, no internal identifiers (no plan names, phase numbers, or task numbers).
- The pre-commit hook runs `lint-staged` (eslint --fix + prettier) then `npm run typecheck`. Prettier reformats markdown tables — re-stage any file the hook modifies.
- Run `node scripts/check-doc-links.mjs` after staging and before committing whenever docs change. It validates the staged version.
- Same-commit doc rule: a change that adds or moves an artifact updates the doc that owns it in the same commit.
- `.superpowers/sdd/progress.md` holds only the current plan's ledger. Read plan 1's record before overwriting it — it carries the calibration history and carried-forward minors.

---

## File structure

**Created:**

- `docs/content/voice/copy-register.md` — the audit artifact. Method, exclusions, a per-group coverage table, and one row per flagged string with its tell, verdict, and reason. Read by every rewrite task; the final verification gate checks every row is resolved.

**Modified (docs):**

- `docs/CONTENT.md` — one pointer line in the existing `## Voice` section naming the register. Task 1.
- `docs/superpowers/specs/2026-07-22-writing-voice-design.md` — status reconciliation at the end. Task 13.
- `docs/content/pricing-language-drafts.md` — only if the audit warrants a `term-descriptions.ts` change. Task 13.

**Modified (source):** determined by the register. Nothing is edited before Task 8.

**Not committed:**

- The extraction script and its output live in the session scratchpad. It is a one-shot inventory tool, not a check the repo needs to keep running; its full source is embedded in Task 1 so the inventory is reproducible from this plan alone.

---

## Surface groups

The corpus is partitioned into seven groups. Every `src/**/*.{ts,tsx}` file outside the exclusion list belongs to exactly one, assigned by the first matching rule in the extractor. Candidate counts are from a trial extraction run on 2026-07-23 and are _candidates_, not in-scope strings — expect an auditor to reject 30–50% as developer-facing or technical.

| Group          | Surface                                                 | Paths                                                                                                                                                  | Files | Candidates |
| -------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ---------- |
| `A-public`     | Marketing page chrome + app shell (Cal's copy excluded) | `src/app/(site)/(marketing)/**` (not `book/`), `src/components/**` (not `feedback/`), `src/app/{layout,error,not-found,manifest}.*`                    | 58    | 187        |
| `B-auth`       | Auth + onboarding                                       | `src/app/(auth)/**`, `src/app/(onboarding)/**`                                                                                                         | 8     | 47         |
| `C-account`    | Client account area                                     | `src/app/(site)/(account)/**`, `src/features/accounts/**` (not `*-schema.ts`, not `onboarding-form.ts`)                                                | 32    | 203        |
| `D-booking`    | Booking flow UI                                         | `src/app/(site)/(marketing)/book/**`, `src/features/booking/_components/**`                                                                            | 19    | 109        |
| `E-validation` | zod validation messages (shared client + server)        | `src/**/*-schema.ts`, `src/features/accounts/onboarding-form.ts`                                                                                       | 5     | 23         |
| `F-feedback`   | Server errors, refusal reasons, toasts, gate panels     | `src/features/{booking,payments,pricing,reviews,pets}/**` (not `_components/`), `src/**/*actions.ts`, `src/**/*-core.ts`, `src/components/feedback/**` | 32    | 163        |
| `G-admin`      | Admin surfaces                                          | `src/app/(site)/(admin)/**`, `src/features/admin/**`, `src/features/inquiries/**`                                                                      | 54    | 338        |

**Dual-surface hazard.** Three areas render on both a client and an admin surface, and a rewrite that reads correctly on one can be wrong on the other:

- `src/features/booking/booking-service-shared.ts` — consumed by the client's booking flow _and_ the admin book-on-behalf flow. This is why the distance-refusal string's subject stays "Client"; "Your location" would be wrong for an admin.
- `src/features/inquiries/components/**` — rendered by both `/account/inquiries` and `/admin/inquiries`.
- `src/features/booking/_components/**` — rendered by both `/book/[serviceSlug]` and the admin create-booking flow.

Audit these once, in the group the table assigns, and open both consumers before flagging anything.

---

## Audit protocol

Every audit task (Tasks 2–7) executes this protocol. It is stated once here rather than copied six times, because six copies would drift. Each task supplies its own file list, its own group hazards, and its own commit — everything that varies is in the task.

Dispatch **one sonnet subagent per audit task** with a prompt containing all of the following.

**1. Files the subagent reads in full before inspecting anything:**

- `C:/Users/Zander/.claude/skills/writing-in-voice/SKILL.md`
- `C:/Users/Zander/.claude/skills/writing-in-voice/references/ai-tells.md`
- `C:/Users/Zander/.claude/skills/writing-in-voice/references/craft.md`
- `docs/content/voice/cal.md`
- `docs/content/voice/fixtures.md`
- `docs/CONTENT.md`
- `docs/DESIGN.md` — the "Point of view" bullet
- `docs/COMPONENT_SYSTEM.md` — the form-conventions paragraph

**2. The operation:** the skill's `audit`. It changes nothing. A subagent that edits a source file has failed the task.

**3. The input:** the group's slice of `<scratchpad>/out/candidates.json`, plus the group's file list from the task.

**4. Per candidate string, one of three classifications:**

- **`out-of-scope`** — not user-visible prose. Code comments, thrown invariant errors, Supabase select lists, log prefixes, `aria-label`s that are pure mechanics, CSS/Tailwind fragments, technical identifiers, anything rendered from `marketing.ts`. Counted, not listed.
- **`in-scope, clean`** — user-visible, no tell, no rule broken. Counted, not listed. This is the expected majority.
- **`in-scope, flagged`** — one row in the register.

**5. Context is mandatory.** Open the file and read the string where it lives before classifying it. A string cannot be judged from a JSON array: the blind round's whole value was that it opened `booking-row.tsx` to confirm three list items were three real actions before declining to flag a rule-of-threes. Check siblings too — a construction used consistently across a surface is a convention, not a tic, and rewriting one instance of it makes the surface worse.

**6. Each flagged row records:**

| Column           | Content                                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| String           | The current text, verbatim, with `${…}` for interpolations                        |
| Location         | `path/to/file.tsx:LINE`                                                           |
| Tell / rule      | The exact `### heading` from `ai-tells.md` or `craft.md` it violates              |
| Proposed verdict | `rewrite` · `leave` · `route:copy-sync` · `route:component` · `route:engineering` |
| Proposed text    | The rewrite, if the verdict is `rewrite`. Blank otherwise.                        |
| Note             | One line: why. For `route:*`, which owner and why copy cannot fix it.             |

**7. Verdict meanings:**

- `rewrite` — a warranted copy change this plan will apply.
- `leave` — flagged and deliberately not changed. Used when a tell is present but rewriting costs more than it buys, most often consistency with siblings.
- `route:copy-sync` — Cal's approval needed before the string can change. Two destinations: pricing terms (`term-descriptions.ts`, admin pricing labels) are recorded in `docs/content/pricing-language-drafts.md`; everything else on the marketing/system boundary is reported to the maintainer at close-out for routing to Cal. A `route:copy-sync` row does not require a named tell if the reason it needs Cal is ownership rather than craft.
- `route:component` — the fix is a component change, not a copy change. Precedent: `Additional owners (optional)` is a `FieldGroup.title`, not a `FormField` label, so the site's optional-suffix convention never reaches it. Same pattern at `src/features/accounts/_components/profile-fields.tsx:130`.
- `route:engineering` — the copy describes the code incorrectly and the code is the question. Precedent: `Enter a valid 5-digit ZIP code` understates a regex that also accepts ZIP+4.

**8. Reporting.** The subagent returns the flagged rows plus a coverage line per file: `path — N candidates, M out-of-scope, K in-scope, J flagged`. **A group whose flag rate exceeds 1 in 5 in-scope strings is a defect signal** — the subagent reports it and stops rather than producing a long flag list.

**9. What the subagent never does:** invent a fact, correct a fact, change what a string promises, touch a number or an interpolated value, rewrite anything `fixtures.md` approved as already correct without recording why, or edit source.

---

### Task 1: Extraction and register scaffold

**Files:**

- Create: `docs/content/voice/copy-register.md`
- Modify: `docs/CONTENT.md` (`## Voice` section)
- Scratchpad only: `<scratchpad>/extract-copy.mjs`, `<scratchpad>/out/candidates.json`, `<scratchpad>/out/coverage.md`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `docs/content/voice/copy-register.md` with its `## Method`, `## Exclusions`, `## Coverage`, and per-group flagged-entry sections, seeded with the five findings already settled by calibration. Every audit task (2–7) appends rows to its own group section and fills its coverage row. `<scratchpad>/out/candidates.json` is the input every audit task reads.

This task is mechanical. It may run on sonnet or opus.

- [ ] **Step 1: Write the extractor**

Write this file to the session scratchpad as `extract-copy.mjs`. Do not commit it — it is a one-shot inventory tool, and a committed script becomes a doc obligation and a maintenance surface for a pass that runs once.

```javascript
// Copy-register extractor. One-shot tool for the writing-voice cleanup pass.
// Usage: node extract-copy.mjs <repo-root> <out-dir>
//
// Emits candidates.json (file -> {group, strings[]}) and coverage.md (per-group
// totals). Deliberately over-collects: an auditor rejects the noise, and a
// missed string never reaches the register at all.
import { readFileSync, writeFileSync, globSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
const outDir = process.argv[3];
mkdirSync(outDir, { recursive: true });

// Files whose strings are out of bounds for this pass.
const EXCLUDE = [
  /\.test\.(ts|tsx)$/, // tests
  /^src\/content\/marketing\.ts$/, // Cal owns it
  /^src\/content\/rover-reviews\.ts$/, // third-party reviewer words
  /^src\/app\/showcase\//, // dev-only, 404 in production
  /^src\/features\/notifications\/emails\.ts$/, // Group H, out of scope
  /^src\/test-stubs\//,
];

// Surface groups. First match wins, so order matters.
const GROUPS = [
  ["D-booking", /^src\/app\/\(site\)\/\(marketing\)\/book\//],
  ["D-booking", /^src\/features\/booking\/_components\//],
  ["G-admin", /^src\/app\/\(site\)\/\(admin\)\//],
  ["G-admin", /^src\/features\/admin\//],
  ["G-admin", /^src\/features\/inquiries\//],
  [
    "E-validation",
    /schema\.ts$|^src\/features\/accounts\/onboarding-form\.ts$/,
  ],
  ["B-auth", /^src\/app\/\((auth|onboarding)\)\//],
  ["C-account", /^src\/app\/\(site\)\/\(account\)\//],
  ["C-account", /^src\/features\/accounts\//],
  ["F-feedback", /actions?\.ts$|-core\.ts$|messages\.ts$|-copy\.ts$/],
  ["F-feedback", /^src\/features\/(booking|payments|pricing|reviews|pets)\//],
  ["F-feedback", /^src\/components\/feedback\//],
  ["A-public", /.*/],
];

/**
 * Scan source once, tracking string / comment state, and return every string
 * literal and JSX text node. Comment bodies are dropped — a naive regex sweep
 * pulls in code comments and buries the real copy.
 */
function scanLiterals(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      let buf = "";
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          buf += src[i + 1] === "n" ? " " : src[i + 1];
          i += 2;
          continue;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          // Keep template placeholders as an opaque token so an interpolated
          // sentence still reads as one string in the register.
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          buf += "${…}";
          continue;
        }
        buf += src[i];
        i++;
      }
      i++;
      out.push(buf);
    } else {
      i++;
    }
  }
  // JSX text nodes: a capitalised run between tags, no braces or angle brackets.
  for (const m of src.matchAll(/>\s*([A-Z][^<>{}\n]{3,300}?)\s*</g))
    out.push(m[1]);
  return out;
}

const TAILWIND = /^[a-z0-9:[\]\-./%()_,]+$/;
const DIRECTIVE = /^use (client|server|strict)$/;
// `id, status, ends_at` / `profiles(email, unclaimed)` — Supabase select lists.
const COLUMN_LIST = /^[a-z_]+(\([^)]*\))?(\s*,\s*[a-z_]+(\([^)]*\))?)*$/;

const isProse = (s) => {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length < 4 || t.length > 400) return false;
  if (!/[a-z]/.test(t)) return false; // ALL-CAPS keys, enums
  if (DIRECTIVE.test(t)) return false;
  if (/^(https?:|\/|\.\/|#|@|data:)/.test(t)) return false; // urls, paths, imports
  if (/[<>{}]/.test(t.replace(/\$\{…\}/g, ""))) return false; // markup fragments
  if (/^[a-z0-9_\-./]+$/.test(t)) return false; // slugs, ids, keys
  if (COLUMN_LIST.test(t)) return false;
  if (/[a-z]_[a-z]/.test(t) && !/[.?!]/.test(t)) return false; // snake_case identifiers
  const tokens = t.split(" ");
  // Tailwind / CSS class strings: every token looks like a utility class.
  if (
    !/[A-Z]/.test(t) &&
    tokens.every((w) => TAILWIND.test(w)) &&
    /[-:]/.test(t)
  )
    return false;
  return tokens.length >= 2 || /[?!.]$/.test(t);
};

const groupOf = (rel) => GROUPS.find(([, re]) => re.test(rel))[0];

const files = globSync("src/**/*.{ts,tsx}", { cwd: root })
  .map((f) => f.split(path.sep).join("/"))
  .filter((f) => !EXCLUDE.some((re) => re.test(f)))
  .sort();

const byFile = {};
for (const rel of files) {
  const found = new Set();
  for (const raw of scanLiterals(readFileSync(path.join(root, rel), "utf8"))) {
    if (isProse(raw)) found.add(raw.trim().replace(/\s+/g, " "));
  }
  if (found.size)
    byFile[rel] = { group: groupOf(rel), strings: [...found].sort() };
}

writeFileSync(
  path.join(outDir, "candidates.json"),
  JSON.stringify(byFile, null, 2),
);

const totals = {};
for (const { group, strings } of Object.values(byFile)) {
  totals[group] ??= { files: 0, strings: 0 };
  totals[group].files += 1;
  totals[group].strings += strings.length;
}
const lines = ["| Group | Files | Candidate strings |", "| --- | --- | --- |"];
for (const g of Object.keys(totals).sort())
  lines.push(`| ${g} | ${totals[g].files} | ${totals[g].strings} |`);
writeFileSync(path.join(outDir, "coverage.md"), lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(
  "\nTOTAL",
  Object.values(totals).reduce((a, b) => a + b.strings, 0),
  "candidates in",
  Object.keys(byFile).length,
  "files",
);
```

- [ ] **Step 2: Run it and check the totals**

Run from the repo root, substituting the session scratchpad path:

```bash
node <scratchpad>/extract-copy.mjs "$(pwd)" <scratchpad>/out
```

Expected output — these are the trial-run numbers from 2026-07-23. Small drift is fine; a group that moves by more than ~20% means the source changed or the script was mistranscribed, and the extractor is wrong until that is explained.

```
| Group | Files | Candidate strings |
| --- | --- | --- |
| A-public | 58 | 187 |
| B-auth | 8 | 47 |
| C-account | 32 | 203 |
| D-booking | 19 | 109 |
| E-validation | 5 | 23 |
| F-feedback | 32 | 163 |
| G-admin | 54 | 338 |

TOTAL 1070 candidates in 208 files
```

- [ ] **Step 3: Spot-check the extraction for misses**

The extractor over-collects on purpose, so noise is expected and harmless. A _miss_ is not. Check three known strings survived:

```bash
grep -c "Keep these up to date" <scratchpad>/out/candidates.json
grep -c "Hard cutoff is" <scratchpad>/out/candidates.json
grep -c "No eligible pets yet" <scratchpad>/out/candidates.json
```

Expected: `1` from each. Any `0` means the scanner dropped a real string — fix the extractor and rerun before continuing.

- [ ] **Step 4: Write the register scaffold**

Create `docs/content/voice/copy-register.md`. Use the Write tool, never PowerShell redirection. Fill the coverage table's `Candidates` column from Step 2 and leave the audit columns empty — Tasks 2–7 fill them.

```markdown
# Copy register — cleanup pass

> Audit of every user-visible non-Cal string against the `writing-in-voice`
> standard. Started 2026-07-23. Standard:
> `~/.claude/skills/writing-in-voice/`. Approved judgements and the calibration
> history live in `docs/content/voice/fixtures.md`.

The standard is conservative by design: across the 22 strings of calibration it
changed 2. This register is expected to be short. A long one means the audit
drifted into taste, not that the site is badly written.

## Method

Candidate strings were extracted mechanically from `src/**/*.{ts,tsx}`: every
string literal, template literal, and JSX text node outside a comment, filtered
to drop URLs, slugs, Tailwind class strings, `use client` directives, Supabase
select lists, and snake_case identifiers. The filter over-collects on purpose —
an auditor can reject noise, but a string that never reached the list never got
looked at.

Each candidate was then opened in its source file and classified as
`out-of-scope` (not user-visible prose), `in-scope, clean`, or `in-scope,
flagged`. Only flagged strings get a row below. Enumerating all ~1,070
candidates was rejected: the artifact would be ten times the size and nine
tenths of it would read "no tell found". The coverage table carries the same
guarantee that nothing was skipped.

## Exclusions

| Path                                     | Why                                            |
| ---------------------------------------- | ---------------------------------------------- |
| `src/content/marketing.ts`               | Cal owns it (`docs/CONTENT.md` authority rule) |
| Anything rendered via `<MarketingCopy>`  | Cal's words, wherever the render site lives    |
| `src/content/rover-reviews.ts`           | Third-party reviewers' verbatim words          |
| `src/features/notifications/emails.ts`   | Email templates — tester-feedback Group H      |
| `src/app/showcase/**`                    | Dev-only catalog, 404s in production           |
| Comments, JSDoc, thrown invariant errors | Developer-facing                               |
| `docs/**`                                | Developer-facing                               |

## Coverage

| Group          | Surface                         | Files | Candidates | Out of scope | In scope | Flagged |
| -------------- | ------------------------------- | ----- | ---------- | ------------ | -------- | ------- |
| `A-public`     | Marketing chrome + app shell    | 58    | 187        |              |          |         |
| `B-auth`       | Auth + onboarding               | 8     | 47         |              |          |         |
| `C-account`    | Client account area             | 32    | 203        |              |          |         |
| `D-booking`    | Booking flow UI                 | 19    | 109        |              |          |         |
| `E-validation` | zod validation messages         | 5     | 23         |              |          |         |
| `F-feedback`   | Server errors, refusals, toasts | 32    | 163        |              |          |         |
| `G-admin`      | Admin surfaces                  | 54    | 338        |              |          |         |

## Verdicts

`rewrite` — warranted copy change, applied by this pass.
`leave` — tell present, deliberately not changed; the note says why.
`route:copy-sync` — needs Cal's approval; recorded in `docs/content/pricing-language-drafts.md`.
`route:component` — the fix is a component change, not a copy change.
`route:engineering` — the copy describes the code incorrectly; the code is the question.

## Flagged entries

### Carried over from calibration

These five were settled in `docs/content/voice/fixtures.md` and are seeded here
so the pass applies and closes them.

| #   | String                                                                            | Location                                                   | Tell / rule                                | Verdict             | Proposed text                                                       | Note                                                                                                                |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| K1  | `Keep these up to date and don't worry, these forms are confidential and secure.` | `src/app/(site)/(account)/account/forms/page.tsx:76`       | craft: Cut words that don't change meaning | `rewrite`           | `Keep these up to date. They're confidential and secure.`           | Approved in fixtures. Splits a comma splice; "don't worry" told the reader how to feel instead of stating the fact. |
| K2  | `Client location is too far (${…} mi). Hard cutoff is ${…} mi.`                   | `src/features/booking/booking-service-shared.ts:706`       | craft: Vary sentence length                | `rewrite`           | `Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.` | Approved in fixtures. Matches the sibling warning at line 701. Subject stays "Client" — admin also reads this.      |
| K3  | `Additional owners (optional)`                                                    | `src/features/accounts/_components/profile-fields.tsx:95`  | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | A `FieldGroup.title`, not a `FormField` label, so the optional-suffix convention never reaches it.                  |
| K4  | (same pattern)                                                                    | `src/features/accounts/_components/profile-fields.tsx:130` | COMPONENT_SYSTEM: optional suffix          | `route:component`   |                                                                     | Same `FieldGroup.title` gap as K3.                                                                                  |
| K5  | `Enter a valid 5-digit ZIP code`                                                  | `src/features/accounts/profile-schema.ts:21`               | craft: Prefer the specific fact            | `route:engineering` |                                                                     | Describes only the 5-digit case; the regex also accepts ZIP+4. Copy cannot fix a mismatch with the code.            |

### Group A — marketing chrome + app shell

_Audit pending._

### Group B — auth + onboarding

_Audit pending._

### Group C — client account area

_Audit pending._

### Group D — booking flow UI

_Audit pending._

### Group E — zod validation messages

_Audit pending._

### Group F — server errors, refusals, toasts

_Audit pending._

### Group G — admin surfaces

_Audit pending._

---

_Last reviewed: 2026-07-23_
```

- [ ] **Step 5: Point CONTENT.md at the register (same commit)**

In `docs/CONTENT.md`, in the existing `## Voice` section, add one sentence after the paragraph about `cal.md`:

```markdown
`docs/content/voice/copy-register.md` records the cleanup pass over the site's
non-Cal text — every flagged string with its tell, verdict, and reason,
including the ones deliberately left alone.
```

Update the doc's `_Last reviewed:_` footer to `2026-07-23` and keep the existing parenthetical history line.

- [ ] **Step 6: Verify links and commit**

```bash
git add docs/content/voice/copy-register.md docs/CONTENT.md
node scripts/check-doc-links.mjs
git commit -m "docs: register site copy for a voice audit"
```

Expected: the link checker reports no broken relative links. If the pre-commit hook reformats either file, re-stage it and commit again.

---

### Task 2: Audit — marketing chrome, app shell, auth, onboarding

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group A and Group B sections, and their coverage rows)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), groups `A-public` and `B-auth`.
- Produces: filled Group A and Group B sections plus their two coverage rows. Task 9 rewrites every `rewrite` row in these groups.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** groups `A-public` (58 files, 187 candidates) and `B-auth` (8 files, 47 candidates).

- `A-public`: `src/app/(site)/(marketing)/**` excluding `book/`; `src/components/**` excluding `src/components/feedback/`; `src/app/layout.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx`, `src/app/manifest.ts`, `src/app/opengraph-image.tsx`.
- `B-auth`: `src/app/(auth)/**`, `src/app/(onboarding)/**`.

**Group hazards, stated to the subagent verbatim:**

- **The marketing pages are mostly Cal's words and mostly out of bounds.** `resources/page.tsx`, `services/page.tsx`, `about/page.tsx`, and `page.tsx` render Cal's prose through `<MarketingCopy id="…" />` and `copy["…"]`. Only the hardcoded literals around those renders — section headings, filter labels, button text, alt text, empty states — are in scope. If a string appears in `src/content/marketing.ts`, it is out of scope, full stop.
- `src/components/ui/**` is primitive plumbing. Most of its strings are `aria-label`s and variant keys, not copy. Do not manufacture flags there.
- Onboarding copy for declined/unrecognised statuses is deliberately placeholdered pending Cal — leave placeholders alone.
- `src/app/(site)/(marketing)/contact/_components/contact-form.tsx` carries `Thanks — Cal will get back to you within a day.` and a shorter toast variant. Correct third-person POV; check the two against each other rather than either alone.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

Read the subagent's coverage numbers. If flagged exceeds 1 in 5 in-scope strings for either group, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated. Calibration changed 2 strings in 22.

- [ ] **Step 3: Write the rows into the register**

Replace `_Audit pending._` under `### Group A` and `### Group B` with the flagged-entry table (or, if a group produced no flags, the single line `No entries flagged. N strings inspected, M in scope.`). Fill both coverage rows.

Use the Edit tool. Never PowerShell redirection — it mojibakes em dashes, and these rows will contain them.

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit public and onboarding copy"
```

Re-stage and re-commit if the pre-commit hook reformats the table.

---

### Task 3: Audit — client account area

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group C section and coverage row)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), group `C-account`.
- Produces: filled Group C section plus its coverage row. Task 9 rewrites every `rewrite` row in this group.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** group `C-account` (32 files, 203 candidates): `src/app/(site)/(account)/**` and `src/features/accounts/**`, excluding `*-schema.ts` and `onboarding-form.ts` (those are Task 5's).

**Group hazards, stated to the subagent verbatim:**

- This surface holds the site's densest instructional copy — the intake form hints in `profile-fields.tsx` (63 candidates) and `form-card.tsx` (32). Those hints describe what a client should write in a field. They are in scope, and they are also the place where an over-eager rewrite does the most damage, because a hint that loses a specific ("Where to find it if the power trips") for a smoother abstraction is strictly worse.
- Four strings on this surface are already approved in `fixtures.md` and must not be re-flagged without a recorded reason: `No pets added yet.`, `Messages you've sent to Cal. Mark one resolved once you no longer need a reply.`, `Add or edit your pets. Name, species, breed, a photo, and any care notes.`, `Update your contact info. Email is managed through your login.`
- `K1` (`account/forms/page.tsx:76`) is already seeded in the register as a `rewrite`. Do not duplicate it.
- `EXPENSE_AUTH_TEXT` and any other client-signed consent stays the client's first person. That is an intentional POV exception per `docs/DESIGN.md`, not a defect.
- `src/features/accounts/_components/profile-fields.tsx:95` and `:130` are already seeded as `route:component`. Do not re-flag them as copy.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

If flagged exceeds 1 in 5 in-scope strings, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated.

- [ ] **Step 3: Write the rows into the register**

Replace `_Audit pending._` under `### Group C` with the flagged-entry table, or `No entries flagged. N strings inspected, M in scope.` Fill the coverage row. Edit tool only.

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit account-area copy"
```

---

### Task 4: Audit — booking flow UI

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group D section and coverage row)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), group `D-booking`.
- Produces: filled Group D section plus its coverage row. Task 10 rewrites every `rewrite` row in this group.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** group `D-booking` (19 files, 109 candidates): `src/app/(site)/(marketing)/book/**` and `src/features/booking/_components/**` (including `_components/scheduler/**`).

**Group hazards, stated to the subagent verbatim:**

- **Everything here renders on two surfaces.** `src/features/booking/_components/**` is used by the client's `/book/[serviceSlug]` flow _and_ by the admin book-on-behalf flow at `/admin/clients/[clientId]/book`. Before flagging a string, open both consumers. A second-person rewrite ("your visit") that reads well for a client is wrong when an admin is booking on someone's behalf — the same trap that fixed the distance-refusal string's subject as "Client".
- The scheduler (`day-painter.tsx`, `day-timeline.tsx`, `month-grid.tsx`, `legend.tsx`) is dense with short status labels and `aria-label`s. Labels that must stay parallel across a legend are a system, not three independent strings; changing one breaks the set.
- `src/features/pricing/term-descriptions.ts` is _not_ in this group, but its strings surface here as tooltips. If a tooltip reads wrong, the verdict is `route:copy-sync`, never `rewrite` — those strings are pending Cal's approval in `docs/content/pricing-language-drafts.md`.
- `Approve, edit, or cancel right from the row.` and the pricing tooltips are already approved in `fixtures.md`. `Per cat, including the first.` is known to be factually wrong on a cats-only booking and was deliberately left alone by both calibration rounds — do not "fix" it.
- `Anything Cal should know about this visit?` is correct third-person POV.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

If flagged exceeds 1 in 5 in-scope strings, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated.

- [ ] **Step 3: Write the rows into the register**

Replace `_Audit pending._` under `### Group D` with the flagged-entry table, or `No entries flagged. N strings inspected, M in scope.` Fill the coverage row. Edit tool only.

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit booking-flow copy"
```

---

### Task 5: Audit — validation messages and server feedback

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group E and Group F sections, and their coverage rows)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), groups `E-validation` and `F-feedback`.
- Produces: filled Group E and Group F sections plus their two coverage rows. Task 11 rewrites every `rewrite` row in these groups, together with the tests that assert them.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** groups `E-validation` (5 files, 23 candidates) and `F-feedback` (32 files, 163 candidates).

- `E-validation`: `src/features/accounts/{emergency,home-access,home-sitting,owner,pet-care,pet-walk,profile}-schema.ts`, `src/features/accounts/onboarding-form.ts`, `src/features/inquiries/inquiry-schema.ts`, `src/features/reviews/reviews-schema.ts`, `src/features/pricing/config-schemas.ts`, plus inline `z.object` messages in `src/app/(auth)/claim/_components/claim-form.tsx`, `src/app/(site)/(account)/account/_components/password-form.tsx`, `src/app/(site)/(marketing)/reviews/_components/review-form.tsx`, `src/features/accounts/_components/pet-form.tsx`.
- `F-feedback`: `src/features/{booking,payments,pricing,reviews,pets}/**` excluding `_components/`; `src/features/inquiries/inquiry-actions.ts`; `src/app/(site)/(marketing)/book/_components/messages.ts`; `src/app/(site)/(account)/account/bookings/_components/cancel-outcome-copy.ts`; `src/components/feedback/**`.

**Group hazards, stated to the subagent verbatim:**

- **Validation messages are a set, not a list.** Roughly twenty zod messages share one shape (`X is required`). The blind round declined to rewrite `A valid email is required` for exactly this reason: rewriting one in isolation breaks consistency rather than improving anything. A flag here must argue that the _whole set_ is wrong, and then the verdict covers the set.
- **These strings render twice** — inline under a field on the client and as a server error when the same schema parses on the server. A rewrite has to read correctly in both positions.
- **Courtesy on refusals stays.** `craft.md`'s carve-out: "please" and "sorry" are filler in a routine instruction and do real work when the message refuses the reader, blocks them, or asks them to go out of their way after a failure. `We need to sort out your account before you can book. Please get in touch and we'll help.` was rejected as a cut in calibration round 1 and is settled.
- **Most of `F-feedback` is developer-facing and out of scope.** Thrown invariants (`Booking '${id}' has no service`), Supabase select strings, log prefixes (`[stripe-webhook] …`), and error codes never reach a user. Classify them `out-of-scope` and move on.
- `K2` (`booking-service-shared.ts:706`) and `K5` (`profile-schema.ts:21`) are already seeded in the register. Do not duplicate them. `Full name is required` and `Couldn't save your time` are approved as correct in `fixtures.md`.
- Several messages here interpolate numbers (`~${miles} mi away`, `${cutoff} mi`, refund amounts). Every interpolation must survive a rewrite untouched.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

If flagged exceeds 1 in 5 in-scope strings for either group, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated.

- [ ] **Step 3: Record test coupling for every flagged row**

For each row with verdict `rewrite`, run this and append the result to the row's Note as `tests: <files>` or `tests: none`:

```bash
grep -rln "<the exact current string>" src --include=*.test.ts --include=*.test.tsx
```

This is the group where the coupling is real — 29 test files assert copy-ish strings, and Task 11 must ship those updates in the same commit.

- [ ] **Step 4: Write the rows into the register**

Replace `_Audit pending._` under `### Group E` and `### Group F` with the flagged-entry tables, or `No entries flagged. N strings inspected, M in scope.` Fill both coverage rows. Edit tool only.

- [ ] **Step 5: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit validation and server-feedback copy"
```

---

### Task 6: Audit — admin pages

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group G section, first half, and a partial coverage row)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), group `G-admin`, restricted to `src/app/(site)/(admin)/**`.
- Produces: the first half of the Group G table under a `**Admin pages**` sub-heading. Task 7 appends the second half and completes the coverage row. Task 12 rewrites every `rewrite` row in Group G.

Group G is split across two tasks because 338 candidates in one pass degrades judgement — this half is 34 files and 245 candidates.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** `src/app/(site)/(admin)/**` only (34 files, 245 candidates). The heaviest files are `settings/_components/settings-client.tsx` (52), `clients/[clientId]/_components/client-detail-client.tsx` (52), `bookings/_components/bookings-calendar-client.tsx` (50), `clients/_components/clients-index-client.tsx` (30), `availability/_components/availability-client.tsx` (27).

**Group hazards, stated to the subagent verbatim:**

- **The reader is Cal, not a client.** Admin copy is operational: it should be terse, unambiguous, and free of reassurance. A tell that matters in client copy — a missing courtesy, a bare fragment — is usually correct here. Flag inflated significance and promotional framing; do not flag terseness.
- **Third person about Cal still applies**, and admin copy is where a "you" can slip in meaning Cal. That is fine when the system is speaking to Cal, and wrong when the string also renders on a client surface.
- Admin table headers, column labels, filter chips, and status badges are a labelling system. They must stay parallel across a table; changing one breaks the set.
- `Approve before the visit?`, `No inquiries yet.`, `This clears it from your open queue. You can still find it under the Resolved filter. This can't be undone.`, `Create a record for an offline client. They claim the account later.`, and `Approve, edit, or cancel right from the row.` are approved in `fixtures.md` and must not be re-flagged without a recorded reason.
- `admin-kiche-control.tsx` copy describes a real discount rule. Do not restate the rule more confidently than the source does.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

If flagged exceeds 1 in 5 in-scope strings, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated.

- [ ] **Step 3: Write the rows into the register**

Under `### Group G`, replace `_Audit pending._` with a `**Admin pages**` sub-heading followed by the flagged-entry table, or `No entries flagged. N strings inspected, M in scope.` Leave the coverage row's numbers as a partial (`245 of 338 candidates inspected`) — Task 7 completes it. Edit tool only.

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit admin page copy"
```

---

### Task 7: Audit — admin features and inquiries

**Files:**

- Modify: `docs/content/voice/copy-register.md` (Group G section, second half, and completing the coverage row)

**Interfaces:**

- Consumes: `<scratchpad>/out/candidates.json` (Task 1), group `G-admin`, restricted to `src/features/admin/**` and `src/features/inquiries/**`.
- Produces: the completed Group G table and coverage row. This is the last audit — after it, the register is whole and Task 8 can gate it.

- [ ] **Step 1: Dispatch the audit subagent**

Dispatch **one sonnet subagent**. The prompt executes the `## Audit protocol` above — reproduce that protocol's eight numbered points in the prompt in full, then add this task's specifics:

**Scope for this task:** `src/features/admin/**` (14 files, 72 candidates) and `src/features/inquiries/**` (6 files, 21 candidates).

**Group hazards, stated to the subagent verbatim:**

- **`src/features/inquiries/components/**`renders on both surfaces** —`/account/inquiries`for the client and`/admin/inquiries` for Cal. Open both consumers before flagging. A string that assumes an admin reader is wrong on the account page, and the reverse.
- `src/features/admin/**` is mostly server actions. Their error strings split into two populations: messages a real admin sees in a toast (in scope) and invariant throws that mean a bug (out of scope). `Your admin session expired — refresh and try again.` is the first kind; `No fields to update` needs the call site checked before deciding.
- `A valid email is required` in `create-client-actions.ts:30` is approved unchanged in the blind round: roughly twenty sibling zod messages share its shape.
- `src/features/admin/pricing-config-fields.ts` labels feed the admin pricing editor. Cal renames some of these labels directly in the editor per `docs/content/pricing-language-drafts.md` §2 — a label change here is `route:copy-sync`, not `rewrite`.

- [ ] **Step 2: Sanity-check the flag rate before writing anything**

If flagged exceeds 1 in 5 in-scope strings, do not write the rows — report the rate and the three most aggressive flags, and re-run the audit with the conservatism finding restated.

- [ ] **Step 3: Write the rows into the register**

Under `### Group G`, after the `**Admin pages**` block, add a `**Admin features + inquiries**` sub-heading followed by the flagged-entry table, or `No entries flagged. N strings inspected, M in scope.` Complete the Group G coverage row with the totals from both halves. Edit tool only.

- [ ] **Step 4: Verify the register is whole**

Check all seven group sections and confirm none still reads `_Audit pending._`:

```bash
grep -c "Audit pending" docs/content/voice/copy-register.md
```

Expected: `0`. Then confirm every coverage row has all four audit columns filled.

- [ ] **Step 5: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: audit admin feature and inquiry copy"
```

---

### Task 8: Triage gate

**Files:**

- Modify: `docs/content/voice/copy-register.md`

**Interfaces:**

- Consumes: the complete register (Tasks 1–7).
- Produces: a register whose every row carries a maintainer-confirmed verdict. Tasks 9–12 apply only `rewrite` rows and touch nothing else.

**This task has a human gate and cannot be completed by a subagent.** An executor that approves its own register has defeated the plan — the same failure mode plan 1 guarded against in calibration.

- [ ] **Step 1: Present the register to the maintainer**

Show, in one message:

- the coverage table — how many strings were inspected, how many were in scope, how many flagged, per group;
- every flagged row grouped by proposed verdict, `rewrite` first;
- the overall flag rate, against the calibration benchmark of 2 changes in 22 strings;
- any group whose rate ran high, and what the auditor said about it.

- [ ] **Step 2: Take the maintainer's reactions per row or wholesale**

For each row the maintainer rejects, change the verdict to `leave` and record the maintainer's reason in the Note. Do not delete a rejected row — a flag the maintainer declined is a fact about the standard's edges and belongs in the record, the same way `fixtures.md` keeps its "Approved as already correct" table.

If the maintainer's reasoning names a _general principle_ the standard is missing, say so and offer to fold it into `references/craft.md` or `references/ai-tells.md`. That is how calibration produced the courtesy carve-out. Do not fold anything in without asking — the standard passed both gates and is not this plan's to edit unilaterally.

- [ ] **Step 3: Freeze the register**

Add a line under the register's header block:

```markdown
> Triaged 2026-XX-XX. Every row below carries a confirmed verdict. Rows marked
> `rewrite` are the full scope of this pass's source changes.
```

- [ ] **Step 4: Commit**

```bash
git add docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "docs: triage the copy audit register"
```

---

### Task 9: Rewrite — client UI microcopy

**Files:**

- Modify: every file named by a `rewrite` row in register groups A, B, and C, plus `K1` (`src/app/(site)/(account)/account/forms/page.tsx`)
- Modify: any test asserting a changed string (same commit)

**Interfaces:**

- Consumes: `docs/content/voice/copy-register.md`, groups A, B, C, and row `K1`.
- Produces: applied source changes and the register rows marked `applied`. No other task touches these files.

The exact edits cannot be enumerated here — they are the register's output, and the register does not exist until Task 8. What is fixed is the file set, the procedure, and the gates.

- [ ] **Step 1: Read the register and list the work**

Open `docs/content/voice/copy-register.md`. Collect every row in groups A, B, C plus row `K1` whose verdict is `rewrite`. List them as `file:line — current → proposed`. If the list is empty apart from `K1`, that is a valid outcome: apply `K1`, commit, and report.

- [ ] **Step 2: Find every test that asserts a string you are about to change**

For each string on the list:

```bash
grep -rn "Keep these up to date and don't worry" src --include=*.test.ts --include=*.test.tsx
```

(substituting each current string). Record the hits. Every hit is a file this commit must also change — not a follow-up.

- [ ] **Step 3: Apply the edits**

Use the Edit tool for every change. Never PowerShell `Set-Content` or `Out-File` — it mojibakes em dashes in UTF-8 sources, and several proposed rewrites contain one.

Apply the register's proposed text exactly. If a proposed rewrite turns out to be wrong once you see it in context — a value it would break, a sibling it would desynchronise, a fact it would alter — do not improvise a third version. Change the row's verdict to `leave`, record why, and report it at the end of the task.

`K1` is fixed and approved: at `src/app/(site)/(account)/account/forms/page.tsx:76`, replace

```
Keep these up to date and don't worry, these forms are confidential and secure.
```

with

```
Keep these up to date. They're confidential and secure.
```

- [ ] **Step 4: Update the coupled tests**

Apply each test change found in Step 2, in this same working tree. Update the assertion to the new string — do not loosen it to a substring or a regex. The assertions exist because copy is load-bearing here.

- [ ] **Step 5: Verify**

```bash
npm run typecheck
npx vitest run <each test file touched in Step 4>
npm run lint
```

Expected: typecheck clean, the named suites pass, lint clean. If no test file was touched, run the two suites nearest the changed surface anyway — `npx vitest run src/features/accounts src/components/form` — and report which you ran.

Do not use a bare `npm test`: three integration suites (`src/features/admin/create-client.integration.test.ts`, `src/features/booking/admin-create-booking.integration.test.ts`, `src/features/booking/edit-booking.integration.test.ts`) need the local Supabase stack and will fail without it.

- [ ] **Step 6: Mark the register rows applied**

For each applied row, change the verdict cell from `rewrite` to `applied`. For any row downgraded in Step 3, change it to `leave` with the reason.

- [ ] **Step 7: Commit**

```bash
git add <each source file> <each test file> docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "content(account): apply the writing standard to client microcopy"
```

Adjust the scope in the subject to the surface that actually changed. Subject line only — no body, no trailers, no task numbers.

---

### Task 10: Rewrite — booking flow UI

**Files:**

- Modify: every file named by a `rewrite` row in register group D
- Modify: any test asserting a changed string (same commit)

**Interfaces:**

- Consumes: `docs/content/voice/copy-register.md`, group D.
- Produces: applied source changes in `src/app/(site)/(marketing)/book/**` and `src/features/booking/_components/**`, and the register rows marked `applied`.

- [ ] **Step 1: Read the register and list the work**

Open `docs/content/voice/copy-register.md`. Collect every group D row whose verdict is `rewrite`. List them as `file:line — current → proposed`. An empty list is a valid outcome: report it and skip to the end without committing.

- [ ] **Step 2: Re-check the dual-surface constraint on every string**

Every file in this group renders on both the client booking flow and the admin book-on-behalf flow. For each string you are about to change, open both consumers:

- `src/app/(site)/(marketing)/book/[serviceSlug]/_components/service-booking-client.tsx`
- `src/app/(site)/(admin)/admin/clients/[clientId]/book/_components/admin-create-booking-client.tsx`

A rewrite that switches a subject to second person ("your visit") is wrong wherever an admin is booking on someone's behalf. If a proposed rewrite fails this check, downgrade the row to `leave` with the reason rather than improvising.

- [ ] **Step 3: Find every test that asserts a string you are about to change**

For each string on the list:

```bash
grep -rn "<the exact current string>" src --include=*.test.ts --include=*.test.tsx
```

Record the hits. `src/features/booking/_components/quote-panel.test.tsx` and `src/app/(site)/(marketing)/book/_components/messages.test.ts` are the two most likely.

- [ ] **Step 4: Apply the edits**

Edit tool only — never PowerShell redirection. Apply the register's proposed text exactly. Preserve every interpolated value character-for-character; a scheduler label that loses a `${…}` is a bug, not a copy change.

- [ ] **Step 5: Update the coupled tests**

Apply each test change found in Step 3, in this same working tree, updating assertions to the new strings rather than loosening them.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npx vitest run src/features/booking src/app/\(site\)/\(marketing\)/book --exclude "**/*.integration.test.ts"
npm run lint
```

Expected: typecheck clean, suites pass, lint clean. The `--exclude` keeps the three Supabase-dependent integration suites out.

- [ ] **Step 7: Mark the register rows applied**

Change each applied row's verdict from `rewrite` to `applied`; change any row downgraded in Step 2 or 4 to `leave` with its reason.

- [ ] **Step 8: Commit**

```bash
git add <each source file> <each test file> docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "content(booking): apply the writing standard to booking-flow copy"
```

---

### Task 11: Rewrite — validation messages and server feedback

**Files:**

- Modify: every file named by a `rewrite` row in register groups E and F, plus `K2` (`src/features/booking/booking-service-shared.ts`)
- Modify: any test asserting a changed string (same commit)

**Interfaces:**

- Consumes: `docs/content/voice/copy-register.md`, groups E and F, and row `K2`.
- Produces: applied source changes and the register rows marked `applied`. This is the task where the test-coupling constraint bites hardest.

- [ ] **Step 1: Read the register and list the work**

Open `docs/content/voice/copy-register.md`. Collect every row in groups E and F plus row `K2` whose verdict is `rewrite`. List them as `file:line — current → proposed`, carrying across the `tests:` note Task 5 Step 3 recorded on each row.

- [ ] **Step 2: Verify the recorded test coupling is still accurate**

The register's `tests:` notes were written before Tasks 9 and 10 changed anything. Re-run the grep for each string:

```bash
grep -rn "<the exact current string>" src --include=*.test.ts --include=*.test.tsx
```

Expected: matches the recorded note. A new hit means another test picked the string up; add it to this commit.

- [ ] **Step 3: Apply `K2`**

At `src/features/booking/booking-service-shared.ts:706`, the current text is

```
Client location is too far (${milesLabel} mi). Hard cutoff is ${cutoff} mi.
```

Replace it with

```
Client is ${milesLabel} mi away — beyond the ${cutoff} mi cutoff.
```

Both interpolations survive unchanged. The subject stays "Client" deliberately: this string is consumed by the client's own booking flow _and_ the admin book-on-behalf flow, and "Your location" would be wrong for an admin. Check the sibling warning at line 701 — the rewrite exists to match its phrasing, so if that line has changed, report it rather than proceeding.

Use the Edit tool. The em dash in the replacement will mojibake through PowerShell redirection.

- [ ] **Step 4: Apply the remaining edits**

Edit tool only. Apply the register's proposed text exactly. Two things are non-negotiable here:

- **Every interpolated value survives character-for-character.** Refund amounts, mileages, and cutoffs are facts.
- **A zod message rewrite covers its whole set or none of it.** Roughly twenty messages share the `X is required` shape. If the register approved a change to one of them without approving the set, that is a triage error — stop and report rather than desynchronising the set.

- [ ] **Step 5: Update the coupled tests**

Apply each test change from Step 2 in this same working tree. Update assertions to the new strings; do not loosen an assertion to a substring or regex to avoid the edit.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npx vitest run src/features src/app src/lib src/components --exclude "**/*.integration.test.ts"
npm run lint
```

This group's strings are shared widely enough that a scoped run is not enough — run the whole unit suite minus the three Supabase-dependent integration files. Expected: all pass.

- [ ] **Step 7: Mark the register rows applied**

Change each applied row's verdict from `rewrite` to `applied`; any row downgraded in Step 4 becomes `leave` with its reason.

- [ ] **Step 8: Commit**

```bash
git add <each source file> <each test file> docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "content(booking): rephrase the distance refusal and feedback copy"
```

Adjust the subject to describe what actually changed. If the edits split cleanly between validation schemas and server feedback, two commits are better than one — but a copy change and the test asserting it are never split.

---

### Task 12: Rewrite — admin surfaces

**Files:**

- Modify: every file named by a `rewrite` row in register group G
- Modify: any test asserting a changed string (same commit)

**Interfaces:**

- Consumes: `docs/content/voice/copy-register.md`, group G (both halves).
- Produces: applied source changes in `src/app/(site)/(admin)/**`, `src/features/admin/**`, `src/features/inquiries/**`, and the register rows marked `applied`. After this task no `rewrite` row remains anywhere in the register.

- [ ] **Step 1: Read the register and list the work**

Open `docs/content/voice/copy-register.md`. Collect every group G row — both the `**Admin pages**` and `**Admin features + inquiries**` blocks — whose verdict is `rewrite`. List them as `file:line — current → proposed`. An empty list is a valid outcome: report it and skip to the end without committing.

- [ ] **Step 2: Re-check the dual-surface constraint on inquiries strings**

Any row in `src/features/inquiries/components/**` renders on both `/admin/inquiries` and `/account/inquiries`. Open both consumers:

- `src/app/(site)/(admin)/admin/inquiries/_components/inquiries-client.tsx`
- `src/app/(site)/(account)/account/inquiries/_components/account-inquiries-client.tsx`

A rewrite that assumes an admin reader is wrong on the account page. Downgrade the row to `leave` with the reason rather than improvising a compromise.

- [ ] **Step 3: Find every test that asserts a string you are about to change**

For each string on the list:

```bash
grep -rn "<the exact current string>" src --include=*.test.ts --include=*.test.tsx
```

`src/features/admin/admin.test.ts`, `src/features/admin/onbehalf-actions.test.ts`, `src/features/inquiries/inquiry-client-actions.test.ts`, and `src/app/(site)/(admin)/admin/clients/new/_components/new-client-form.test.tsx` are the likely hits.

- [ ] **Step 4: Apply the edits**

Edit tool only. Apply the register's proposed text exactly, and keep label sets parallel — an admin table's headers, filter chips, and status badges are a system, so a change to one member either applies to the set or does not apply.

- [ ] **Step 5: Update the coupled tests**

Apply each test change from Step 3 in this same working tree, updating assertions to the new strings.

- [ ] **Step 6: Verify**

```bash
npm run typecheck
npx vitest run src/features/admin src/features/inquiries --exclude "**/*.integration.test.ts"
npm run lint
```

Expected: typecheck clean, suites pass, lint clean.

- [ ] **Step 7: Mark the register rows applied**

Change each applied row's verdict from `rewrite` to `applied`; any row downgraded in Step 2 or 4 becomes `leave` with its reason.

- [ ] **Step 8: Commit**

```bash
git add <each source file> <each test file> docs/content/voice/copy-register.md
node scripts/check-doc-links.mjs
git commit -m "content(admin): apply the writing standard to admin copy"
```

---

### Task 13: Close out — routed findings, verification, and program status

**Files:**

- Modify: `docs/content/pricing-language-drafts.md` (only if a `route:copy-sync` row exists)
- Modify: `docs/content/voice/copy-register.md`
- Modify: `docs/superpowers/specs/2026-07-22-writing-voice-design.md`

**Interfaces:**

- Consumes: the register in its final state (Tasks 8–12).
- Produces: every routed finding recorded with its owner, the spec's status reconciled, and the pass's acceptance gate satisfied.

- [ ] **Step 1: Verify no row is unresolved**

The spec's acceptance gate is that every register entry is either rewritten or explicitly left alone with a reason. Check it:

```bash
grep -c "| \`rewrite\` |" docs/content/voice/copy-register.md
```

Expected: `0` — every row now reads `applied`, `leave`, or one of the `route:*` verdicts. A non-zero count means a rewrite task skipped a row; go back and finish it rather than editing the register.

Then read every `leave` row and confirm each carries a reason. A `leave` with an empty Note fails the gate.

- [ ] **Step 2: Record the `route:copy-sync` findings for Cal**

Split these by destination.

**Pricing terms** — for each row naming a `term-descriptions.ts` string or an admin pricing label, add a line to `docs/content/pricing-language-drafts.md` under the section that owns it (§1 for shipped tooltip descriptions, §2 for admin-config label renames), naming the string, what the audit found, and that it needs Cal's decision. Do not edit `src/features/pricing/term-descriptions.ts` — those strings are pending Cal's approval and route through copy-sync.

**Everything else** — marketing/system-boundary strings that need Cal's approval but are not pricing (SEO meta descriptions, page-level taglines) have no drafts doc to land in. Report them to the maintainer in Step 8 as a named list with their locations and what the audit found, for Cal to decide. Do not invent a new doc for them.

If there are no `route:copy-sync` rows in either destination, skip this step and say so.

- [ ] **Step 3: Report the `route:component` and `route:engineering` findings**

These are not this plan's to fix. Present them to the maintainer as a list — `K3`, `K4`, `K5`, plus anything the audits added — with, for each: the string, the location, why copy cannot fix it, and which code owns the fix. `K3`/`K4` are a `FieldGroup` component change; `K5` is a question about whether the ZIP regex should accept ZIP+4 at all.

Ask whether to file them as a follow-up plan or leave them in the register. Do not open that work here.

- [ ] **Step 4: Run the full gate**

```bash
npm run typecheck
npx vitest run src --exclude "**/*.integration.test.ts"
npm run lint
npm run format:check
```

Expected: all four clean. Report the actual output — a claim of "tests pass" without the run is not evidence.

- [ ] **Step 5: Reconcile the spec**

In `docs/superpowers/specs/2026-07-22-writing-voice-design.md`, update the "Cleanup pass" section to record what the pass actually found: how many strings were inspected, how many were flagged, how many were changed, and how that compares to calibration's 2-in-22. If the audit contradicted a design assumption, say so — the spec was already reconciled once with calibration's findings and that is the pattern.

Two corrections while you are in the file:

- Line 199 reads "so **his** traits have no surface to apply to". Cal uses they/them. Change `his` to `their`.
- Update the `_Last reviewed:_` footer to today's date, keeping the existing history line.

- [ ] **Step 6: Update the register header and finalize**

Add to the register's header block: the date the pass completed, total strings inspected, total flagged, total changed. Update its `_Last reviewed:_` footer.

- [ ] **Step 7: Commit**

```bash
git add docs/content/voice/copy-register.md docs/superpowers/specs/2026-07-22-writing-voice-design.md docs/content/pricing-language-drafts.md
node scripts/check-doc-links.mjs
git commit -m "docs: close out the copy cleanup pass"
```

Stage `pricing-language-drafts.md` only if Step 2 changed it.

- [ ] **Step 8: Report**

State: strings inspected, in scope, flagged, changed; which surfaces changed and which were left whole; every routed finding and its owner; and the gate output from Step 4. Note explicitly whether the flag rate matched calibration's conservatism — if the pass changed far more or far less than 1 string in 20, that is a finding about the standard and belongs in the report.

---

## Self-review notes

- **Spec coverage.** In-scope surfaces (Tasks 2–7 audit all seven groups; Tasks 9–12 rewrite them); audit-first method (Tasks 2–7 precede any edit, gated by Task 8); one commit per surface (Tasks 9–12); `marketing.ts` out of bounds (Global Constraints, extractor `EXCLUDE`, Task 2 hazards); tests ship in the same commit (Tasks 9–12, Step 4/5 of each); zod schemas are copy files (Task 5, Task 11); email templates and dev docs excluded (Global Constraints, extractor `EXCLUDE`); acceptance gate that every entry is rewritten or explicitly left with a reason (Task 13 Step 1); typecheck and scoped suites green (every rewrite task, plus Task 13 Step 4). Covered.
- **Deliberate deviation: the plan cannot enumerate the diffs.** Every other requirement of the writing-plans skill is met, but "complete code in every step" is impossible for Tasks 9–12: their edits are the register's output, and the register does not exist until Task 8. What is fixed instead is the file set, the procedure, the constraint list, the verification commands, and the two edits already approved in `fixtures.md` (`K1`, `K2`), which _are_ written out verbatim. This is the same shape as plan 1's calibration loop, which also could not pre-write its outputs.
- **Deliberate deviation: the audit protocol is stated once.** Tasks 2–7 share a 9-point protocol given in `## Audit protocol` rather than repeated six times. Six copies would drift, which is the exact failure the skill's type-consistency check exists to catch. Everything that varies between the tasks — file lists, counts, group hazards, commit subjects — is written out in full inside each task.
- **Deliberate deviation: the register lists flagged strings, not all of them.** The spec asks for "a register of every user-visible non-Cal string with its flagged tells". Full enumeration is ~1,070 rows, nine tenths of them reading "no tell found". The coverage table carries the same no-skipping guarantee at a tenth the size. Recorded in the register's own `## Method` section so a later reader knows it was a decision.
- **No TDD, by nature of the work.** These are copy edits with no failing test to write first. The substitute is the existing assertions: every rewrite task greps its strings across the 29 test files that assert copy and ships those updates in the same commit. That is a regression gate, just an inherited one.
- **The conservatism check is load-bearing.** Every audit task has a Step 2 that halts on a flag rate above 1 in 5. Calibration's rate was 2 in 22. Without this, the failure mode is an eager subagent producing 200 "improvements" and a maintainer with no way to review them.
- **Human gates are real gates.** Task 8 cannot be completed by a subagent. Neither can Task 13 Step 3, which asks the maintainer where routed findings should go.
- **Task 6/7 split is about judgement quality, not size.** 338 candidates in one pass degrades classification well before it exhausts context.
- **`.superpowers/sdd/progress.md` gets overwritten by this plan.** Read plan 1's record first — it holds the calibration history and two carried-forward minors that are not recorded anywhere else.

---

_Last reviewed: 2026-07-23_
