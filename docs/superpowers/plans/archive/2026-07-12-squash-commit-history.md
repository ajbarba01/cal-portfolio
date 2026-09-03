# Squash Commit History Implementation Plan

> **For agentic workers:** This is an interactive, judgment-heavy git-ops runbook executed in a single session with one human review gate (Phase 4). It is NOT a hand-to-a-fresh-subagent TDD plan — the grouping step requires reading commit subjects and exercising taste. Steps use checkbox (`- [ ]`) syntax. The verification gates in Phases 3 and 5 are non-negotiable and stand in for tests: they prove no file content is lost.

**Goal:** Compress `main`'s 840-commit linear history down to ~300 commits by squashing adjacent related commits, with clean subject-only messages, while guaranteeing zero change to file content, then force-push.

**Architecture:** Squash-only rebase (`--root`) driven by a fully-scripted, non-interactive sequence editor. Each output commit = one `pick` leader + its `fixup` followers + an `exec git commit --amend -F <msgfile>` that sets the final subject from a per-group message file (avoids shell-quoting hazards and makes messages deterministic + reviewable). Because commits are never reordered and content is never edited, the rewritten tree is byte-identical to the original — enforced by an empty-`git diff` gate before origin is touched. Rewrite happens on a scratch branch; `main` is only moved after the gate passes.

**Tech Stack:** git 2.53 (Windows), git-bash `sh`/`cp` (confirmed present), a Python 3 generator script for grouping, PowerShell/Bash tool for execution.

## Global Constraints

- **No content loss.** Rewritten tree MUST be byte-identical to original. Gate: `git diff <backup-tag> <scratch-branch>` prints nothing. If it prints anything → ABORT.
- **Commit messages: subject line only.** Conventional Commits. No body, no `Co-Authored-By`/trailer, no "Generated with" footer.
- **No project-internal identifiers in subjects** — strip `sp3a`, `SP3`, `phase 2`, `p1`–`p4`, `A14`, "plan 4a"-style codenames, ticket/spec IDs. Describe the change itself.
- **Target range: 250–400 commits** (aiming ~300). Gate checks the count lands in range.
- **Adjacent-only squashing.** Never reorder commits. Only fold a commit into its immediate predecessor group.
- **Solo repo, force-push allowed.** `--force-with-lease` only (never bare `--force`).
- **Recoverability.** A backup tag pinning the exact pre-rewrite SHA exists before any rewrite, and is not deleted by this plan.

---

## File / artifact structure

All generated artifacts live in the scratchpad + `.git/`, never committed to the repo:

- `.../scratchpad/subjects.tsv` — `hash<TAB>subject`, oldest→newest (input to generator).
- `.../scratchpad/group.py` — grouping heuristic generator.
- `.../scratchpad/rebase-todo.txt` — the sequence-editor todo (pick/fixup/exec lines).
- `.git/squash-msgs/NNNN.txt` — one final subject per output group (referenced by `exec`).
- `.../scratchpad/mapping.md` — human-readable review artifact: each new subject + the original subjects folded under it. **This is what the user reviews at the Phase 4 gate.**
- `.../scratchpad/seq-editor.sh` — one-liner that copies our todo over git's todo file.

---

## Phase 0: Pre-flight & backups

- [ ] **Step 0.1: Confirm clean starting point & capture original SHA**

Run:

```bash
cd "c:/Users/Zander/Documents/Side Projects/cal-portfolio"
git status --short
git rev-parse HEAD
git rev-list --count HEAD          # expect 840
git rev-list --count --merges HEAD # expect 0 (abort if not — plan assumes linear)
```

Expected: HEAD SHA recorded; 840 commits; 0 merges. If merges > 0, STOP — this plan does not handle merge commits.

- [ ] **Step 0.2: Stash the 2 uncommitted working files**

Run:

```bash
git stash push -u -m "pre-squash-worktree"
git status --short   # expect empty
```

Expected: working tree clean. (Stash is popped in Phase 6.)

- [ ] **Step 0.3: Create backup tag + backup branch pinning current main**

Run:

