# How the org works — read once

A small dev team as agents. 10 roles, 2 modes. Short prompts, direct action, few handoffs.

## Two modes

**PLAN MODE** — figure out WHAT + HOW. No production code written.
```
Client → business-analyst (requirements + clarify)
       → architect (design + split into tasks), pulling in:
           ux-designer      (any UI — flows, design system, accessibility)
           product-engineer (feasibility, prioritization, spikes to de-risk)
```
Output: `project-context.md` (what/why + design) + `coding-standards.md` + a task list in `task-board.md`.

**AGILE DEV MODE** — build it.
```
architect delegates task → senior-dev / junior-dev / devops build
                         → reviewer (independent code + integration review)
                         → tester (validate vs acceptance criteria) → done
project-manager tracks + documents the whole time
```
Start in plan mode. Switch to dev mode once the plan + tasks exist. Small/obvious change = skip plan mode, just do it.

## Incoming requests — intake + triage
Every new bug/change request goes to **project-manager** first (the front door).
1. PM logs it and sets **priority** (P0 critical → P3 low — urgency/when to fix).
2. PM routes by type (asks senior-dev for the **severity/complexity** read only on borderline cases):
   - new / unclear requirement → **business-analyst**
   - clear small fix → **senior-dev** → does it, or delegates to **junior-dev**
   - complex / architectural / cross-cutting → **architect** → pulls **ux-designer** + **product-engineer** to plan → task split
3. Then the normal build flow: build → **reviewer** → **tester** → done.

Priority = business urgency (PM owns). Severity = technical impact/complexity (senior-dev owns). Different axes — don't conflate them.

## Shared files (the source of truth — not chat)
```
project-context.md    what we're building, why, constraints, design, decisions   (BA seeds; architect + PM keep current)
coding-standards.md   stack, conventions, how to run tests                        (architect)
task-board.md         tasks + owner + priority + status                           (architect creates; PM keeps honest; each updates own)
design.md             flows, states, components, accessibility AC                 (ux-designer; optional — only UI projects)
logs/<agent>.md       one log file per agent, that agent appends only             (each agent, own file only)
```
"Analyze the code" = Grep / Glob / Read. Reuse before you write — no duplicates.

**Who documents:** architect owns the *technical* record (architecture, standards, design decisions); project-manager owns the *project* record (status, changelog, what shipped/when/by whom). Both have whole-project context — so both keep their record current as work happens, not after.

**User-facing docs** are split three ways by who knows it best: **architect** → overview + getting-started/setup; **senior-dev** → API/usage reference for what they built; **tester** → verified how-to/user guide (only steps they ran and saw pass). One voice, no overlap — keep the three coherent.

## Logging — one file per agent (no shared file, no lock)
Each agent writes **only** its own `logs/<agent>.md` — e.g. senior-dev → `logs/senior-dev.md`. Because no two agents ever write the same file, parallel agents never collide; no read-modify-write, no lost lines.
- 1 line per task at handoff/done (not per action).
- Format: `- <date> [T<id>] one-line summary` (e.g. `- 2026-07-15 [T7] built /auth API, tests green, → reviewer`).
- To see who-did-what across the team, read/concat `logs/*.md` (PM does this for status reports).

## Task line (task-board.md)
`- [ ] T7 [senior-dev] Build /auth API  prio:P1  status:todo  deps:T3`
status: todo | wip | review | test | done | blocked

## Delegation
Use the `Task` tool. Give the target: task id, files, the one thing to do. Spawn parallel copies for independent tasks.
- architect → senior-dev (hard) / junior-dev (easy) / devops (infra); pulls ux-designer + product-engineer when planning.
- senior-dev → junior-dev for sub-tasks, then reviews; escalates complex asks up to architect.
- senior-dev → reviewer → tester on completion.

## Common rules (every agent)
- **Clarify if unsure.** Don't invent requirements — ask, or note the assumption in project-context.md.
- **Log 1 line** to your own `logs/<agent>.md` at handoff/done. Never write another agent's log file.
- **Devs write unit tests.** No feature ships without them.
- **Research + fact-check** with `mcp__web-search__web_search` (SearXNG) and `mcp__deepwiki__*` (public-repo docs) before building on an unfamiliar library or claim.
- Follow `coding-standards.md` — its **Non-negotiables** (DRY, no magic strings, config in one place, consistency, lint clean) apply to every project by default. Update `project-context.md` when a real decision is made.
- Match ceremony to task size. A typo doesn't need the full loop.

## Roles (one file each in .claude/agents/)
business-analyst · project-manager · architect · product-engineer · ux-designer · senior-dev · junior-dev · devops · reviewer · tester
