# Deck-Level Config (`type: deck`) + Page-Number Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a document-level `type: deck` yaml-fence block that sets deck-wide `style`/`footer` defaults (same schema slides already use), make slide page numbers opt-in instead of always-on, and keep deck-level and slide-level config consistent via one field-level merge model.

**Architecture:** A `type: deck` chunk is parsed with the same yaml-fence mechanism as every slide, but lifted out during preview (never rendered as a `.slide-page`) and its `style`/`footer` become the deck-wide defaults every slide field-merges over — exactly how per-slide `footer` already merges over a deck default today. The always-on corner page-number badge is removed; a page number now renders inside the footer, gated by the resolved `footer.pageNumber` (default `false`).

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react, existing `yaml` package (already a dependency).

## Global Constraints

- No `---`-delimited frontmatter parsing — `type: deck` uses the same yaml-fence convention as slides (spec: `docs/superpowers/specs/2026-07-15-deck-level-config-design.md`).
- No `theme` keyword on the `type: deck` block (decided against in brainstorming).
- No deck-level title/subtitle/author/date — those stay on the `title` slide only.
- `deck` is NOT added to `SlideType` / `SLIDE_LAYOUTS` — it has no rendered layout.
- Run `npx tsc --noEmit -p tsconfig.app.json` after every file change (CLAUDE.md).
- No `@ts-ignore`/`as any` unless unavoidable with a comment explaining why (CLAUDE.md).
- Tailwind-first styling; `cn()` for conditional classes (CLAUDE.md) — not relevant to this plan's code changes (no new UI markup beyond what's specified), but any new JSX must follow it.
- All commands below run from `/Users/aayushgour/Desktop/projects/devtools/devhub.worktrees/llm-migration/web` unless stated otherwise.
- Do NOT run `git commit` — this project's standing rule is to leave changes staged/unstaged (per user's prior instruction in this session).

---

## Task 1: `slideParser.ts` — detect and extract `type: deck` blocks

**Files:**
- Modify: `src/features/markdown-studio/utils/slideParser.ts`
- Test: `src/features/markdown-studio/utils/slideParser.test.ts`

