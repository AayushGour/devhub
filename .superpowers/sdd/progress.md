# SDD progress — repo-explorer merkle-diff caveats (P3, P4)

Adapted from skill default: this project's standing rule is "never git
commit" (leave changes staged), so no per-task commits exist. Diffs are
tracked via `git diff` against the working tree; the ledger below is the
source of truth for what's done.

- Task P3 (per-directory tree walk for large-repo truncation): complete
  (files: types.ts, utils/githubApi.ts, utils/diffTree.ts, hooks/useGitHubFetcher.ts —
  review: spec MET, quality APPROVED; noted non-blocking efficiency point:
  unchanged-subtree reuse rescans all of prevFiles per reused dir, inherited
  from the brief's own algorithm, not a defect)
- Task P4 (rename-pairing collision fix): complete
  (file: utils/diffTree.ts — review: spec MET, quality APPROVED, no findings)
- Final whole-branch review (P0-P4 together): complete
  (opus reviewer — Ready to merge: With fixes. 0 Critical, 2 Important, 4 Minor.
  Important findings fixed by one fix subagent + verified independently:
  1. useIndexer.ts indexRepo had no try/catch — a throw left indexingStore
     stuck mid-phase forever. Fixed: catch sets store error state then
     re-throws (preserves P0's throw-before-manifest-save contract).
  2. useGitHubFetcher.ts "manifest exists but no cached repo data" fallthrough
     diffed against the stale prevManifest instead of null, silently producing
     empty-content files. Fixed: prevManifest reassigned to null in that branch.
  Minor findings (SKIP_DIRS asymmetry between flat/walk blob-vs-tree check,
  walk not recording descendant dirShas on reuse, ConcurrencyLimiter benign
  momentary over-subscription, migration save-before-index ordering asymmetry)
  left as-is per reviewer's own assessment — none correctness-affecting.
  tsc --noEmit clean, verified independently by controller.)