```bash
git tag backup/pre-squash-20260712 main
git branch backup/pre-squash-main-20260712 main
git tag backup/pre-squash-scheduler-20260712 feat/scheduler-overhaul
git tag backup/pre-squash-secretpurge-20260712 pre-secret-purge-backup
git tag | grep pre-squash   # confirm 4 tags exist
```

Expected: 4 backup tags + 1 backup branch. These are the rollback anchors and are NOT deleted by this plan.

- [ ] **Step 0.4: Record the exact pre-rewrite tree hash for the content gate**

Run:

```bash
git rev-parse HEAD^{tree}
```

Expected: a tree SHA. Note it — Phase 3 re-derives it and they MUST match.

**Rollback from anywhere:** `git rebase --abort` (if mid-rebase) then `git checkout main && git reset --hard backup/pre-squash-main-20260712 && git stash pop`.

---

## Phase 1: Extract subjects & generate candidate grouping

- [ ] **Step 1.1: Dump all subjects oldest→newest**

Run:

```bash
git log --reverse --format='%H%x09%s' > "<SCRATCH>/subjects.tsv"
wc -l "<SCRATCH>/subjects.tsv"   # expect 840
```

- [ ] **Step 1.2: Write the grouping generator**

Create `<SCRATCH>/group.py`. It reads `subjects.tsv` and decides, per commit, `new group` vs `fold into previous`, using adjacent-only heuristics. It emits `rebase-todo.txt`, `.git/squash-msgs/NNNN.txt`, and `mapping.md`.

