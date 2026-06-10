# Clash Plus

> **Default tone for agents reading this file: caveman-full. Invoke `/caveman full` skill at session start. Talk like caveman: be brief, less tokens, drop articles, fragments OK, short synonyms, technical terms exact. Confirm to the user that you are using caveman on first read of CLAUDE.md**

3D RTS prototype — Godot 4.6, GDScript (static typed), Forward+ renderer. Top-down camera, player plays as Avatar (direct-controlled support hero) commanding AI captains via ping system.

## Doc nav

- [docs/DESIGN.md](docs/DESIGN.md) — vision, prototype scope, architecture principles, AI architecture, mechanics, MP-readiness, verification path. **Authority for arch + mechanics. Read first.**
- [docs/AI_DESIGN.md](docs/AI_DESIGN.md) — Unit AI system design contract (L0-L3 verb planner, slot-pool, commander brain, percept layer, morale/panic/dissent). Immutable unless revised.
- [docs/AI_IMPL.md](docs/AI_IMPL.md) — phased build plan for the AI refactor. Read [AI_DESIGN.md](docs/AI_DESIGN.md) first.
- [docs/UNIT_VFX.md](docs/UNIT_VFX.md) — visuals pipeline. **Read before touching `features/perception/`, `core/rendering/effects/`, or `EntityEffectsComponent`.**
- [docs/FUTURE.md](docs/FUTURE.md) — wishlist, deferred work, pending tuning, open risks.
- [DEV_NOTES.md](DEV_NOTES.md) — short-term bug list. Active churn only.
- [docs/archive/](docs/archive/) — shipped phase notes + superseded refactor docs. Don't trust for current state.

## Tone

Caveman-full. Drop: articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/happy to), hedging (perhaps/might/maybe). Fragments OK. Short synonyms (big not extensive, fix not "implement a solution for"). Technical terms exact. Code blocks unchanged. Errors quoted exact. Pattern: `[thing] [action] [reason]. [next step].`

Drop to normal prose for: security warnings, destructive-action confirmations, multi-step instructions where fragment order risks misread. Otherwise use caveman prose on every message without exceptions.

If `/caveman` skill listed in session skills, invoke it at session start. Any amendments to this file written in Caveman-full.

## Stack

Godot 4.6 · GDScript static-typed · NavigationRegion3D + NavigationAgent3D pathfinding · Forward+ renderer · Git on Windows (pwsh). Addon: **Debug Draw 3D** (DmitriySalnikov) for AI visualizations.

## Project layout

Feature-first. Three top-level code dirs as peers: `core/` = game-agnostic infra (reusable across projects, zero Clash Plus concepts), `features/` = game-specific gameplay, `autoload/` = singletons registered in `project.godot`. `autoload/` is game-aware; the `core/` purity rule does not apply to it.

```
res://
├── CLAUDE.md / DEV_NOTES.md
├── project.godot · .editorconfig · .gitattributes · .gitignore · icon.svg
├── addons/                 # third-party plugins (Debug Draw 3D)
├── assets/shaders/         # gdshaders — unit_body, unit_mask, tracer, fog_overlay, territory_field
├── docs/                   # DESIGN, AI_DESIGN, AI_IMPL, UNIT_VFX, FUTURE, archive/
├── resources/              # .tres data — ai/, economy/, teams/, unit_stats/, weapons/, themes/, world/environments/
├── autoload/               # 11 entries — must match project.godot [autoload]:
│                           # config_service, event_bus, action_executor, scene_router,
│                           # debug_mode, match_context, cursor_service, pause_service,
│                           # sim_time, tooltip_service, input_remap_service
├── core/                   # GAME-AGNOSTIC. Grep here for Unit/Team/Captain/Squad/MATERIEL → zero.
│   ├── actions/ ai/ combat/ config/ feedback/ fx/ geometry/ grid/ ids/ math/
│   ├── control/            # InputMode + InputModeService stack, WorldPicker, picker_validators/
│   ├── interaction/        # HoverService + HoverableComponent — generic hover/click for any entity
│   ├── perception/ pickup/ pooling/ rendering/ resources/
│   │   └── rendering/effects/ # EntityEffectsService, EntityEffectsComponent, EntityVisualsEffect (compositor)
│   └── scene/ scoring/ state_machine/ steering/ tooltip/
└── features/               # gameplay by concept — one folder per concept
    ├── abilities/          # AbilityProfile + AbilityRuntime (subclass per kind)
    ├── ai/                 # context_features/, primitives/, move_intents/, services/,
    │                       # directives/, score_modifiers/, actions/ — see DESIGN.md
    ├── app/                # app shell — main scene, MatchConfig (seed of Mission.tres)
    ├── camera/             # camera_controller + modes/ (top_down, locked)
    ├── combat/             # damage_resolver, damage_modifiers, fx_service, weapon_runtime
    ├── control/            # input_router, direct_control, world_click_router, verb_input_bindings, modes/ (selection/move/attack/assign), selection/
    ├── controllers/        # Controller base + local_player_controller + ai_player_controller
    ├── debug/              # F2 debug menu + panels, unit_debug_view, debug_pause_service
    ├── economy/            # income_ticker, resource_keys, pickup_kind, death_drop_profile
    ├── empty_arena/        # sandbox MatchShell subclass — target dummy testing
    ├── game/               # main.tscn, match_setup, match_shell, maps/, services/ (per-match scene-scoped)
    ├── hud/                # action_bar, captain_panel, hud_bars, recruitment_panel, tooltip_layer, feedback_layer, widgets/
    ├── loot/               # loot_drop, loot_payload (kill-loot mechanic)
    ├── perception/         # fog-of-war, unit mask viewport, world depth — see docs/UNIT_VFX.md
    ├── recruitment/        # RecruitmentService + catalog/entry/profile, actions/ (request/cancel/deploy/drop), modes/drop_mode
    ├── ships/              # Ship (team HQ entity)
    ├── squad/              # commander_brain (stub), cohesion, formation_assignment, objective, squad
    ├── teams/              # team, team_knowledge, private_knowledge, team_relations
    ├── territory/          # TerritoryManager grid + pluggable TerritorySource (capture_point + ship_base), shader-rendered visualizer
    ├── units/              # unit, unit_stats, locomotion_mode, components/, infantry/, captain/, locomotion/
    ├── weapons/            # weapon_view + .tscn rifle variants
    └── weather/            # weather_effect base + snow_weather / rain_weather
```

