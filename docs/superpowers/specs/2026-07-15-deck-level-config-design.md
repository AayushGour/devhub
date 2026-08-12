# Deck-Level Config (`type: deck`) + Page-Number Rework

## Goal

Add a **document-level config block** so a deck can set styling and footer defaults once for the whole deck, and make **page numbers** opt-in instead of always-on. Both use the *same* yaml-fence + `style`/`footer` schemas the slides already use, so deck-level and slide-level config are consistent: deck = defaults, slide = per-field overrides.

This intentionally revisits the original spec's "no deck-level frontmatter" decision (`2026-07-14-slide-deck-export-design.md`). That decision was really "no `---`-delimited frontmatter" because frontmatter's closing `---` collides with the slide separator. A `type: deck` **yaml-fence block** has no such collision — it is the same mechanism as every slide, so the "one convention" goal is preserved.

## Non-goals

- No `theme` keyword on the deck block (deck-level `style` covers colors/fonts; avoids re-coupling deck appearance to the app UI theme).
- No `---`-frontmatter parsing (the separator-collision reason still stands).
- No deck-level title/subtitle/author/date — those stay on the `title` slide (unchanged).
- No new style categories/properties — reuse the existing `background`/`title`/`body` schema and its guardrails verbatim.

## The `type: deck` block

A yaml-fence block, conventionally the first chunk of the document, marked `type: deck`. It is **configuration, not a rendered slide** — it is lifted out of the deck and never produces a `.slide-page`.

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

Recognized fields (all optional):
- `style` — deck-wide default `background`/`title`/`body`, validated by the existing `validateSlideStyle` (same 3-level schema + guardrails; unknown keys ignored).
- `footer` — deck-wide default footer, validated by the existing `validateSlideFooter` (same flat 2-level schema incl. `show`, `left`, `center`, `right`, `pageNumber`).

Anything else (a `title`, body markdown, etc.) on a `type: deck` block is ignored. If **multiple** `type: deck` blocks exist, the **first** is used and the rest are ignored (they are also not rendered as slides). A deck with **no** `type: deck` block behaves exactly as today except for the new page-number default (see below).

## Merge semantics (the consistency mechanism)

For every rendered slide, its config field-merges **over** the deck defaults — the same model per-slide footer already uses:

- **footer:** `mergeFooter(deckFooter, slideFooter)` per field (existing function; slide field wins when present, else deck value). The deck footer itself is `mergeFooter(DEFAULT_DECK_FOOTER, deckBlock.footer)`.
- **style:** new `mergeSlideStyle(deckStyle, slideStyle)` — a shallow per-`category` then per-`property` merge. A slide overriding `style.title.color` keeps the deck's `style.background.color` and `style.body.*`. Result is a normal `SlideStyle`, fed to the existing `slideStyleToReactStyle`.

So the resolution order for any slide is: built-in default → deck block → slide. Identical shapes at each level.

## Page numbers

