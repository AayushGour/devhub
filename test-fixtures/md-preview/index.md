# Markdown Traversal Test — Page 1

This is the first page. Use it to verify link traversal in the Markdown previewer.

## Links to test

- [→ Go to Page 2](page2.md) — relative file link, should navigate the preview panel
- [→ Go to Page 3 (subdir)](subdir/page3.md) — link into a subdirectory
- [↗ External link](https://github.com) — should open in the browser, not navigate the panel
- [Jump to section below](#section-anchor) — in-page anchor, should scroll without navigating

---

## Section Anchor

You scrolled here via the `#section-anchor` link above. ✓

---

## What to verify

| Test | Expected |
|------|----------|
| Click "Go to Page 2" | Preview switches to `page2.md` in same panel |
| Click "Go to Page 3" | Preview switches to `subdir/page3.md` |
| Click external link | System browser opens `github.com` |
| Click anchor link | Scrolls to "Section Anchor" heading |