New gameplay concept → new `features/<x>/` folder. Cross-cutting infra with zero game concepts → `core/`. No catch-all `utils/` dir.

## Conventions

Most arch + mechanic rules live in [docs/DESIGN.md](docs/DESIGN.md) — architecture principles, friendly fire, tracer FX, data/runtime split, subclass-per-kind, single-state-authority. This section is for **code-level + file-level** rules only.

- **snake_case** files/folders. **PascalCase** node names + `class_name`.
- **`class_name` only when referenced elsewhere** (static typing, `is`/`as`). Avoid on one-off helpers.
- **Static typing everywhere** — params, returns, vars. Non-negotiable for new code.
- **One main script per scene**, same name as scene, attached to root node.
- **`@export` typed cross-refs between siblings.** Never `$"../X"` / `get_node` path strings. (See DESIGN.md arch principle 2.)
- **Self-contained scenes** — deps injected from ancestors via signals, `@export`, `@onready`.
- **`@onready`** for own child node refs. **`@export`** for inspector-tunable + cross-refs.
- **Signals over polling.** Cross-feature → `EventBus`. Local parent↔child / sibling = direct.
- **Custom `Resource`** for data (unit stats, weapon configs, doctrines, directives, missions).
- **`core/` purity** — grep audit for `Unit`/`Team`/`Captain`/`Squad`/`MATERIEL` must yield zero.
- **Cached / injected refs over runtime traversal** (`get_node`/`get_node_or_null`/`"../"` paths).
- **Helpers** — non-Clash-Plus-specific → `core/`. Touches game concepts → owning `features/<x>/`.
- **No stringly-typed patterns** unless absolutely necessary (confirm with user before).
- **Null-check discipline.** `if x == null: return` only when null is a legitimate state (no selection, optional component, service not yet up — retry via `call_deferred`). For invariants (wired siblings that _should_ be present, `@export` refs the scene must populate): use `push_error("[Class] expected X")` then return, OR rely on Godot's auto-crash on null deref — never silent return. Init-order races: defensive return is fine, but comment WHY so the next reader doesn't promote it to a hard error.

### UI organization

- **Scene-per-surface.** Each top-level screen (`main_menu`, `settings`, `match`, `empty_arena`, `match_end`) = own `.tscn` swapped by `SceneRouter`. Each in-match panel = own `.tscn` into `CanvasLayer`.
- **Atomic widgets in `features/hud/widgets/`** — icon button, labeled progress bar, panel header. One `.tscn` + one `.gd`, parameterised by `@export`. Reused N times, never duplicated.
- **Per-feature UI co-located** — feature-specific UI under that feature. Only cross-cutting widgets in `features/hud/widgets/`.
- **One `Theme.tres`** (`resources/themes/`) on each screen root. Children inherit.
- **Action-bar verbs** — new world-targeting verb = new `ActionBarItem.tres` + new `InputMode` subclass in `features/control/modes/` + one match arm in `VerbInputBindings._make_mode_for_action`. Sticky armed mode across resolves until same action toggled, Esc, or RMB.
- **List binding** — repeating views expose `update_view(model)` diffing against current children. Never wipe-and-rebuild.