Fold-into-previous rules (a commit continues the current group when ANY holds, evaluated on its subject + the group leader's subject):

1. Subject matches `^(chore|style|refactor)?\b.*\b(wip|fixup|fix up|lint|fmt|format|typo|oops|amend|address(ing)? review|self-?review|pr feedback)\b` → always fold.
2. `fix(<scope>): …` immediately following a commit of the **same `<scope>`** → fold (it's a fix to what just landed).
3. `test(<scope>): …` or `docs(<scope>): …` immediately following a `feat(<scope>)`/`fix(<scope>)` of the **same scope** → fold (tests/docs for the thing just built).
4. A `feat`/`refactor` commit whose scope equals the current group leader's scope AND the leader is itself a `docs: plan …`/`docs: spec …`/`docs(<scope>): plan …` commit → fold the plan/spec commit's implementation back onto it, and re-lead the group with the implementation subject (plan→impl collapse).
5. Consecutive commits with identical `<scope>` and identical type where the later subject starts with a continuation marker (`continue`, `cont`, `part`, `more`, `finish`, `wrap`, `complete`) → fold.

Otherwise → start a new group.

Leader subject selection & cleanup for each group's message file:

- Default message = the group leader's subject (or, for rule-4 collapses, the implementation subject — a `feat:` reads better than `docs: plan`).
- Strip internal identifiers with these substitutions (case-insensitive), then collapse doubled spaces and trailing separators:
  - `\bsp\s*\d+[a-z]?\b` → removed
  - `\bphase\s*\d+[a-z]?\b` → removed
  - `\bp[1-4]\b` (word-boundaried) → removed
  - `\bA\d{1,3}\b` (e.g. `A14`) → removed
  - standalone `plan`/`spec` codename tails like `in <name>-client plan` → keep the descriptive noun, drop trailing " plan"/" spec" when it's a codename tail, keep when "plan" is the actual deliverable (e.g. `docs: plan technical SEO foundation` stays — the commit _is_ the plan).
  - If stripping leaves a vague subject (`docs: record review reception`), flag the group in `mapping.md` with `⚠ REVIEW` for manual naming in Step 1.4.
- Guarantee subject ≤ ~72 chars, Conventional-Commits prefix preserved.

The `exec` message-file approach means every final subject is explicit in `.git/squash-msgs/NNNN.txt` — no quoting in the todo.

- [ ] **Step 1.3: Run the generator**

Run:

```bash
python "<SCRATCH>/group.py"
grep -c '^pick ' "<SCRATCH>/rebase-todo.txt"   # = number of output groups; want 250–400
ls .git/squash-msgs | wc -l                    # = same number of message files
```

Expected: pick-count in 250–400. If far outside, adjust rule aggressiveness in `group.py` (loosen to fold more if >400; tighten if <250) and re-run. Iterate until in range.

- [ ] **Step 1.4: Hand-review the mapping (subjects only; read a diff only if a subject is ambiguous)**

Open `<SCRATCH>/mapping.md`. Walk it and fix:

- Every `⚠ REVIEW` group → give it a real subject (edit the corresponding `.git/squash-msgs/NNNN.txt`).
- Any group whose folded members clearly belong to _different_ features (heuristic over-folded) → split by editing `rebase-todo.txt` (change a `fixup` back to `pick` and add a new message file, renumbering as needed) — or simpler, adjust `group.py` and regenerate.
- Any surviving internal identifier in any message file → strip it.
- Only inspect an actual diff (`git show <hash>`) when a subject genuinely doesn't say what the commit did.

Do NOT proceed to Phase 2 until `mapping.md` reads cleanly and message files are final.

---

## Phase 2: Dry-run structural validation (no history touched yet)

- [ ] **Step 2.1: Sanity-check the todo references every commit exactly once**

Run:

```bash
# Every original hash must appear exactly once as pick or fixup:
awk '$1=="pick"||$1=="fixup"{print $2}' "<SCRATCH>/rebase-todo.txt" | sort > /tmp/todo-hashes
git log --format='%H' | sort > /tmp/all-hashes
diff /tmp/todo-hashes /tmp/all-hashes && echo "OK: todo covers all 840 commits exactly once"
```

Expected: `OK: …`. Any diff output = a dropped or duplicated commit = ABORT and fix `group.py`. **This is the guard against a commit silently vanishing.**

- [ ] **Step 2.2: Confirm each group has exactly one exec after its picks**

Run:

```bash
grep -c '^exec ' "<SCRATCH>/rebase-todo.txt"   # must equal the pick count from Step 1.3
```

Expected: equal counts (one message-amend per group).

- [ ] **Step 2.3: Write the sequence-editor shim**

Create `<SCRATCH>/seq-editor.sh`:

```sh
#!/usr/bin/sh
cp "<SCRATCH>/rebase-todo.txt" "$1"
```

---

## Phase 3: Execute rewrite on a scratch branch + CONTENT GATE

- [ ] **Step 3.1: Create scratch branch at current main**

Run:

```bash
git checkout -b squash/work main
```

- [ ] **Step 3.2: Run the scripted non-interactive rebase**

Run:

```bash
GIT_SEQUENCE_EDITOR="sh '<SCRATCH>/seq-editor.sh'" git rebase -i --root
```

Expected: rebase runs to completion ("Successfully rebased"). If it stops with a conflict — squash-only never should — do NOT resolve blindly: `git rebase --abort`, investigate (likely a reorder bug in the todo), fix, retry.

- [ ] **Step 3.3: CONTENT GATE — prove the tree is byte-identical**

Run:

```bash
git diff --stat backup/pre-squash-20260712 squash/work
git rev-parse squash/work^{tree}   # MUST equal the tree SHA from Step 0.4
```

Expected: `git diff` prints **NOTHING**, and the tree SHA matches Step 0.4 exactly. If either fails → the rewrite altered content → `git checkout main && git branch -D squash/work` and STOP. Do not proceed to force-push under any circumstances.

- [ ] **Step 3.4: COUNT GATE — confirm we hit the target range**

Run:

```bash
git rev-list --count squash/work   # expect 250–400
```

Expected: in range. If not, `git branch -D squash/work`, adjust grouping (Phase 1), redo.

- [ ] **Step 3.5: Spot-check messages**

Run:

```bash
git log --format='%s' squash/work | grep -iE '\b(sp[0-9]|phase [0-9]|\bp[1-4]\b|A[0-9]{1,3}\b)\b' || echo "OK: no internal identifiers survived"
git log --format='%s' squash/work | grep -nE '.{73,}' || echo "OK: all subjects <=72 chars"
```

Expected: both `OK:` lines. Any hit → fix the offending `.git/squash-msgs/NNNN.txt`, `git branch -D squash/work`, redo from 3.1 (cheap — the todo/messages are reused).

---

## Phase 4: HUMAN REVIEW GATE

- [ ] **Step 4.1: Present the mapping to the user**

Render `<SCRATCH>/mapping.md` (or `git log --oneline squash/work`) for the user to skim — new subjects, and what folded under each. The user reviews **names, not diffs**.

- [ ] **Step 4.2: Get explicit approval**

Wait for the user's OK. If they want message changes, edit the relevant `.git/squash-msgs/NNNN.txt`, `git branch -D squash/work`, redo Phase 3 (fast), re-present. Only proceed past this gate on explicit approval. **Nothing has touched `main` or `origin` yet.**

---

## Phase 5: Move main & final pre-push gate

- [ ] **Step 5.1: Point main at the rewritten history**

Run:

```bash
git checkout main
git reset --hard squash/work
```

- [ ] **Step 5.2: FINAL CONTENT GATE (belt-and-suspenders, local)**

Run:

```bash
git diff --stat backup/pre-squash-main-20260712 main   # MUST be empty
git rev-list --count main                               # 250–400
```

Expected: empty diff, count in range. If not empty → `git reset --hard backup/pre-squash-main-20260712` and STOP.

---

## Phase 6: Restore working state & push

- [ ] **Step 6.1: Restore the stashed working files**

Run:

```bash
git stash pop
git status --short   # expect the original 2 modified files back
```

Expected: `docs/DEV_NOTES.md` and the bookings-calendar-client component show as modified again. If `stash pop` conflicts (tree identical, so it shouldn't), resolve to keep the stashed working versions.

- [ ] **Step 6.2: Force-push with lease**

> Outward-facing, irreversible-ish action. Confirm with the user immediately before running this specific command.

Run:

```bash
git push --force-with-lease=refs/heads/main:origin/main origin main
```

Expected: push succeeds. `--force-with-lease` aborts if `origin/main` moved out-of-band since fetch (guards against clobbering an unexpected push). If it rejects → `git fetch origin`, re-examine, do NOT `--force` blindly.

- [ ] **Step 6.3: Verify remote**

Run:

```bash
git fetch origin
git rev-list --count origin/main                       # matches local main
git diff --stat origin/main main                        # empty
git log --oneline -10 origin/main
```

Expected: counts match, empty diff, clean log on the remote.

---

## Phase 7: Cleanup

- [ ] **Step 7.1: Delete the scratch branch (keep backups)**

Run:

```bash
git branch -D squash/work
git tag | grep pre-squash        # backups still present
```

Expected: scratch gone; 4 backup tags + backup branch remain.

- [ ] **Step 7.2: Note the stale dead branches**

`feat/scheduler-overhaul` and `pre-secret-purge-backup` now point at SHAs absent from the new main. They carried no unique work (verified: 0 commits ahead). Leave them (harmless) or delete after user confirms — they are also captured by backup tags. Do NOT force-push them.

- [ ] **Step 7.3: Tell the user how to reclaim space later**

Backup tags/branch keep the old 840-commit objects alive. When the user is confident (days/weeks later), they can delete the backups and `git gc` to prune. Document this; don't do it automatically.

---

## Self-review notes

- **Spec coverage:** no-content-loss (Steps 3.3, 5.2, 6.3), subject-only + no internal IDs (Steps 1.2, 3.5), 250–400 target (Steps 1.3, 3.4, 5.2), adjacent-only (rule design, Step 2.1 coverage check), recoverability (Phase 0 tags, rollback line), force-with-lease only (Step 6.2). Covered.
- **No commit is dropped:** Step 2.1 diffs the todo's hash set against all 840 — the structural guard. Step 3.3 diffs the _content_ — the semantic guard. Both must pass.
- **Reorder risk:** eliminated by construction (todo preserves original order; folds are adjacent-only). If any `fixup` ever precedes its intended leader, the rebase would conflict or 3.3 would fail — both caught before push.
- **Windows specifics:** `sh`/`cp` confirmed at `/usr/bin`; `GIT_SEQUENCE_EDITOR` uses `sh <shim>`; `exec` lines run under git's `sh`. Message files avoid all quoting issues.
