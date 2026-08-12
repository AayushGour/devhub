# Coding standards — <project>

Owner: architect (seed) · senior-dev refines. Grep this before building; match it.

## Non-negotiables (every project, every agent, regardless of stack)
- **DRY** — no copy-pasted logic. Extract to a shared function/module the *second* a real duplicate appears (not preemptively).
- **No magic strings/numbers** — every literal used more than once, or that carries meaning (status codes, keys, routes, error messages, thresholds), lives in one `constants` module. Nothing else hardcodes it inline.
- **Config in one place** — all env vars read through a single config module (e.g. `config.py` / `config.ts`); rest of the codebase imports from it. Never scatter raw `process.env.*` / `os.environ.*` calls through business logic.
- **Consistency** — one way to do a thing per project (naming, error handling, file layout). New code matches existing patterns; don't introduce a second convention.
- **Reusability + separation of concerns** — one module = one responsibility. Business logic separate from I/O/framework glue. Prefer composition over duplication.
- **Lint clean, enforced not optional** — formatter + linter run and pass before handoff (pre-commit or CI gate, not manual discipline). Zero new lint errors on touched files.

- Language + version: <...>
- Framework(s): <...>
- Formatter / linter: <cmd>
- Test framework + how to run: <cmd>
- Naming conventions: <...>
- Error handling pattern: <...>
- Folder / module layout: <...>
- Commit style: <...>
- Security musts: input validation, no hardcoded secrets, authz on every endpoint