## Code style

Follow [official GDScript style guide](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_styleguide.html) for member order + general formatting.

### Naming

- Files/folders: snake_case. File name = `class_name` snake-cased.
- `class_name`: PascalCase. Methods/vars/signals/enum-values: snake*case. Constants: CONSTANT_CASE. Enum types: PascalCase. Private: prefix `*`.

### Comments + docstrings

- `##` = docstring (file top when `class_name` set; above signals/properties/methods needing doc). Picked up by Godot's generator.
- `#` = inline implementation. Default to **none**. Add one only when WHY is non-obvious.
- File-purpose docstrings: 1–2 lines max. Design rationale belongs in DESIGN.md.
- Never restate WHAT. Never reference current task/phase/PR (rots).
- Production-ready: no commented-out code, no leftover `print()`, no naked `TODO` without tracked follow-up.

### Signals

- Past tense: `unit_died`, `capture_point_captured`, `dissent_resolved`. `_started`/`_finished` for action bounds.
- Typed params, no extra parens: `signal goal_changed(from: Goal, to: Goal)`.

### Typing

- Annotations on params, returns, vars. `:=` for inferred locals when RHS unambiguous.
- **Never `:=` with Variant-returning calls** — `.get()`, `get_meta()`, untyped `Dictionary` subscript, or any func returning `Variant`. Always explicit: `var x: MyType = dict.get("key")` or `var x := dict.get("key") as MyType`. GDScript infers Variant which trips compile errors.
- Typed collections: `Array[Directive]`, `PackedStringArray`. `Dictionary` only when heterogeneous keys/values or fast lookup needed.

### Other

- Tabs (Godot default). ~100 char lines. Named constants for magic numbers when reused or non-obvious.
- **`call_deferred` — use Callable form**: `method.call_deferred(arg)` not `call_deferred("method", arg)`. Callable form is type-checked at parse; string form is stringly-typed runtime dispatch and silently breaks on rename.

## Git commits

