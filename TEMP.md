Handoff: cal-portfolio — PRE-PHASE-4 PASS (senior-designer: recon → spec → plan)

ROLE & PROJECT
You're continuing work on calbarba.com — a Next.js (App Router) + TypeScript
portfolio + self-serve booking site for a dog-walking / house-sitting business.
Stack: Tailwind v4 + shadcn-style components on @base-ui/react, react-day-picker
v9, Supabase, Stripe, Resend, Vercel. Working dir is the repo root; single `main`
branch; dev server runs on :3000 (the maintainer keeps it up and verifies visually
by refreshing). Default to terse/caveman tone; normal prose for security,
destructive-action confirmations, and ordered multi-step instructions.

YOUR ROLE THIS PASS — `senior-designer` (docs/ROLES.md)
This is a PRE-PHASE-4 PASS: research + brainstorm that ends in a committed spec and a
dependency-ordered plan — NOT implementation. Roles here are model-independent
behavior contracts (ROLES.md); whichever model runs this follows the senior-designer
contract. Inference converges on it three ways, so announce it in one line and
proceed unless vetoed: pointer verb (design/spec a phase) → senior-designer; repo
state (no Phase 4 spec yet) → senior-designer; routing default (Claude → senior-
designer, per docs/ROUTING.md). The exact deliverable is appended at the very end of
this prompt — read it first, then do the recon it calls for.

- Does: research → write/refine specs/<feature>.md (what + why) → turn it into a
  dependency-ordered plan in docs/superpowers/plans/ that satisfies the WORKFLOW.md
  handoff contract.
- Capability rule (ROLES.md): if skill-capable, invoke process skills before
  implementation skills — brainstorming → writing-plans, plus frontend-design
  during BOTH spec and plan work since Phase 4 is UI. If no matching skill, follow
  the same contract with native planning and produce the same spec + plan artifacts.
- Repo policy wins over skill defaults: work on `main`, no worktree/feature branch,
  no PR ceremony, subject-line-only commits.
- DO NOT implement Phase 4 in this pass. If the appended ask implies code, stop at
  the spec/plan and confirm scope. (Exception: if the maintainer says "use
  subagents", the designer executes in-session via subagent-driven-development
  instead of handing off — directed implementer/checker subagents default to the
  cheapest capable model; escalate model strength only for a concrete reason.)

