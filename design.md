# Design — <project>

Owner: ux-designer. Devs build from this; tester verifies the accessibility AC. Only needed for projects with a UI.

## Flows  (per user story)
### <story name>
Entry → step → step → success. Plus the unhappy paths:
- Loading / in-progress: <what the user sees>
- Empty: <no data yet>
- Error: <what failed + the way out>

## Wireframes
<ASCII / markdown layout per screen — structure before visuals>

## Design system  (reuse — don't reinvent per screen)
- Spacing scale: <...>
- Type scale: <...>
- Color roles: <primary / surface / danger / ...>  (state contrast ≥4.5:1 body text)
- Components + states: <button / input / ... → default, hover, focus, disabled, error>
- Microcopy / tone: <...>
- Responsive behavior: <breakpoints, what reflows>

## Heuristic self-check  (Nielsen's 10 — note how each is met/NA)
status feedback · real-world match · user control/undo · consistency · error prevention ·
recognition-over-recall · flexibility/shortcuts · minimalist · error recovery · help

## Accessibility acceptance criteria  (WCAG 2.2 AA — POUR; tester verifies)
- Perceivable: <text alternatives, contrast ratios, not color-alone>
- Operable: <full keyboard, visible focus, no traps, targets ≥24px>
- Understandable: <labeled inputs, predictable behavior, clear error messages>
- Robust: <semantic structure / roles for assistive tech>
