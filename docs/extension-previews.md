# Extension Previews: Graphviz DOT and draw.io

How the VS Code extension (`extension/`) previews `.dot`/`.gv` and `.drawio`/`.dio`/`.drawio.xml` files. This is extension-only; it is not a web studio.

## File tree

```
extension/
├── package.json                 # `dot` language, `when` clauses, keywords, version 0.0.17
├── src/
│   ├── PreviewManager.ts        # Tool += 'dot' | 'drawio'; detection; commitNavigation CSP re-apply
│   └── html.ts                  # cspProfile(tool); per-profile CSP
└── webview/
    ├── PreviewHost.tsx          # case 'dot' / 'drawio'
    └── views/
        ├── DotView.tsx          # Graphviz via @viz-js/viz
        └── DrawioView.tsx       # draw.io viewer loader + XmlView fallback
test-fixtures/
├── sample.dot  sample.gv
└── sample.drawio  sample-compressed.drawio  sample.drawio.xml
```

`@viz-js/viz` is a devDependency; Vite inlines it (with its WASM) into a JS chunk under `media/assets/`.

## Detection order

`toolForDocument` (active editor) and `toolForPath` (links clicked in a preview) check in this order; first match wins:

1. Markdown, HTML, Mermaid, JSON, SVG, YAML (existing)
2. **draw.io**: name ends `.drawio`, `.dio`, or `.drawio.xml`
3. generic XML (`lang === 'xml'` or `.xml`)
4. TOML
5. **DOT**: `lang === 'dot'` or name ends `.dot`, `.gv`

draw.io must precede XML because `.drawio.xml` also ends in `.xml`. `.drawio.svg` still resolves to `svg` (SVG check runs earlier); `.drawio.png` has no preview. Labels: `Graphviz`, `draw.io`. Unsupported files show a message listing every supported type.

Keybinding and editor-title `when` clauses match `editorLangId == dot` or `resourceExtname` in `.dot .gv .drawio .dio`. `.drawio.xml` is not listed; the existing XML clause already covers it.

## CSP per tool

A webview's CSP is fixed per document, so `cspProfile(tool)` in `html.ts` picks one of three profiles:

| Profile | Tools | Notes |
|---------|-------|-------|
| `html` | `html` | Permissive; runs the user's page in a sandboxed iframe |
| `drawio` | `drawio` | Stricter than `strict`: no `https:` for style/font/connect (viewer is bundled); `https:` images only |
| `strict` | everything else, including `dot` | Nonce-based; `'wasm-unsafe-eval'` covers Viz's WASM |

The `drawio` profile does not use `'strict-dynamic'` and adds no `frame-src`. Style, image, font and connect sources already allow `https:`, `data:` and `blob:`.

**Navigation re-apply.** `commitNavigation` (preview follows a link to a different file) compares the CSP profile of the old tool (taken from the preview key prefix) and the new one. If they differ, it reassigns `panel.webview.html` with `getWebviewHtml(...)` for the new tool; the reload's `ready` message triggers a single `post()`. If they match, it just calls `post()`. Example: a Markdown preview linking to `diagram.drawio` reloads into the `drawio` profile.

## DOT

- `DotView` lazy-loads `@viz-js/viz` (cached `instance()` promise; reset on failure so it can retry).
- Engines come from `viz.engines`, default `dot`; fallback list `dot, neato, fdp, sfdp, circo, twopi, osage`. With viz 3.x the live list also contains `nop`, `nop1`, `nop2` and `patchwork`; the `nop*` engines are hidden because they warn "node has no position, as required by the -n flag" on ordinary graphs (`patchwork` is kept). The list is set once, when the viz instance first loads.
- A `layout=` graph attribute in the DOT source overrides the engine picker.
- Renders `format: 'svg'`; errors from `errors[].message` show in a red box. On failure the last good SVG stays visible below it. Empty text clears both.
- Display uses `SvgPreviewPanel`. The graph background is white in dark themes (not themed).
- Toolbar: Export SVG (`graph.svg`) and Export PDF via the host. No PNG.

## draw.io

Lifecycle in `DrawioView`:

1. A module-level cached promise sets `STYLE_PATH`/`SHAPES_PATH`/`STENCIL_PATH` to the bundled `media/vendor/drawio/*` copies, then appends `<script src=".../vendor/drawio/viewer-static.min.js">` once (served from `${cspSource}`). It resolves on `onload` if `window.GraphViewer` exists and rejects on `onerror` or after 10s. On failure the tag is removed and the cache cleared, so the next edit retries.
2. On every `text` or `colorTheme` change the effect clears the container, builds `<div class="mxgraph" data-mxgraph='{...}'>` and calls `GraphViewer.createViewerForElement`. Config: `highlight: '#0000ff'`, `nav: true`, `toolbar: 'pages zoom layers'`, `lightbox: false`, `resize: true`, `page`, `dark-mode`.
3. `dark-mode` is `'dark'` or `'light'`. (The viewer ignores `'true'`/`'false'`.) The pane also uses `bg-surface`.
4. Current page: before teardown the effect reads `viewer.currentPage` (an integer page index, undocumented) and passes it as `page` to the next render. This member is undocumented, so this may break if the viewer changes.
5. If the script fails, the pane shows "draw.io viewer failed to load — showing the raw XML instead" above the `XmlView` fallback. Render exceptions show in an error box.

The viewer is expected to handle compressed (deflate-raw + base64) and plain `<diagram>` content and a bare `<mxGraphModel>`; matrix rows 4, 6 and 7 verify this.

### Known limitations

- The viewer has no destroy API. Re-render relies on removing the DOM, and each instance registers a `prefers-color-scheme` listener that is never removed, so listeners accumulate over many edits.
- Every edit recreates the viewer (zoom/scroll reset; page is kept).
- The kept page index is not tied to a file identity (PreviewHost passes none), so it carries over when the preview navigates to a different `.drawio` file.
- If the official Draw.io Integration extension is installed, `.drawio` opens in its custom editor, so the DevHub keybinding will not fire until you run "Reopen Editor With... > Text Editor".
- Not yet verified in a real webview: rendering under the CSP, toolbar icons, dark look, page preservation (see matrix).

## Security note: bundled viewer

The draw.io viewer (`viewer-static.min.js` plus `styles/`, `shapes/`, `stencils/`, Apache-2.0, draw.io v32.4.1) is vendored at `extension/webview/public/vendor/drawio` and copied to `media/vendor/drawio` at build time (~7.6 MB). Nothing is fetched from diagrams.net at runtime, the version is pinned by the repo, and the draw.io CSP profile has no remote script/style/font/connect sources, so the viewer cannot make network calls. Remote `https:` images embedded in a diagram can still load (`img-src`). To update the viewer, re-download the script and re-copy the resource dirs from `jgraph/drawio` and bump the version in `vendor/drawio/README.txt`.

## Manual test matrix

Fixtures are in `test-fixtures/`. Build with `npm run build:ext`, press F5, open each file, and run **DevHub: Open Preview to Side**.

| # | Scenario | Expect |
|---|----------|--------|
| 1 | `sample.dot` | Three clusters, left-to-right; engine `dot` |
| 2 | `sample.dot` (no `layout=`), switch through every engine in the picker | Renders for each (or shows an error message); note any engine that hangs |
| 3 | Introduce a DOT syntax error, then fix it | Red error box with message; clears and re-renders after the fix |
| 4 | `sample.drawio` | Two pages (Architecture, Deploy flow); page tabs work |
| 5 | Switch to page 2, edit the file | Preview stays on page 2 |
| 6 | `sample-compressed.drawio` | Same style of diagram renders |
| 7 | `sample.drawio.xml` | draw.io viewer (not the XML tree view) |
| 8 | Toggle VS Code light/dark theme on a draw.io preview | Viewer re-renders in matching mode |
| 9 | Disconnect network, open `sample.drawio` | Renders normally (viewer is bundled) |
| 10 | Markdown file linking to `sample.drawio`, click link in preview | Preview switches to draw.io (CSP profile change reloads the webview) |
| 11 | Navigate back from draw.io to the Markdown file | Markdown renders again |
| 12 | Open `.dot` from a draw.io preview link, and vice versa | Renders in each |
| 13 | Check devtools console on a draw.io preview | No CSP violations for viewer assets |
| 14 | Export SVG and PDF from a DOT preview | Files produced |
| 15 | `Cmd/Ctrl+Shift+V` on `.dot`, `.gv`, `.drawio`, `.dio` | Opens preview |