READ FIRST (just-in-time, don't dump all):

- CLAUDE.md (router) → AGENTS.md (shared source of truth) → docs/ROLES.md (role
  contracts + inference) and docs/ROUTING.md (model preferences + override knob;
  default implementer = Codex) → then the one doc that owns the task: docs/DESIGN.md
  (project specifics — data model, admin routes, pricing), docs/FRONTEND.md (design
  system, tokens, kit, Scheduler family, interaction language), docs/ENGINEERING.md,
  docs/CODE_STYLE.md, docs/WORKFLOW.md (dev loop, stage map, handoff contract,
  Lightweight lane, escalation protocol).
- The 5-phase design-overhaul umbrella plan lives at
  ~/.claude/plans/ok-sure-lets-try-splendid-plum.md (NOT in repo). Per-phase specs +
  plans are in repo under docs/superpowers/specs|plans/. Confirm Phase 4 scope from
  the umbrella plan before proposing anything.

NON-NEGOTIABLE CONSTRAINTS (override defaults):

- DO NOT push. `main` auto-deploys to Vercel PRODUCTION; the maintainer batches the
  push himself. Commit freely (subject-line only, Conventional Commits, NO body, NO
  Co-Authored-By/footer). Stage files BY NAME (never `git add -A`). Never --no-verify.
- TypeScript strict, no `any`. Core logic pure + tested (TDD for pure models).
- Token law: components reference semantic CSS-var roles only, no hex. Brand =
  "Trail" (clay --brand/--brand-strong, warm --sand-\*, green/blue status). No amber.
- Repo ESLint bans react-hooks/set-state-in-effect AND react-hooks/refs (no setState
  in an effect body; no read/write of ref.current during render). Use the latest-ref
  pattern + key={…} remounts.
- Accessibility floor; mobile must be as intentional as desktop (Alex's standard).
- Same-commit doc rule: a change that adds/moves/deletes files updates the owning doc
  in the same commit. No code-as-doc (no path lists / signatures in docs).

VERIFICATION BASELINE (the plan's named gates; last known green at handoff):
`npx vitest run` (~587 tests / 38 files), `npx tsc --noEmit`,
`npx eslint "src/**/*.{ts,tsx}"`, `npx next build`. lint-staged (eslint --fix +
prettier + typecheck) runs on pre-commit and reformats .md. The plan must cite these
gates per task; confirm the baseline is green before relying on it.

CURRENT STATE (local `main`, mostly UNPUSHED):

- Phase 0 (Trail palette + Fraunces/Public Sans tokens), Phase 1 (PageContainer/
  PageHeader shells + feedback/ui kit on @base-ui/react), Shell Unification (global
  SiteHeader via PageShell, AppShell sidebar, --canvas/--radius 0.375rem/interaction
  language), Phase 2 (marketing bodies + gallery masonry/lightbox), Phase 3 (account
  - booking, scheduler Layer-3 restyle only) — ALL DONE.
- Latest: onboarding/login/signup header mop-up (commit cd73d3c) — headers aligned to
  Card kit (PageHeader + CardHeader/CardTitle), signup success uses a clay Lucide Mail
  icon. Working tree may carry the maintainer's own uncommitted edits (toast.tsx,
  docs/DEV_NOTES.md) and possibly a --bg-texture/--tex-\* library — leave the
  maintainer's uncommitted work alone; stage only your own files by name.

PHASE 4 SCOPE (the thing this pass de-risks) — admin INPUT HUMANIZATION:
Admin surfaces live under src/app/(admin)/admin/{,availability,services,settings,
bookings,reviews}/ (confirm via grep, don't trust this list). The phase replaces
machine-shaped inputs with human ones:

- cents (integer) → "$" currency inputs
- minutes-since-midnight → a real time picker
- lat/lng → address / ZIP with geocoding
- services `pricing_config` (jsonb) → typed, structured fields
- re-add the /admin/clients nav entry IF that optional page gets built
  Time/date pickers have been DEFERRED since Phase 1 specifically because Phase 4 is
  their first real consumer — picker selection/design is part of this phase. Recon
  should inventory every raw admin input, its current data shape (DB column type +
  units), its server action / validation path, and which kit/picker each maps to.

OUTSTANDING CROSS-PHASE ITEMS (note in the spec's risk section; don't fix here):

1. The live 390px + keyboard-a11y walk specced as a completion gate was NEVER
   executed across Shell/Phase 1/2 — the maintainer does it in the running dev app
   (not headless-verifiable).
2. Phase-3 blind-edited interactions still want a visual confirm: photo-crop pan/zoom
   drag math, hourly duration snap-back/unselect, two-click cross-month range preview.
3. Stripe prepay is a STUB (PrepayButton → createPrepayIntent → "card entry coming
   soon"); Stripe Elements / PaymentIntent confirmation unbuilt.
4. pending_approval badge uses a clay tint (no amber in Trail) — maintainer may revisit.

HOW THIS PASS ENDS (senior-designer end-state, ROLES.md):
Produce a committed spec + dependency-ordered plan. For UI values, the approved
mockups live under .superpowers/brainstorm/\*_/content/_.html — read exact CSS from
the relevant mockup rather than guessing. You cannot see rendered output; lean on the
maintainer's browser refresh as the visual-verify loop. Then EMIT A HANDOFF BLOCK
pointing the implementer at the plan — default implementer = Codex (ROUTING.md) unless
the maintainer reassigned it. Resolve any criticals you raised in the plan's

## Handoff log before signaling the implementer. Honor the override knob: "use

subagents" → execute in-session instead of handing off; "you are the implementer" /
"Codex plans this one" → follow the explicit assignment.

FIRST STEP: read the appended ask below, announce the senior-designer role (one line,
veto guardrail), confirm Phase 4 scope from the umbrella plan, then do the recon it
calls for. Brainstorm before proposing any build.

WHAT I'M LOOKING FOR FROM THIS PASS:

- this pass is going to be about admin capabilities.
- the first capability is being able to view all clients (with simple search filtering), and being able to view a specific client, including their account information, pets, forms, bookings, and anything cal might need to see. I haven't decided how much executive power cal needs here to change these things. like what are the most important things that cal should be able to change in a client's page?
- the second capability is calendar view where cal can easily navigate when they are booked through a calendar interface. this will most likely just extend the availability admin page but it definitely needs some work (which might be coming in phase 4)
- and then any other capabilities will be based on your recommendations and what i think of them. what will cal need the ability to do?