**Remove the always-on corner page-number badge** (`SlideCard`'s standalone `<span>{pageNumber}</span>`). Page numbers become a footer feature only:

- A page number renders **only when the resolved `footer.pageNumber` is true**, in the footer (right side).
- **Default is off:** `DEFAULT_DECK_FOOTER.pageNumber` changes from `true` → `false`.
- Turn on for the whole deck via `type: deck` → `footer.pageNumber: true`; a slide can override either way via its own `footer.pageNumber`.
- Rendering: the resolved footer's right region shows `footer.right` text and, when `pageNumber` is true, the page number. When both are present they render together (e.g. `right-text   3`); when only `pageNumber`, just the number. `pageNumber` is independent of `footer.show` only in that `show: false` hides the whole footer (and thus the number) for that slide.

Preview and export use the identical resolved footer (export already reads the rendered DOM), so they match.

## Architecture / data flow

```
raw markdown
  → splitSlides(raw): SlideChunk[]
  → chunks.map(extractSlideConfig)                     (unchanged per-chunk parse)
  → partition: deckConfig = first chunk whose parsed type is 'deck'
               slides     = the rest
  → deckStyle  = deckConfig?.style ?? {}
    deckFooter = mergeFooter(DEFAULT_DECK_FOOTER, deckConfig?.footer)
  → per slide: SlideCard receives
       style  = mergeSlideStyle(deckStyle, slide.style)
       footer = mergeFooter(deckFooter, slide.footer)
```

- **`slideParser.ts`**: recognize `type: deck`. `deck` is NOT added to `SlideType`/`SLIDE_LAYOUTS` (it has no layout). Instead `extractSlideConfig` tags a deck block distinctly — either a dedicated `extractDeckConfig` path or an `isDeck` flag on the returned object — so the partition step can pull it out without polluting the rendered-type union. (Decision for the plan: a small `parseChunkKind` that returns `{ kind: 'deck', config }` or `{ kind: 'slide', config }`, keeping `SLIDE_LAYOUTS` exhaustive over the 5 render types only.)
- **`slideStyle.ts`**: add `mergeSlideStyle(deck, slide)`; change `DEFAULT_DECK_FOOTER.pageNumber` to `false`.
- **`SlideDeckPreview.tsx`**: do the partition + merge, pass resolved `style`/`footer` (not raw) down to each `SlideCard`.
- **`SlideCard.tsx`**: remove the corner badge; render the page number inside the footer when resolved `footer.pageNumber` is true; consume the already-resolved `style`/`footer` (merge moves up to `SlideDeckPreview`, so `SlideCard` no longer calls `mergeFooter` itself).
- **`index.tsx`**: for deck mode, deck-level config is now document-driven (`type: deck`), so the current `deckFooter`-from-`defaultExportConfig` thread is no longer the deck source. Keep passing a minimal built-in default only as the base `DEFAULT_DECK_FOOTER` already provides; the `ExportConfig` footer fields remain for continuous mode. (The export modal's footer controls apply to continuous export; deck footer comes from the `type: deck` block. This will be noted in the modal/docs but no modal UI change is in scope here.)
- **`slideExport.ts`**: unchanged — it reads the already-resolved rendered DOM. Verify the removed badge / new footer page number serialize correctly (the badge strip selector may become unnecessary but stays harmless).

## Error handling

- No `type: deck` block → `deckStyle = {}`, `deckFooter = DEFAULT_DECK_FOOTER` (page numbers off).
- `type: deck` with malformed/partial `style`/`footer` → same per-key guardrail dropping as slides (validate* functions); unknown keys ignored.
- Multiple `type: deck` blocks → first used, rest ignored and not rendered.
- `type: deck` with body/other fields → ignored, never rendered as a slide.
- A slide overriding one style property → other deck properties still apply (field-level merge).

## Testing

- `mergeSlideStyle`: per-category/per-property override, missing categories, empty deck, empty slide, slide-wins.
- Partition: a `type: deck` block is removed from the rendered slide list; the first is used when several exist; a deck with no block renders all chunks.
- Page numbers: default off (no footer number when nothing enables it); deck `footer.pageNumber: true` turns it on for all slides; a slide `footer.pageNumber: false` overrides back off; `footer.show: false` hides number+footer.
- Deck `style` applies to a slide with no `style`; a slide's `style` overrides the matching deck property only.
- Regression: existing single-slide/no-deck decks still render; export still matches preview; `DEFAULT_DECK_FOOTER` change doesn't break footer merge tests (update expectations for the new page-number default).

## Docs / skill deliverable

- `SKILL.md`: new "Deck-Level Config (`type: deck`)" section — the block, its `style`/`footer` fields, the field-level merge (deck = default, slide = override), and the page-number model (off by default, deck/slide `footer.pageNumber`). Update the worked example to open with a `type: deck` block. Update the checklist.
- `template.md`: prepend a `type: deck` block exercising deck-wide `style` + `footer`.
- In-app `SlideDeckGuide.tsx`: add the `type: deck` block to the Overview/Fields tab and the Example; update the page-number description.
