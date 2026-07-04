# DevHub for VS Code

[![Open VSX](https://img.shields.io/open-vsx/v/dev-hub/devhub-toolkit?label=Open%20VSX&color=0066cc)](https://open-vsx.org/extension/dev-hub/devhub-toolkit)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/dev-hub/devhub-toolkit?color=0066cc)](https://open-vsx.org/extension/dev-hub/devhub-toolkit)

Live, theme-aware previews for the files you already edit — plus standalone developer tools. Edit in VS Code's native editor; DevHub renders the preview to the side. Powered by [DevHub](https://github.com/AayushGour/devhub).

Everything runs locally. No account, no telemetry; the token and crypto tools work fully offline.

## Install

- **Cursor / Windsurf / VSCodium / Gitpod** (Open VSX): search **DevHub**, or open https://open-vsx.org/extension/dev-hub/devhub-toolkit
- **From a `.vsix`**: Extensions panel → `…` → *Install from VSIX…*

## Features

### Open Preview to Side

Press **`Cmd/Ctrl+Shift+V`** (or run **DevHub: Open Preview to Side** from the Command Palette, or click the preview icon in the editor title bar). The tool is picked automatically from the file extension:

| File | Preview |
|------|---------|
| `.md`, `.mdc` | Rendered Markdown with inline Mermaid diagrams, YAML frontmatter table, and theme picker |
| `.mmd`, `.mermaid` | Rendered Mermaid diagram (theme picker, zoom/pan) |
| `.json`, `.jsonc`, `.jsonl`, `.ndjson` | Tree / Graph / Schema views; JSONL rendered as an array; Graph mode exports PNG/PDF/HTML |
| `.yaml`, `.yml` | Tree / Graph / Schema views (parsed as JSON-equivalent structure) |
| `.toml` | Tree / Graph / Schema views (parsed via smol-toml) |
| `.xml` | Tree / Graph / Schema views (parsed via browser DOMParser) |
| `.svg` | Rendered SVG with zoom & pan |
| `.html`, `.htm` | The page rendered in a sandboxed iframe with back/forward history navigation |

The preview tracks edits live (debounced) and is locked to its source document.

**Structured data views (JSON / YAML / TOML / XML):**
- **Graph** — hierarchical card graph of the document structure; zoom/pan; export to PNG, PDF, or HTML; tooltips on truncated keys and values
- **Tree** — collapsible tree with value-type colour coding; tooltips on truncated string values
- **Schema** — inferred JSON Schema for the document

### Themed by default

The Markdown preview defaults to **Match VS Code** — it adopts the editor's background, foreground, link and code colours (and recolours embedded Mermaid diagrams to match), so it looks right in any theme. A dropdown lets you switch to any built-in document theme (Classic, Editorial, Slate, Emerald, and more). The Mermaid preview follows the editor's light/dark theme until you pick a theme manually.

### Token Count

**DevHub: Token Count (Side)** tokenizes the active editor with offline tiktoken encoders — `cl100k_base` (GPT-3.5/4), `o200k_base` (GPT-4o), `p50k_base` (Codex) — showing token counts and a per-token breakdown. All tokenisation runs offline; no text leaves your machine.

### Standalone tools

Open in their own panel (no file needed):

- **DevHub: Crypto Studio** — JWT decode/encode (with signature validation), hashing (MD5/SHA-1/SHA-256/SHA-384/SHA-512), Base64 (including file-to-Base64 drag-drop), AES cipher (128/256-GCM, 256-CBC), HMAC (SHA-256/384/512), and cryptographically secure token/password generation (Hex · Base64 · Alphanumeric · UUID v4 at 128/256/512 bits).
- **DevHub: Image Studio** — batch image conversion (PNG/JPEG/WebP/AVIF/GIF/BMP/ICO) with per-image format and quality overrides, before/after preview, compression savings indicator, aspect ratio lock, and ZIP download.

## Commands

| Command | Shortcut | What it does |
|---------|----------|--------------|
| `DevHub: Open Preview to Side` | `Cmd/Ctrl+Shift+V` | Preview the active file (type auto-detected) |
| `DevHub: Token Count (Side)` | — | Tokenize the active editor |
| `DevHub: Crypto Studio` | — | Open the crypto tools panel |
| `DevHub: Image Studio` | — | Open the image tools panel |

`Cmd/Ctrl+Shift+V` is active for: `.md`, `.mdc`, `.mmd`, `.mermaid`, `.json`, `.jsonc`, `.jsonl`, `.ndjson`, `.yaml`, `.yml`, `.xml`, `.toml`, `.svg`, `.html`, `.htm`. It overrides VS Code's built-in Markdown preview for those file types.

## Notes

- **HTML preview** renders markup, CSS, assets and scripts inside a sandboxed iframe isolated from the extension host. Back/forward navigation is available via the context menu.
- **YAML frontmatter** (the leading `--- … ---` block in `.md`/`.mdc`) is rendered as a property/value table above the document body.
- **JSONL / NDJSON** files are wrapped into a JSON array before rendering so all three views work correctly; unparseable lines are preserved as `{ _unparsed: "…" }`.
- **XML attributes** are represented as `@attr` keys in the tree/graph/schema views; text content nodes appear as `#text`.

## Development

Part of the [DevHub](https://github.com/AayushGour/devhub) npm-workspaces monorepo; the extension reuses the web app's preview components. From the repo root:

```bash
npm install
npm run build:ext     # webview -> extension/media, host -> extension/dist
```

Press **F5** ("Run DevHub Extension") to launch an Extension Development Host.

Publish:

```bash
OVSX_PAT=<token> npm run publish:openvsx   # Open VSX
VSCE_PAT=<token> npm run publish:vsce       # VS Code Marketplace
```

## License

MIT