- **Only commit after user verification.** No state-broken commits. Assume broken until user says go.
- **Subject line only — no body.** Subject is the entire message. Never add bullet points, description paragraphs, or multi-line content after the subject. Single imperative sentence.
- **Conventional Commits** not required; descriptive imperative present-tense fine (`fix unit visibility flicker on assign`, `add cone LOS to vision component`).
- **Don't reference specific implementation plans** (phase 1a, etc).
- **No Claude attribution** in messages unless explicitly requested.
- **Never `--no-verify`** unless user asks. Hook fail = fix root cause.
- **New commit, not amend**, unless user asks.
- **Stage by name**, not `git add -A`/`.`. Avoids accidental secret/binary inclusion.
- **Same-commit rule** (see [Doc-drift prevention](#doc-drift-prevention)).

## Gotchas

Load-bearing runtime traps an agent will hit without first reading the code. Mechanism detail lives in the relevant source file's docstring — not here.

- **`call_deferred` when emitting signals during `_ready()`** if listeners may not exist yet.
- **Unperceived hostiles are invisible, not gray.** `UnitEffectsComponent` toggles `visible = false` on body meshes + mask twins on `unit_visibility_changed(unit, false)`. No draw calls, no compositor fall-through. Debug "where is AI?" via F1 `KnowledgeDebugView` — don't expect a visible body.
- **Navmesh-Y snap.** `MovementComponent` snaps `body.y` to navmesh.y. Navmesh must be baked flush with playable surface. Unit content authored body-origin-at-feet.
- **`Area3D.body_entered` doesn't replay** for bodies already inside. Spawn-inside-zone needs one-shot `get_overlapping_bodies()` walk in `_ready` (see `CapturePoint._scan_initial_overlaps`).
- **Mode-stack input ownership.** `InputModeService` (`MatchContext.input_modes`) owns a stack of `InputMode` resources. Top mode answers `handles_world_click` / `on_world_click` / `should_hover` / `on_escape` / `on_right_click`. Three consumers consult it: `InputRouter` (Esc/RMB), `WorldClickRouter` (LMB on empty world), `HoverService` (hover filter). Mutex is structural — only one mode is top, no signals to coordinate. New verb = new `InputMode` subclass + one match arm in `VerbInputBindings._make_mode_for_action`. Mode comparison is by `get_script()` identity, never `display_name()` strings. Default `SelectionMode` cannot be popped.
- **Per-map visual env on `Camera3D.environment`, NOT `WorldEnvironment` node.** Perception SubViewport cameras inherit scene `World3D` — any post-process on a `WorldEnvironment` ALSO runs on mask render + corrupts packed IDs / depth. Per-map env is `.tres` in `resources/world/environments/`, applied by `MatchShell._apply_camera_environment`. Never re-add `WorldEnvironment` to a map scene. See [UNIT_VFX.md](docs/UNIT_VFX.md) pitfall #4.
- **`PauseService` = single pause authority.** Flags-based (`_debug`, `_user`), priority USER > DEBUG > NONE. Only `PauseService` writes `get_tree().paused`. Mouse-confinement + camera input-lock gate on `is_user_paused()` / `mode_changed`, never directly on `get_tree().paused`.
- **Debug pause = ALWAYS-cascade rule.** `PROCESS_MODE_ALWAYS` propagates through `PROCESS_MODE_INHERIT` children. Every ALWAYS node with sim descendants must re-pin its sim subtree PAUSABLE at the boundary (e.g., `app.gd` does this on `ScreensRoot`). New ALWAYS node = audit its subtree.
- **Match-scoped services register Action handlers dynamically** via `ActionExecutor.register_handler` in `_ready`. Dictionary key = action Script, so previous match's handler is overwritten cleanly on new scene boot.
- **Player-unit planners run by default.** Direct action (move/attack) on a non-avatar unit takes single-unit `DirectControl` + pauses that unit's planner. `ReleaseControlAction` (Esc) resumes. With avatar pivot: avatar is the primary direct-control target; lone units and squad members are pingable but not normally hijacked.
- **`TooltipLayer` mounted once at app root, NOT per-screen.** Lives in `features/app/app.tscn` so the active tooltip survives `SceneRouter` swaps. Multiple TooltipLayers all subscribe to `TooltipService.tooltip_shown` and would render duplicate ghosts. New screen with tooltips = use `TooltipTrigger` Control component; do not instance another `tooltip_layer.tscn`.
- **`FeedbackService` is match-scoped, NOT autoload.** Lives as a child of `MatchShell` (`MatchContext.feedback`). Game-event → feedback wiring goes in `features/hud/feedback_bindings.gd` — the ONLY site where `core/feedback/` meets game concepts. Don't connect `EventBus` signals inside `feedback_service.gd` itself or core purity breaks.
- **Hover pickability is push, not pull.** `HoverableComponent.enabled` is the gate; `HoverService` only checks the flag. Game-side bindings flip it reactively — `UnitVisibilityBinding` (perception + debug reveal) for units, `Ship._recompute_pickability` (team ownership + POV swap) for ships. Adding a new pickable entity = new binding listening to whatever signals govern its rule. Never put pickability logic in `core/interaction/`. ⚠️ **Split-screen would break this** — `enabled` is per-entity, not per-viewport. Network MP / co-op same-ship works (one process = one local POV).

## Performance

RTS scales by unit count × tick rate × draw calls. Sim and presentation must run on separate budgets.

### Hard rules (Clash-specific)

- **Per-entity `ShaderMaterial` banned for entity visuals.** Compositor pipeline owns these — see [UNIT_VFX.md](docs/UNIT_VFX.md). Adding effect = new `EntityState` field + shader branch in `core/rendering/effects/`, not a per-entity material.
- **Sim vs presentation tick separation.** Simulation (AI, planners, territory, economy) runs at low frequency (2–20 Hz) on `Timer`/accumulator. Presentation (visuals, FX, HUD) runs `_process`. Sim work never in `_process`. Presentation work never blocks sim.
- **Stagger batched units.** N units same logic same frame = spike. `DirectiveTickSchedulerService` staggers planner ticks by `unit_id % N`. Apply same pattern to perception sweeps, raycast spam, vision recompute.
- **Tick budgets:**
  - Planner: ~5 Hz per unit, scheduler-staggered
  - Cohesion: ~2 Hz on `CommandComponent`
  - Captain influence: ~2 Hz in `TerritoryManager`
  - Fog-of-war splat: 10 Hz on CPU
- **No O(N²) at scale.** Pairwise unit checks past N ~50 → spatial partition.
- **Pool transient entities.** Projectiles, tracers, damage numbers, drop pods, loot drops → `core/pooling/`. `instantiate` + `queue_free` per shot banned.

### Measurement protocol (Claude's role)

Profiler is the user's tool. Claude operates around it:

1. **Identify bottleneck before changing code.** Name the budget (script / physics / draw calls / GPU fill / allocator). Can't name = guessing.
2. **No opt without measurement.** Spike reported → ask: which Monitor metric? Repro? Unit count?
3. **Offer micro-bench snippets** (`Time.get_ticks_usec()` over 1000+ iters) for user to run.
4. **One change at a time.** Bundled "opts" hide which helped or regressed.
5. **Ask re-measure after change.** User numbers > Claude confidence.
6. **Refuse "optimize this file" without target.** Premature opt banned — ask what's slow.

For generic Godot perf advice (caching, allocation, threading, GPU state churn, LOD), see the [Godot optimization docs](https://docs.godotengine.org/en/stable/tutorials/performance/).

## Critical findings policy

When exploration or impl discovers any of these, **list under "Critical findings" in response before proceeding**. Do not silently work around. Do not delete to "clean up." Surface root cause.

- **Architectural violations** — `core/` referencing Clash Plus concepts (`Unit`/`Team`/`Captain`/`Squad`/`MATERIEL`).
- **Hidden coupling** — path-string node access, cross-feature reads bypassing EventBus, hard-coded sibling lookups.
- **Unsafe ownership** — mutating shared `.tres` Resources at runtime, missing data/runtime split, autoload bloat past current count (11).
- **Hacky synchronization** — polling where signals fit, `await get_tree().create_timer()` as flow control, frame-count delays for ordering.
- **Duplicated responsibility** — two systems writing the same state, parallel impl paths for player vs AI where one would do.
- **Renderer abuse** — per-unit `ShaderMaterial` for unit visuals (compositor owns these — see UNIT_VFX), manual `_process` draw calls outside compositor.
- **Temporary logic becoming permanent** — hard-coded magic numbers without named constants, `# TODO` without tracker entry, stub methods still in shipping paths.
- **Untyped GDScript in hot paths** — `_process`, `_physics_process`, per-tick AI, per-tick perception.

Bias: root-cause fixes over hacks/shortcuts. Industry-standard, modularized, scalable, neat. Production-ready or surface as finding.

## Doc-drift prevention

- **Same-commit rule.** Code change that adds/moves/deletes files → update [Project layout](#project-layout) in same commit. Architectural principle change (autoload count, ownership model, perception path, action layer route) → update [docs/DESIGN.md](docs/DESIGN.md) same commit. Visuals-pipeline edit under `features/perception/`, `core/rendering/effects/`, or `EntityEffectsComponent` → update [docs/UNIT_VFX.md](docs/UNIT_VFX.md) same commit.
- **Single source of truth.** Each fact lives in exactly one doc. Cross-link, never restate. Authorities:
  - Project tree → CLAUDE.md
  - Architecture principles + mechanics → DESIGN.md
  - Visuals pipeline → UNIT_VFX.md
  - Runtime traps → CLAUDE.md Gotchas
  - Future work → FUTURE.md
  - Active bugs → DEV_NOTES.md
- **No phase / refactor noise in main docs.** Completed work → `docs/archive/`. In-flight tuning → `docs/FUTURE.md`. Main docs describe present-tense reality only.
- **No code-as-doc.** Signal lists, function signatures, file paths beyond top-level tree, other code-shaped artifacts don't belong in docs (rot vs source). Grep is faster than reading stale doc.
- **Last-reviewed footer.** Each doc carries `_Last reviewed: YYYY-MM-DD_`. Agent touching the file updates date. Date > 60 days at session start = flag for re-audit.
- **Drift detection on session start.** Before non-trivial change: CLAUDE.md tree matches `Get-ChildItem` top-level dirs? Any doc references path/symbol grep can't find? Findings reported under Critical Findings.

## Development notes

1. **Read codebase first**, confirm before major changes.
2. **Communicate high-level changes** after edits.
3. **Correctness** — no speculation; grounded code inspection only.
4. **Quality** — production-ready, call out runtime risks. Industry standard. Modularized. Scalable. No hacks/shortcuts. Address underlying issue.

---

> **Default tone: caveman-full. Stay caveman until "stop caveman" or "normal mode". Be brief, less tokens, technical terms exact, fragments OK.**

_Last reviewed: 2026-05-28 (modal input stack — InputMode/InputModeService in core/control/ replace ObjectiveTargeting + WorldPickerRegistry, SelectionMode/MoveMode/AttackMode/AssignMode/DropMode under features/control/modes/ + features/recruitment/modes/, WorldClickRouter + VerbInputBindings own LMB + verb push, HoverService consults top mode, RegionOverlay shared SDF shader, DropMode + WORLD_PROPS layer for obstacle-aware drops, reinforcements/ folder + ReinforcementMenu deleted in favour of recruitment/)_