**Interfaces:**
- Consumes: existing `YAML_FENCE_RE`, `parseYaml` (from `yaml`), `isPlainObject`, `validateSlideStyle`/`validateSlideFooter` (from `./slideStyle`) — all already in this file/imported.
- Produces:
  - `export interface DeckConfig { style?: SlideStyle; footer?: SlideFooter }`
  - `export function isDeckChunk(chunk: SlideChunk): boolean`
  - `export function extractDeckConfig(chunk: SlideChunk): DeckConfig`
  - These three are consumed by Task 4 (`SlideDeckPreview.tsx`).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/markdown-studio/utils/slideParser.test.ts` (after the existing `describe('extractSlideConfig', ...)` block, before `describe('SLIDE_LAYOUTS registry', ...)`):

```ts
import { splitSlides, extractSlideConfig, SLIDE_LAYOUTS, isDeckChunk, extractDeckConfig } from './slideParser'
```

(Replace the existing `import { splitSlides, extractSlideConfig, SLIDE_LAYOUTS } from './slideParser'` at the top of the file with the line above — adds `isDeckChunk, extractDeckConfig` to the named imports.)

Then add this new `describe` block right before `describe('SLIDE_LAYOUTS registry', ...)`:

```ts
describe('isDeckChunk', () => {
  it('returns true for a chunk whose yaml fence has type: deck', () => {
    const raw = ['```yaml', 'type: deck', 'footer:', '  left: "DevHub"', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(true)
  })

  it('returns false for a chunk with a different type', () => {
    const raw = ['```yaml', 'type: content', 'title: "X"', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(false)
  })

  it('returns false for a chunk with no yaml fence', () => {
    expect(isDeckChunk({ raw: 'just markdown' })).toBe(false)
  })

  it('returns false for malformed yaml (never throws)', () => {
    const raw = ['```yaml', ':::: not yaml ::::', '```'].join('\n')
    expect(() => isDeckChunk({ raw })).not.toThrow()
    expect(isDeckChunk({ raw })).toBe(false)
  })

  it('returns false when the yaml fence holds a scalar/array, not a mapping', () => {
    const raw = ['```yaml', '- just an array', '```'].join('\n')
    expect(isDeckChunk({ raw })).toBe(false)
  })
})

describe('extractDeckConfig', () => {
  it('extracts style and footer from a type: deck chunk', () => {
    const raw = [
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      'footer:',
      '  left: "DevHub"',
      '  pageNumber: true',
      '```',
    ].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.style).toEqual({ background: { color: '#0f172a' } })
    expect(config.footer).toEqual({ left: 'DevHub', pageNumber: true })
  })

  it('ignores fields other than style/footer (e.g. a stray title)', () => {
    const raw = ['```yaml', 'type: deck', 'title: "Ignored"', 'footer:', '  left: "L"', '```'].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.footer).toEqual({ left: 'L' })
    expect((config as Record<string, unknown>).title).toBeUndefined()
  })

  it('applies the same style/footer guardrails as per-slide config', () => {
    const raw = [
      '```yaml',
      'type: deck',
      'style:',
      '  title:',
      '    color: "not-a-color"',
      '    fontSize: "3em"',
      '```',
    ].join('\n')
    const config = extractDeckConfig({ raw })
    expect(config.style).toEqual({ title: { fontSize: '3em' } })
  })

  it('returns {} for a chunk with no yaml fence', () => {
    expect(extractDeckConfig({ raw: 'no fence here' })).toEqual({})
  })

  it('returns {} for malformed yaml (never throws)', () => {
    const raw = ['```yaml', ':::: not yaml ::::', '```'].join('\n')
    expect(() => extractDeckConfig({ raw })).not.toThrow()
    expect(extractDeckConfig({ raw })).toEqual({})
  })

  it('returns {} when neither style nor footer is present', () => {
    const raw = ['```yaml', 'type: deck', '```'].join('\n')
    expect(extractDeckConfig({ raw })).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/markdown-studio/utils/slideParser.test.ts`
Expected: FAIL — `isDeckChunk`/`extractDeckConfig` are not exported from `./slideParser` (TypeScript/import error, or `is not a function`).

- [ ] **Step 3: Implement `isDeckChunk` and `extractDeckConfig`**

In `src/features/markdown-studio/utils/slideParser.ts`, insert the following right after the closing brace of `extractSlideConfig` (currently ends at line 150, immediately before `function isPlainObject`):

```ts
export interface DeckConfig {
  style?: SlideStyle
  footer?: SlideFooter
}

/**
 * Peeks at a chunk's yaml fence (if any) to determine whether it declares
 * `type: deck` — a document-level config block, not a rendered slide. Returns
 * false for chunks with no yaml fence, malformed yaml, a non-mapping fence, or
 * any other type (including missing/unrecognized, which extractSlideConfig
 * separately falls back to `content` for — this function is only about
 * distinguishing the deck-config chunk from every rendered slide chunk).
 */
export function isDeckChunk(chunk: SlideChunk): boolean {
  const m = YAML_FENCE_RE.exec(chunk.raw)
  if (!m) return false
  let parsed: unknown
  try {
    parsed = parseYaml(m[1])
  } catch {
    return false
  }
  return isPlainObject(parsed) && parsed.type === 'deck'
}

/**
 * Extracts deck-level config from a `type: deck` chunk. Only `style`/`footer`
 * are recognized — everything else (a stray title, body text, etc.) is
 * ignored, same forward-compatible-fallback philosophy as slide config. Same
 * guardrail validation as per-slide style/footer (validateSlideStyle /
 * validateSlideFooter). Malformed yaml, a non-mapping fence, or no fence at
 * all yields {} — the deck falls back to built-in defaults, never throws.
 */
export function extractDeckConfig(chunk: SlideChunk): DeckConfig {
  const m = YAML_FENCE_RE.exec(chunk.raw)
  if (!m) return {}
  let parsed: unknown
  try {
    parsed = parseYaml(m[1])
  } catch {
    return {}
  }
  if (!isPlainObject(parsed)) return {}

  const config: DeckConfig = {}
  const style = validateSlideStyle(parsed.style)
  if (Object.keys(style).length) config.style = style
  const footer = validateSlideFooter(parsed.footer)
  if (Object.keys(footer).length) config.footer = footer
  return config
}

```

Note: `isPlainObject` is a hoisted function declaration defined later in this same file (currently at line 152) — referencing it here before its textual declaration is valid TypeScript/JavaScript (function declarations are hoisted), and matches how `extractSlideConfig` above already calls it the same way.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/markdown-studio/utils/slideParser.test.ts`
Expected: PASS — all tests in the file, including the new `isDeckChunk`/`extractDeckConfig` blocks.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

---

## Task 2: `slideStyle.ts` — `mergeSlideStyle` + page numbers off by default

**Files:**
- Modify: `src/features/markdown-studio/utils/slideStyle.ts`
- Test: `src/features/markdown-studio/utils/slideStyle.test.ts`

**Interfaces:**
- Consumes: existing `SlideStyle` type (already defined in this file).
- Produces: `export function mergeSlideStyle(deckStyle: SlideStyle, slideStyle: SlideStyle | undefined): SlideStyle` — consumed by Task 3 (`SlideCard.tsx`) and exercised end-to-end by Task 4 (`SlideDeckPreview.tsx`).
- Changes existing `DEFAULT_DECK_FOOTER.pageNumber` from `true` to `false` — every consumer of this constant (Task 3, its tests) must be updated to expect the new value.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/markdown-studio/utils/slideStyle.test.ts`, right after the `describe('slideStyleToReactStyle', ...)` block (at the end of the file):

```ts
describe('mergeSlideStyle', () => {
  it('a slide with no style of its own inherits the full deck style', () => {
    const deckStyle = { background: { color: '#0f172a' }, title: { fontSize: '2em' } }
    const merged = mergeSlideStyle(deckStyle, undefined)
    expect(merged).toEqual(deckStyle)
  })

  it('a slide style category not present in the deck style is kept as-is', () => {
    const deckStyle = { background: { color: '#0f172a' } }
    const slideStyle = { title: { color: '#ffffff' } }
    const merged = mergeSlideStyle(deckStyle, slideStyle)
    expect(merged).toEqual({ background: { color: '#0f172a' }, title: { color: '#ffffff' } })
  })

  it('field-level merge within a shared category: slide property overrides, other deck properties in that category survive', () => {
    const deckStyle = { title: { color: '#0f172a', fontSize: '2em', align: 'left' as const } }
    const slideStyle = { title: { color: '#ffffff' } }
    const merged = mergeSlideStyle(deckStyle, slideStyle)
    expect(merged.title).toEqual({ color: '#ffffff', fontSize: '2em', align: 'left' })
  })

  it('empty deck style + no slide style yields {}', () => {
    expect(mergeSlideStyle({}, undefined)).toEqual({})
  })

  it('empty deck style + a slide style returns just the slide style', () => {
    const slideStyle = { body: { fontSize: '1.1em' } }
    expect(mergeSlideStyle({}, slideStyle)).toEqual(slideStyle)
  })
})
```

Also update the import line at the top of the file:

```ts
import {
  validateSlideStyle, validateSlideFooter, mergeFooter, mergeSlideStyle, slideStyleToReactStyle,
  FONT_SIZE_MIN_PX, FONT_SIZE_MAX_PX,
} from './slideStyle'
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/markdown-studio/utils/slideStyle.test.ts`
Expected: FAIL — `mergeSlideStyle` is not exported.

- [ ] **Step 3: Implement `mergeSlideStyle` and flip the page-number default**

In `src/features/markdown-studio/utils/slideStyle.ts`, change the `DEFAULT_DECK_FOOTER` constant (currently lines 52-58):

```ts
// Mirrors defaultExportConfig()'s footer-related fields (utils/pdfExport.ts) — the
// sensible fallback SlideCard uses when the caller hasn't threaded a live ExportConfig
// down yet (e.g. the export modal hasn't been opened this session).
export const DEFAULT_DECK_FOOTER: DeckFooterDefaults = {
  show: true,
  left: '',
  center: '',
  right: '',
  pageNumber: true,
}
```

to:

```ts
// Built-in deck-level footer defaults, used when a deck has no `type: deck` block (or
// that block's own footer omits a field). NOT sourced from continuous-mode's
// ExportConfig/defaultExportConfig — deck mode's footer defaults come from the
// document itself (the `type: deck` block, see slideParser.ts's extractDeckConfig),
// consistent with the rest of deck-mode config living in the document, not app state.
// pageNumber defaults to false (opt-in): page numbers used to always render via a
// separate always-on corner badge regardless of any footer setting — that badge is
// removed; a page number is now purely a footer feature, off unless a deck or slide
// explicitly turns it on via footer.pageNumber.
export const DEFAULT_DECK_FOOTER: DeckFooterDefaults = {
  show: true,
  left: '',
  center: '',
  right: '',
  pageNumber: false,
}
```

Then add `mergeSlideStyle` right after the existing `mergeFooter` function (currently ends at line 174, immediately before `export interface SlideReactStyle`):

```ts
/**
 * Field-level merge (mirrors mergeFooter): a slide's `style` merges over the deck's
 * default `style`, per category then per property — a slide overriding just
 * style.title.color keeps the deck's style.background.color and any other
 * style.title.* properties the deck set (e.g. fontSize). Categories present in only
 * one side pass through unchanged; a category absent from both sides is omitted from
 * the result entirely (not present as an empty object), matching validateSlideStyle's
 * own omit-if-empty convention.
 */
export function mergeSlideStyle(deckStyle: SlideStyle, slideStyle: SlideStyle | undefined): SlideStyle {
  const out: SlideStyle = {}

  const background = { ...deckStyle.background, ...slideStyle?.background }
  if (Object.keys(background).length) out.background = background

  const title = { ...deckStyle.title, ...slideStyle?.title }
  if (Object.keys(title).length) out.title = title

  const body = { ...deckStyle.body, ...slideStyle?.body }
  if (Object.keys(body).length) out.body = body

  return out
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/markdown-studio/utils/slideStyle.test.ts`
Expected: FAIL for now — this will break the pre-existing `mergeFooter` describe block only if it references `DEFAULT_DECK_FOOTER`'s literal default (it does not; it uses a local `deckDefaults` literal, see file). Confirm no other test in this file references `DEFAULT_DECK_FOOTER`. Then expected: PASS for all tests in this file.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

---

## Task 3: `SlideCard.tsx` — deck-level style merge, remove corner badge, page number moves into the footer

**Files:**
- Modify: `src/features/markdown-studio/components/SlideCard.tsx`
- Modify: `src/features/markdown-studio/components/SlideCard.test.tsx` (full rewrite)
- Modify: `src/features/markdown-studio/components/SlideCard.acceptance.test.tsx` (targeted edits)

**Interfaces:**
- Consumes: `mergeSlideStyle` (Task 2), `DEFAULT_DECK_FOOTER` (Task 2, now `pageNumber: false`), existing `mergeFooter`/`slideStyleToReactStyle`/`SlideStyle` type from `../utils/slideStyle`.
- Produces: `SlideCard` gains a new optional prop `deckStyle?: SlideStyle` (default `{}`); consumed by Task 4 (`SlideDeckPreview.tsx`). `SlideCard`'s existing `deckFooter?: DeckFooterDefaults` prop is unchanged in shape (still consumed the same way by Task 4).

- [ ] **Step 1: Update `SlideCard.tsx` — add `deckStyle` prop, merge it, remove the corner badge, move the page number into the footer**

In `src/features/markdown-studio/components/SlideCard.tsx`, change the import line (currently line 8-9):

```ts
import { DEFAULT_DECK_FOOTER, mergeFooter, slideStyleToReactStyle } from '../utils/slideStyle'
import type { DeckFooterDefaults } from '../utils/slideStyle'
```

to:

```ts
import { DEFAULT_DECK_FOOTER, mergeFooter, mergeSlideStyle, slideStyleToReactStyle } from '../utils/slideStyle'
import type { DeckFooterDefaults, SlideStyle } from '../utils/slideStyle'
```

Change the props interface (currently lines 14-22):

```ts
interface SlideCardProps {
  config: SlideConfig
  pageNumber: number
  // Deck-level footer defaults (from ExportConfig) this slide's `footer` field-merges
  // over (D5 / mergeFooter). Falls back to DEFAULT_DECK_FOOTER when the export modal
  // hasn't been opened yet, so preview still shows a footer using ExportConfig's
  // built-in defaults (showFooter: true, footerPageNumbers: true).
  deckFooter?: DeckFooterDefaults
}
```

to:

```ts
interface SlideCardProps {
  config: SlideConfig
  pageNumber: number
  // Deck-level footer defaults (from the document's `type: deck` block, see
  // slideParser.ts's extractDeckConfig) this slide's `footer` field-merges over
  // (mergeFooter). Falls back to DEFAULT_DECK_FOOTER when the deck has no
  // `type: deck` block.
  deckFooter?: DeckFooterDefaults
  // Deck-level style defaults (from the document's `type: deck` block) this slide's
  // `style` field-merges over, per category/property (mergeSlideStyle). Falls back to
  // {} (built-in per-layout defaults only) when the deck has no `type: deck` block.
  deckStyle?: SlideStyle
}
```

Change the function signature (currently line 28):

```ts
export default function SlideCard({ config, pageNumber, deckFooter = DEFAULT_DECK_FOOTER }: SlideCardProps) {
```

to:

```ts
export default function SlideCard({ config, pageNumber, deckFooter = DEFAULT_DECK_FOOTER, deckStyle = {} }: SlideCardProps) {
```

Change the style/footer computation (currently lines 80-82):

```ts
  const Layout = SLIDE_LAYOUTS[config.type]
  const reactStyle = slideStyleToReactStyle(config.style)
  const footer = mergeFooter(config.footer, deckFooter)
```

to:

```ts
  const Layout = SLIDE_LAYOUTS[config.type]
  const mergedStyle = mergeSlideStyle(deckStyle, config.style)
  const reactStyle = slideStyleToReactStyle(mergedStyle)
  const footer = mergeFooter(config.footer, deckFooter)
```

Remove the standalone corner page-number badge entirely (currently lines 106-110):

```tsx
      {/* Chrome (page number / footer / overflow badge) sizes in cqw so it scales with
          the slide box the same way the content does — never px/rem. */}
      <span className="pointer-events-none absolute bottom-[1.6cqw] right-[2cqw] rounded-full bg-surface-raised/90 px-[0.9cqw] py-[0.25cqw] text-[1.05cqw] font-medium text-on-surface-muted border border-border">
        {pageNumber}
      </span>

```

DELETE this block completely (including the blank line after it).

Then update the footer block (currently lines 112-122, now shifted up by the deletion above — locate by content, not line number):

```tsx
      {footer.show && (
        <div className="slide-page__footer pointer-events-none absolute inset-x-[2cqw] bottom-[1.6cqw] flex items-center justify-between gap-[1cqw] text-[0.95cqw] text-on-surface-muted">
          <span className="truncate">{footer.left}</span>
          <span className="truncate text-center flex-1">{footer.center}</span>
          {/* footer.pageNumber reuses the existing corner page-number badge below as its
              on-slide page-number indicator (it already always renders `pageNumber`), so
              the footer's right slot only carries the free-text `footer.right` value and
              never duplicates the number as a second text node. */}
          <span className="truncate">{footer.right}</span>
        </div>
      )}
```

Replace with:

```tsx
      {footer.show && (
        <div className="slide-page__footer pointer-events-none absolute inset-x-[2cqw] bottom-[1.6cqw] flex items-center justify-between gap-[1cqw] text-[0.95cqw] text-on-surface-muted">
          <span className="truncate">{footer.left}</span>
          <span className="truncate text-center flex-1">{footer.center}</span>
          {/* Page number lives here now — not a standalone always-on corner badge.
              Opt-in via the resolved footer.pageNumber (deck-level default,
              per-slide override), default OFF. Renders alongside footer.right
              when both are present; footer.show:false hides the whole footer
              (and thus the number) for that slide, same as any other footer field. */}
          <span className="truncate flex items-center justify-end gap-[0.5cqw]">
            {footer.right && <span className="truncate">{footer.right}</span>}
            {footer.pageNumber && <span>{pageNumber}</span>}
          </span>
        </div>
      )}
```

The overflow badge block below it (using `top-[1.4cqw] right-[1.4cqw]`) is unrelated and unchanged.

- [ ] **Step 2: Run the type-checker to catch any obvious mistakes before touching tests**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: errors in `SlideCard.test.tsx`/`SlideCard.acceptance.test.tsx` only if they reference removed behavior — proceed to Step 3/4 to fix.

- [ ] **Step 3: Rewrite `SlideCard.test.tsx`**

Replace the entire contents of `src/features/markdown-studio/components/SlideCard.test.tsx` with:

```tsx
// Dev-authored unit tests for SlideCard's footer and style merge wiring (see
// project-context.md footer/style AC and the deck-level-config design doc). Complements
// the tester-authored acceptance suite in SlideCard.acceptance.test.tsx — this file
// covers the mergeFooter/deckFooter and mergeSlideStyle/deckStyle plumbing itself
// (default props, per-field inheritance, the page-number-in-footer behavior) rather
// than re-deriving every AC scenario.
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SlideCard from './SlideCard'
import { DEFAULT_DECK_FOOTER } from '../utils/slideStyle'
import type { SlideConfig } from '../utils/slideParser'

afterEach(cleanup)

function baseConfig(overrides: Partial<SlideConfig> = {}): SlideConfig {
  return { type: 'content', body: '', ...overrides }
}

describe('SlideCard footer wiring', () => {
  it('uses DEFAULT_DECK_FOOTER when no deckFooter prop is passed (footer visible, page numbers off by default)', async () => {
    expect(DEFAULT_DECK_FOOTER).toEqual({ show: true, left: '', center: '', right: '', pageNumber: false })
    const { container } = render(<SlideCard config={baseConfig()} pageNumber={1} />)
    // show:true + all text fields empty + pageNumber off -> footer element renders but with no visible text.
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    expect(screen.queryByText('1')).not.toBeInTheDocument()
  })

  it('renders no footer element at all when the merged footer resolves show:false', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ footer: { show: false } })}
        pageNumber={1}
        deckFooter={{ show: true, left: 'x', center: 'y', right: 'z', pageNumber: true }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).toBeNull())
  })

  it('slide footer fully overrides all fields when every field is specified', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({
          footer: { show: true, left: 'A', center: 'B', right: 'C', pageNumber: false },
        })}
        pageNumber={5}
        deckFooter={{ show: true, left: 'deckA', center: 'deckB', right: 'deckC', pageNumber: true }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('A')
    expect(footer?.textContent).toContain('B')
    expect(footer?.textContent).toContain('C')
    expect(footer?.textContent).not.toContain('deckA')
    expect(footer?.textContent).not.toContain('5') // pageNumber:false overrides deck's true
  })

  it('footer element sits outside the .slide-page__content transform wrapper (not shrunk/clipped with the body)', async () => {
    const { container } = render(
      <SlideCard config={baseConfig({ footer: { show: true, left: 'Chrome text' } })} pageNumber={1} />
    )
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    const content = container.querySelector('.slide-page__content')
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    expect(content?.contains(footer as Node)).toBe(false)
  })

  it('shows the page number inside the footer only when the merged footer.pageNumber is true', async () => {
    const { container, rerender } = render(
      <SlideCard config={baseConfig({ footer: { pageNumber: true } })} pageNumber={7} />
    )
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')?.textContent).toContain('7')

    rerender(<SlideCard config={baseConfig({ footer: { pageNumber: false } })} pageNumber={7} />)
    await waitFor(() => expect(container.querySelector('.slide-page__footer')).not.toBeNull())
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})

describe('SlideCard deckStyle wiring', () => {
  it('applies deck-level style to a slide with no style of its own', async () => {
    const { container } = render(
      <SlideCard config={baseConfig()} pageNumber={1} deckStyle={{ background: { color: '#0f172a' } }} />
    )
    await waitFor(() => expect(container.querySelector('.slide-card')).not.toBeNull())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)') // #0f172a
  })

  it('slide style overrides only the matching deck property, other deck properties still apply', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ style: { title: { color: '#ffffff' } } })}
        pageNumber={1}
        deckStyle={{ background: { color: '#0f172a' }, title: { fontSize: '2em' } }}
      />
    )
    await waitFor(() => expect(container.querySelector('.slide-card')).not.toBeNull())
    const card = container.querySelector('.slide-card') as HTMLElement
    // deck background still applies (slide didn't override it)
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)')
  })
})
```

- [ ] **Step 4: Run `SlideCard.test.tsx` to verify it passes**

Run: `npx vitest run src/features/markdown-studio/components/SlideCard.test.tsx`
Expected: PASS — all tests.

- [ ] **Step 5: Edit `SlideCard.acceptance.test.tsx` — replace the page-number badge describe block**

In `src/features/markdown-studio/components/SlideCard.acceptance.test.tsx`, replace:

```ts
describe('AC: SlideCard shows a page-number badge', () => {
  it('renders the given pageNumber', async () => {
    render(<SlideCard config={baseConfig({ title: 'X' })} pageNumber={3} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })
})
```

with:

```ts
describe('AC: SlideCard shows the page number in the footer, opt-in via footer.pageNumber (default OFF)', () => {
  it('renders the given pageNumber inside the footer when footer.pageNumber is true', async () => {
    render(<SlideCard config={baseConfig({ title: 'X', footer: { pageNumber: true } })} pageNumber={3} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
  })

  it('does NOT render a page number when footer.pageNumber is not set (new default: off)', async () => {
    render(<SlideCard config={baseConfig({ title: 'X' })} pageNumber={3} />)
    await waitFor(() => expect(screen.getByText('X')).toBeInTheDocument())
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Edit `SlideCard.acceptance.test.tsx` — fix the two page-number-as-sync-signal wait targets that no longer resolve**

Replace:

```ts
  it('does NOT show "content overflows" badge for normal (non-overflowing) content in jsdom (scrollHeight=0 default)', async () => {
    render(<SlideCard config={baseConfig({ title: 'Fits fine', body: 'short body' })} pageNumber={1} />)
    await waitFor(() => screen.getByText('1'))
    expect(screen.queryByText(/content overflows/i)).not.toBeInTheDocument()
  })
```

with:

```ts
  it('does NOT show "content overflows" badge for normal (non-overflowing) content in jsdom (scrollHeight=0 default)', async () => {
    render(<SlideCard config={baseConfig({ title: 'Fits fine', body: 'short body' })} pageNumber={1} />)
    await waitFor(() => expect(screen.getByText('Fits fine')).toBeInTheDocument())
    expect(screen.queryByText(/content overflows/i)).not.toBeInTheDocument()
  })
```

Replace:

```ts
  it('config.notes text never appears in the rendered card DOM', async () => {
    const notesText = 'PREVIEW-DOM-SENTINEL-NOTES'
    const { container } = render(
      <SlideCard config={baseConfig({ type: 'content', title: 'T', body: 'body', notes: notesText })} pageNumber={1} />
    )
    await waitFor(() => screen.getByText('1'))
    expect(container.innerHTML).not.toContain(notesText)
  })
```

with:

```ts
  it('config.notes text never appears in the rendered card DOM', async () => {
    const notesText = 'PREVIEW-DOM-SENTINEL-NOTES'
    const { container } = render(
      <SlideCard config={baseConfig({ type: 'content', title: 'T', body: 'body', notes: notesText })} pageNumber={1} />
    )
    await waitFor(() => expect(screen.getByText('T')).toBeInTheDocument())
    expect(container.innerHTML).not.toContain(notesText)
  })
```

Replace:

```ts
  it('applies background color from config.style to the card wrapper element', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Styled', style: { background: { color: '#123456' } } })}
        pageNumber={1}
      />
    )
    await waitFor(() => screen.getByText('1'))
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.style.backgroundColor).toBe('rgb(18, 52, 86)') // #123456
  })
```

with:

```ts
  it('applies background color from config.style to the card wrapper element', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Styled', style: { background: { color: '#123456' } } })}
        pageNumber={1}
      />
    )
    await waitFor(() => expect(screen.getByText('Styled')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card).not.toBeNull()
    expect(card.style.backgroundColor).toBe('rgb(18, 52, 86)') // #123456
  })
```

- [ ] **Step 7: Edit `SlideCard.acceptance.test.tsx` — fix the 4 footer-wiring tests' wait targets**

Replace the entire `describe('FIXED (was KNOWN GAP): footer is wired up — SlideCard renders a .slide-page__footer element driven by mergeFooter(config.footer, deckFooter)', ...)` block with:

```ts
describe('FIXED (was KNOWN GAP): footer is wired up — SlideCard renders a .slide-page__footer element driven by mergeFooter(config.footer, deckFooter)', () => {
  it('SlideCard renders a .slide-page__footer element with the slide footer text when config.footer is set', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({
          type: 'content',
          title: 'Has footer config',
          footer: { show: true, left: 'Left text', center: 'Center text', right: 'Right text' },
        })}
        pageNumber={1}
      />
    )
    await waitFor(() => expect(screen.getByText('Left text')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain('Left text')
    expect(footer?.textContent).toContain('Center text')
    expect(footer?.textContent).toContain('Right text')
  })

  it('footer.show:false hides the footer on that slide only', async () => {
    const { container } = render(
      <SlideCard config={baseConfig({ type: 'content', title: 'No footer', footer: { show: false, left: 'Hidden left' } })} pageNumber={1} />
    )
    await waitFor(() => expect(screen.getByText('No footer')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')).toBeNull()
    expect(container.textContent).not.toContain('Hidden left')
  })

  it('omitted footer fields inherit the deck-level default for that field individually', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Partial footer', footer: { left: 'Slide left' } })}
        pageNumber={2}
        deckFooter={{ show: true, left: 'Deck left', center: 'Deck center', right: 'Deck right', pageNumber: true }}
      />
    )
    await waitFor(() => expect(screen.getByText('Slide left')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer).not.toBeNull()
    // slide overrides left, inherits center/right from deck
    expect(footer?.textContent).toContain('Slide left')
    expect(footer?.textContent).toContain('Deck center')
    expect(footer?.textContent).toContain('Deck right')
    expect(footer?.textContent).not.toContain('Deck left')
  })

  it('footer.show omitted inherits deckFooter.show (deck default hides the footer)', async () => {
    const { container } = render(
      <SlideCard
        config={baseConfig({ type: 'content', title: 'Inherit show' })}
        pageNumber={1}
        deckFooter={{ show: false, left: '', center: '', right: '', pageNumber: true }}
      />
    )
    await waitFor(() => expect(screen.getByText('Inherit show')).toBeInTheDocument())
    expect(container.querySelector('.slide-page__footer')).toBeNull()
  })
})
```

(The overflow-badge describe blocks — `'AC: overflow badge is preview-only...'` and `'FIXED (was KNOWN GAP): the overflow badge still renders...'` — already wait on `/content overflows/i` text, not the page number. Leave them unchanged.)

- [ ] **Step 8: Run the full acceptance test file**

Run: `npx vitest run src/features/markdown-studio/components/SlideCard.acceptance.test.tsx`
Expected: PASS — all tests.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

---

## Task 4: `SlideDeckPreview.tsx` — partition the `type: deck` chunk and thread resolved deck defaults

**Files:**
- Modify: `src/features/markdown-studio/components/SlideDeckPreview.tsx`
- Create: `src/features/markdown-studio/components/SlideDeckPreview.test.tsx`

**Interfaces:**
- Consumes: `splitSlides`, `extractSlideConfig`, `isDeckChunk`, `extractDeckConfig` (Task 1, `../utils/slideParser`); `DEFAULT_DECK_FOOTER`, `mergeFooter`, `mergeSlideStyle` (Task 2, `../utils/slideStyle`); `SlideCard` with its `deckFooter`/`deckStyle` props (Task 3).
- Produces: `SlideDeckPreviewProps` drops the external `deckFooter` prop — it now becomes `{ content: string }` only. Consumed by Task 5 (`PreviewPane.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `src/features/markdown-studio/components/SlideDeckPreview.test.tsx`:

```tsx
// Integration-level tests for the type: deck partition + deck-level style/footer
// field-merge propagation into rendered SlideCards (see
// docs/superpowers/specs/2026-07-15-deck-level-config-design.md).
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import SlideDeckPreview from './SlideDeckPreview'

afterEach(cleanup)

describe('SlideDeckPreview deck-level config (type: deck)', () => {
  it('a type: deck chunk is not rendered as a slide', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Only Slide"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Only Slide')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
  })

  it('deck footer defaults apply to a slide with no footer of its own', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '  pageNumber: true',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('DevHub')
    expect(footer?.textContent).toContain('1') // pageNumber from deck default
  })

  it('a slide footer field overrides the deck default for that field only', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "DevHub"',
      '  right: "Confidential"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      'footer:',
      '  right: "Public"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('DevHub')
    expect(footer?.textContent).toContain('Public')
    expect(footer?.textContent).not.toContain('Confidential')
  })

  it('deck style defaults apply to a slide with no style of its own', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)')
  })

  it('a slide style property overrides the deck default for that property only, other deck properties still apply', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'style:',
      '  background:',
      '    color: "#0f172a"',
      '  title:',
      '    fontSize: "2em"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      'style:',
      '  title:',
      '    color: "#ffffff"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    const card = container.querySelector('.slide-card') as HTMLElement
    expect(card.style.backgroundColor).toBe('rgb(15, 23, 42)') // deck default kept
    const title = card.querySelector('h2') as HTMLElement
    expect(title.style.color).toBe('rgb(255, 255, 255)') // slide override
    expect(title.style.fontSize).toBe('2em') // deck default kept (slide didn't override fontSize)
  })

  it('first type: deck block wins when multiple exist; the rest are also not rendered as slides', async () => {
    const content = [
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "First"',
      '```',
      '---',
      '```yaml',
      'type: deck',
      'footer:',
      '  left: "Second"',
      '```',
      '---',
      '```yaml',
      'type: content',
      'title: "Slide A"',
      '```',
      'body',
    ].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
    const footer = container.querySelector('.slide-page__footer')
    expect(footer?.textContent).toContain('First')
    expect(footer?.textContent).not.toContain('Second')
  })

  it('no type: deck block: all chunks render as slides, deck defaults are built-in (page numbers off)', async () => {
    const content = ['---', '```yaml', 'type: content', 'title: "Slide A"', '```', 'body'].join('\n')
    const { container } = render(<SlideDeckPreview content={content} />)
    await waitFor(() => expect(screen.getByText('Slide A')).toBeInTheDocument())
    expect(container.querySelectorAll('.slide-card')).toHaveLength(1)
    expect(screen.queryByText('1')).not.toBeInTheDocument() // page numbers off by default
  })
})
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run src/features/markdown-studio/components/SlideDeckPreview.test.tsx`
Expected: FAIL — `type: deck` chunks currently fall through `extractSlideConfig` unchanged (rendered as a `content`-type slide since `'deck'` isn't a recognized `SlideType`), so the "not rendered as a slide" and "deck defaults apply" assertions fail; `SlideDeckPreview` doesn't yet compute/pass `deckStyle` at all.

- [ ] **Step 3: Rewrite `SlideDeckPreview.tsx`**

This component resolves the deck-level DEFAULTS only (`deckFooter`/`deckStyle`) and passes them straight through to each `SlideCard` as its `deckFooter`/`deckStyle` props — `SlideCard` (Task 3) already does the one merge of each slide's own `config.footer`/`config.style` over those defaults internally. Do NOT pre-merge here — that would double-merge.

Replace the entire contents of `src/features/markdown-studio/components/SlideDeckPreview.tsx` with:

```tsx
import { useMemo } from 'react'
import { splitSlides, extractSlideConfig, isDeckChunk, extractDeckConfig } from '../utils/slideParser'
import SlideCard from './SlideCard'
import { DEFAULT_DECK_FOOTER, mergeFooter } from '../utils/slideStyle'
import type { DeckFooterDefaults, SlideStyle } from '../utils/slideStyle'

interface SlideDeckPreviewProps {
  content: string
}

// Deck-mode PreviewPane replacement: content -> splitSlides -> partition out any
// `type: deck` config chunk -> extractSlideConfig (rendered slides) -> SlideCard stack.
// Export reads this stack's rendered DOM via previewRef.innerHTML (see PreviewPane.tsx
// — the ref contract is unchanged from continuous mode).
//
// Deck-level config (docs/superpowers/specs/2026-07-15-deck-level-config-design.md):
// a `type: deck` chunk is never rendered as a slide. Its `style`/`footer` become the
// deck-wide defaults every slide field-merges over — same mechanism a slide's own
// footer already used to merge over a deck default (mergeFooter), now symmetric for
// style too (mergeSlideStyle, done inside SlideCard itself — this component only
// resolves the deck-level DEFAULTS, each SlideCard merges its own config.style/footer
// over them exactly once). If multiple `type: deck` chunks exist, the first is used
// for config and ALL of them are excluded from rendering. No `type: deck` block ->
// deck defaults are the built-in DEFAULT_DECK_FOOTER / {} (empty style).
export default function SlideDeckPreview({ content }: SlideDeckPreviewProps) {
  const { deckFooter, deckStyle, slideConfigs } = useMemo(() => {
    const chunks = splitSlides(content)
    const deckChunk = chunks.find(isDeckChunk)
    const deckConfig = deckChunk ? extractDeckConfig(deckChunk) : {}
    const deckFooter: DeckFooterDefaults = mergeFooter(deckConfig.footer, DEFAULT_DECK_FOOTER)
    const deckStyle: SlideStyle = deckConfig.style ?? {}
    const slideConfigs = chunks.filter(c => !isDeckChunk(c)).map(extractSlideConfig)
    return { deckFooter, deckStyle, slideConfigs }
  }, [content])

  if (slideConfigs.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-on-surface-muted p-8">
        No slides yet — add content and separate slides with a line containing only <code className="mx-1">---</code>.
      </div>
    )
  }

  return (
    <div className="slide-deck-stack flex flex-col gap-6 p-6">
      {slideConfigs.map((config, i) => (
        <div key={i} className="slide-page">
          <SlideCard config={config} pageNumber={i + 1} deckFooter={deckFooter} deckStyle={deckStyle} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/features/markdown-studio/components/SlideDeckPreview.test.tsx`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Run the full markdown-studio test suite to check for regressions**

Run: `npx vitest run src/features/markdown-studio`
Expected: all test files pass, including `SlideCard.test.tsx`, `SlideCard.acceptance.test.tsx`, `slideParser.test.ts`, `slideStyle.test.ts`, and the previously-passing `slideExport*.test.ts`/`slideOverflow.test.ts`/`slideLayouts.acceptance.test.tsx`/`pdfExport*.test.ts` (untouched by this plan, should remain green).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

---

## Task 5: `PreviewPane.tsx` — drop the external `deckFooter` prop

**Files:**
- Modify: `src/features/markdown-studio/components/PreviewPane.tsx`

**Interfaces:**
- Consumes: `SlideDeckPreview` with its new `{ content: string }`-only prop shape (Task 4).
- Produces: `PreviewPaneProps` drops `deckFooter`; consumed by Task 6 (`index.tsx`).

No test file exists for `PreviewPane.tsx` currently (confirmed: no `PreviewPane.test.tsx` in the repo) and no other test references its `deckFooter` prop — this task is a prop-threading removal with no test changes required, verified by the type-checker and Task 8's manual smoke test.

- [ ] **Step 1: Remove the `deckFooter` prop from `PreviewPane.tsx`**

In `src/features/markdown-studio/components/PreviewPane.tsx`, remove the import of `DeckFooterDefaults` (currently line 9):

```ts
import type { DeckFooterDefaults } from '../utils/slideStyle'
```

DELETE this line entirely (`SlideDeckPreview` no longer takes a `deckFooter` prop, and no other type in this file needs it).

Remove the `deckFooter` field from `PreviewPaneProps` (currently lines 21-24):

```ts
  // Deck-level footer defaults (from the export config state) each slide's `footer`
  // field-merges over — threaded down to SlideDeckPreview/SlideCard. Optional; SlideCard
  // falls back to its own default when the export modal hasn't been opened yet.
  deckFooter?: DeckFooterDefaults
```

DELETE this block entirely (including its comment).

Update the function signature (currently line 68):

```ts
export default function PreviewPane({ content, themeId, styleSettings, previewRef, scrollRef, deckMode, deckFooter }: PreviewPaneProps) {
```

to:

```ts
export default function PreviewPane({ content, themeId, styleSettings, previewRef, scrollRef, deckMode }: PreviewPaneProps) {
```

Update the `SlideDeckPreview` call site (currently line 133):

```tsx
        {deckMode && <SlideDeckPreview content={content} deckFooter={deckFooter} />}
```

to:

```tsx
        {deckMode && <SlideDeckPreview content={content} />}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors (this will also surface the now-stale prop pass from `index.tsx`, fixed in Task 6).

---

## Task 6: `index.tsx` — remove the `deckFooter`/`defaultExportConfig` computation and prop

**Files:**
- Modify: `src/features/markdown-studio/index.tsx`

**Interfaces:**
- Consumes: `PreviewPane` without a `deckFooter` prop (Task 5).
- Produces: nothing new consumed elsewhere — this is the final link in the removal chain.

No test file exists for `index.tsx`. Verified by the type-checker and Task 8's manual smoke test.

- [ ] **Step 1: Remove the deck-footer computation block**

In `src/features/markdown-studio/index.tsx`, remove (currently lines 66-78):

```ts
  // Deck-level footer defaults for preview (SlideDeckPreview/SlideCard field-merge each
  // slide's `footer` over this — see D5/mergeFooter). ExportModal owns its own separate
  // ExportConfig state (not lifted here), so the preview uses the same
  // defaultExportConfig() footer defaults the modal would start from until a richer
  // "live config" is threaded back — a sensible default per the fix spec.
  const deckExportDefaults = defaultExportConfig(title)
  const deckFooter = {
    show: deckExportDefaults.showFooter,
    left: deckExportDefaults.footerLeft ?? '',
    center: deckExportDefaults.footerCenter ?? '',
    right: deckExportDefaults.footerRight ?? '',
    pageNumber: deckExportDefaults.footerPageNumbers,
  }
```

DELETE this entire block. (`defaultExportConfig` is still used elsewhere in this file — inside `buildConfig()` and the `ExportModal`'s own internal state — so its import stays; only this specific deck-footer derivation goes away.)

Remove the `deckFooter={deckFooter}` prop from the `<PreviewPane ... />` call site (currently lines 110-118):

```tsx
        <PreviewPane
          content={content}
          themeId={themeId}
          styleSettings={styleSettings}
          previewRef={previewRef}
          scrollRef={previewScrollRef}
          deckMode={deckMode}
          deckFooter={deckFooter}
        />
```

to:

```tsx
        <PreviewPane
          content={content}
          themeId={themeId}
          styleSettings={styleSettings}
          previewRef={previewRef}
          scrollRef={previewScrollRef}
          deckMode={deckMode}
        />
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all test files pass (should be back to the full pre-existing count plus the new tests from Tasks 1, 2, 3, 4).

---

## Task 7: Docs — SKILL.md, template.md, SlideDeckGuide.tsx

**Files:**
- Modify: `docs/skills/slide-deck-markdown/SKILL.md`
- Modify: `docs/skills/slide-deck-markdown/template.md`
- Modify: `web/src/features/markdown-studio/components/SlideDeckGuide.tsx`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by other tasks — this task can run independently of Tasks 1-6, but logically documents their result, so it's sequenced last for accuracy.

- [ ] **Step 1: Add a new "Deck-Level Config" section to `SKILL.md`**

In `docs/skills/slide-deck-markdown/SKILL.md`, insert a new section immediately after the "## Deck Title & Metadata" section's closing `---` (currently at line 76) and before "## Slide Types & Schema" (currently at line 78):

```markdown
## Deck-Level Config (`type: deck`)

**A `type: deck` yaml-fence block sets deck-wide defaults — the same `style`/`footer` fields every slide already uses.** It is config, not a slide: it is never rendered as a page. Put it anywhere in the deck (conventionally first); it's excluded from the slide sequence regardless of position.

```yaml
type: deck
style:
  background:
    color: "#0f172a"
  body:
    color: "#e2e8f0"
    fontSize: "1em"
footer:
  show: true
  left: "DevHub"
  pageNumber: false
```

Recognized fields (both optional): `style` (same 3-level schema and guardrails as per-slide `style` — see Style Value Guardrails below) and `footer` (same flat 2-level schema as per-slide `footer`). Anything else on a `type: deck` block (a title, body text, etc.) is ignored.

**Why not `---` frontmatter?** Same reason per-slide config isn't frontmatter — see "Per-Slide Config" above. `type: deck` reuses the exact same yaml-fence mechanism, so there's one convention for both document-level and slide-level config, not two.

**Merge semantics — deck = default, slide = override, one consistent model:**

Every slide's `style`/`footer` field-merges *over* the deck's `style`/`footer`, per category/property:

```
built-in default → type: deck block → individual slide
```

A slide overriding `style.title.color` keeps the deck's `style.background.color` and any other `style.title.*`/`style.body.*` the deck set. Same for `footer`: a slide overriding `footer.right` keeps the deck's `footer.left`/`footer.center`/`footer.pageNumber`.

**Multiple `type: deck` blocks:** the first is used; the rest are ignored and — like the first — never rendered as slides.

**No `type: deck` block:** every slide falls back to the built-in defaults (empty style, footer visible with no text, page numbers off).

---

```

- [ ] **Step 2: Update the "Universal Fields" → `footer` section to reflect page numbers off by default and the new deck-config source**

In `docs/skills/slide-deck-markdown/SKILL.md`, replace:

```markdown
### `footer`
Per-slide footer override. Flat, 2 levels deep:

```yaml
footer:
  show: true
  left: "Company Name"
  center: "Q3 2026"
  right: "Internal"
  pageNumber: true
```

**Merge semantics:** Any field you omit inherits the deck-level footer setting for that field. So you can override just one field:
```

with:

```markdown
### `footer`
Per-slide footer override. Flat, 2 levels deep:

```yaml
footer:
  show: true
  left: "Company Name"
  center: "Q3 2026"
  right: "Internal"
  pageNumber: true
```

**Page numbers are OFF by default.** `pageNumber` (like every other footer field) inherits from the deck-level footer (see "Deck-Level Config" above) when a slide omits it, and the built-in default is `false`. Turn page numbers on for the whole deck via a `type: deck` block's `footer.pageNumber: true`, or per-slide via that slide's own `footer.pageNumber: true`. There is no separate always-on page-number indicator — the number only ever appears as part of the footer, so `footer.show: false` also hides the number.

**Merge semantics:** Any field you omit inherits the deck-level footer setting for that field (the `type: deck` block's `footer`, or the built-in default if the deck has none). So you can override just one field:
```

- [ ] **Step 3: Update the "Fallback Behavior" table**

In `docs/skills/slide-deck-markdown/SKILL.md`, in the "## Fallback Behavior" table, add one row (after the existing `| style or footer not an object | ... |` row):

```markdown
| A `type: deck` chunk's `style`/`footer` fails validation | Same per-key guardrail dropping as a slide's own `style`/`footer`; the deck falls back to built-in defaults for the dropped keys |
| Multiple `type: deck` blocks | First is used; the rest are ignored (and, like the first, never rendered as slides) |
```

- [ ] **Step 4: Update the Worked Full-Deck Example to open with a `type: deck` block**

In `docs/skills/slide-deck-markdown/SKILL.md`, in the "## Worked Full-Deck Example" section, insert a new first chunk before the existing `type: title` chunk (currently starting right after the ` ````md ` fence at line 327):

Find:
```
````md
---
```yaml
type: title
title: "DevHub Architecture"
```

Replace with:
```
````md
---
```yaml
type: deck
footer:
  show: true
  left: "DevHub"
  pageNumber: true
```

---
```yaml
type: title
title: "DevHub Architecture"
```

(i.e., add a `type: deck` chunk, followed by its own `---` separator, ahead of the existing `type: title` chunk — every other chunk in the example is unchanged.)

Immediately after this worked example's closing ` ```` ` fence, in the "Notes on the patterns above" prose that follows it (if present) or as a new bullet if there is a notes list, add: a `type: deck` opening block turns on the footer and page numbers for the whole deck (`footer.show: true`, `footer.pageNumber: true`, `footer.left: "DevHub"`) — every slide in the example inherits that unless it sets its own `footer`.

- [ ] **Step 5: Update the Author Checklist**

In `docs/skills/slide-deck-markdown/SKILL.md`, in the "## Author Checklist" section, add one item after the first (`First slide has type: title...`):

```markdown
- [ ] If the deck needs shared styling/footer defaults, a `type: deck` block is present (anywhere, conventionally first) with only `style`/`footer` set
- [ ] Page numbers are intentionally on or off — remember the default is OFF; set `footer.pageNumber: true` (deck-level or per-slide) if you want them
```

- [ ] **Step 6: Prepend a `type: deck` block to `template.md`**

In `docs/skills/slide-deck-markdown/template.md`, insert this as the new first chunk, before the existing `type: title` chunk:

```yaml
---
```yaml
type: deck
footer:
  show: true
  left: "Your Company"
  pageNumber: true
```

```

(Followed by its own `---` separator before the existing `type: title` block — the rest of the file is unchanged.)

- [ ] **Step 7: Update `SlideDeckGuide.tsx` — Overview tab gets a "Deck-level config" rule, Fields tab's footer rule mentions the new default, Example gets a `type: deck` block**

In `web/src/features/markdown-studio/components/SlideDeckGuide.tsx`, in `OverviewTab()`, add a new `<Rule>` after the "Deck title" rule and before "Forgiving by design":

```tsx
      <Rule label="Deck-level config">
        A <Code>type: deck</Code> block (same yaml-fence convention, never rendered as a
        slide) sets deck-wide <Code>style</Code>/<Code>footer</Code> defaults. Every
        slide field-merges its own <Code>style</Code>/<Code>footer</Code> over these —
        deck = default, slide = override, one consistent model at both levels.
      </Rule>
```

In `FieldsTab()`, replace the `footer` rule:

```tsx
      <Rule label="footer">
        Per-slide footer override — flat, 2 levels: <Code>show</Code>, <Code>left</Code>,
        <Code>center</Code>, <Code>right</Code>, <Code>pageNumber</Code>. Any field you omit
        inherits the deck-level footer. Common use: <Code>footer.show: false</Code> to hide
        the footer on the title slide.
      </Rule>
```

with:

```tsx
      <Rule label="footer">
        Per-slide footer override — flat, 2 levels: <Code>show</Code>, <Code>left</Code>,
        <Code>center</Code>, <Code>right</Code>, <Code>pageNumber</Code>. Any field you omit
        inherits the deck-level footer (a <Code>type: deck</Code> block, or the built-in
        default). <strong>Page numbers are off by default</strong> — set
        <Code>footer.pageNumber: true</Code> deck-wide or per-slide to turn them on. Common
        use: <Code>footer.show: false</Code> to hide the footer on the title slide.
      </Rule>
```

Update the `EXAMPLE` constant to open with a `type: deck` block. Replace:

```ts
const EXAMPLE = `---
\`\`\`yaml
type: title
title: "Q3 Review"
```

with:

```ts
const EXAMPLE = `---
\`\`\`yaml
type: deck
footer:
  show: true
  left: "DevHub"
  pageNumber: true
\`\`\`

---
\`\`\`yaml
type: title
title: "Q3 Review"
```

And update the `ExampleTab()` description paragraph. Replace:

```tsx
      <p className="text-on-surface-muted">
        A valid 4-slide deck exercising the title slide, universal fields, two-column, and mermaid.
        Toggle Slide Deck off to see the raw markdown, or paste this into the editor.
      </p>
```

with:

```tsx
      <p className="text-on-surface-muted">
        A valid deck exercising a <code className="font-mono">type: deck</code> block, the
        title slide, universal fields, two-column, and mermaid. Toggle Slide Deck off to
        see the raw markdown, or paste this into the editor.
      </p>
```

- [ ] **Step 8: Type-check and lint the guide component**

Run (from `web/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

Run (from `web/`): `npx eslint src/features/markdown-studio/components/SlideDeckGuide.tsx`
Expected: no errors.

---

## Task 8: Full verification — tests, types, lint, and a live-browser smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run (from `web/`): `npm run test`
Expected: all test files pass, including every file touched or added in Tasks 1-4 (`slideParser.test.ts`, `slideStyle.test.ts`, `SlideCard.test.tsx`, `SlideCard.acceptance.test.tsx`, `SlideDeckPreview.test.tsx`) and every pre-existing untouched file (`slideExport.test.ts`, `slideExport.acceptance.test.ts`, `slideOverflow.test.ts`, `pdfExport.test.ts`, `pdfExport.acceptance.test.ts`, `slideStyle.acceptance.test.ts`, `slideParser.acceptance.test.ts`, `slideLayouts.acceptance.test.tsx`).

- [ ] **Step 2: Type-check the whole app**

Run (from `web/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Lint the touched files**

Run (from `web/`):
```bash
npx eslint \
  src/features/markdown-studio/utils/slideParser.ts \
  src/features/markdown-studio/utils/slideStyle.ts \
  src/features/markdown-studio/components/SlideCard.tsx \
  src/features/markdown-studio/components/SlideDeckPreview.tsx \
  src/features/markdown-studio/components/PreviewPane.tsx \
  src/features/markdown-studio/index.tsx \
  src/features/markdown-studio/components/SlideDeckGuide.tsx
```
Expected: no errors. (Pre-existing `react-hooks/immutability` findings in `PreviewPane.tsx` unrelated to this plan's edits — see this repo's `logs.md` — are expected to remain and are not a regression to fix here.)

- [ ] **Step 4: Live-browser smoke test**

Start the dev server (from `web/`): `npm run dev > /tmp/vite-dev.log 2>&1 &` then check `tail -3 /tmp/vite-dev.log` for the local URL (port may not be 5173 if another instance is already running — use whatever port is printed).

Using the Playwright MCP tools (`browser_navigate`, `browser_evaluate` with `window.monaco.editor.getEditors()[0].setValue(...)` to set editor content, `browser_find`/`browser_click` to toggle "Slide Deck" mode, `browser_take_screenshot`):

1. Navigate to `/devhub/tools/markdown`, toggle Slide Deck mode with the default doc — confirm no page-number badges appear on any slide (matches the new default-off behavior) and no console errors.
2. Set editor content to a deck with a `type: deck` block (`footer: { show: true, left: "Test Co", pageNumber: true }`) followed by 2 `type: content` slides, one of which sets its own `footer: { right: "Slide Override" }`. Confirm: both slides show a footer with "Test Co" on the left and a page number on the right; the second slide additionally shows "Slide Override" without losing "Test Co" or the page number.
3. Add `style: { background: { color: "#0f172a" } }` to the `type: deck` block. Confirm both content slides render with the dark background even though neither sets its own `style.background`.
4. Override `style.title.color` on one slide only. Confirm that slide's title uses the override while its background stays the deck-level dark color, and the other slide is unaffected.
5. Export the deck to PDF (patch `window.open` to no-op `print`/`close` as done earlier in this session, per the established pattern) and confirm the exported print doc's slides show the same footer/page-number/style resolution as the preview (no preview↔export mismatch).

Report any visual or console-error discrepancy found; if found, fix before considering this plan complete (fixes should be minimal, targeted patches to the specific file at fault — not a plan re-write).

---

## Self-Review Notes (for whoever executes this plan)

- **Spec coverage:** `type: deck` block (Task 1, 4), merge semantics for style (Task 2) and footer (already existed, reused), page numbers off-by-default + footer-only (Task 2, 3), multiple-deck-blocks/first-wins (Task 1 test + Task 4 test), no-deck-block fallback (Task 4 test), docs (Task 7) — all spec sections have a corresponding task.
- **Type consistency:** `DeckConfig` (Task 1) → consumed by `SlideDeckPreview` (Task 4) via `deckChunk.style`/`.footer`. `mergeSlideStyle(deckStyle: SlideStyle, slideStyle: SlideStyle | undefined): SlideStyle` (Task 2) → called inside `SlideCard` (Task 3) as `mergeSlideStyle(deckStyle, config.style)`, where `SlideCard`'s `deckStyle` prop is typed `SlideStyle` (Task 3) and supplied by `SlideDeckPreview`'s locally-computed `deckStyle: SlideStyle` (Task 4) — names and types match end to end.
- **No placeholders:** every step has complete code, exact commands, and expected outcomes.
