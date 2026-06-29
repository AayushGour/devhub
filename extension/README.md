# DevHub for VS Code

[![Open VSX](https://img.shields.io/open-vsx/v/dev-hub/devhub-toolkit?label=Open%20VSX&color=0066cc)](https://open-vsx.org/extension/dev-hub/devhub-toolkit)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/dev-hub/devhub-toolkit?color=0066cc)](https://open-vsx.org/extension/dev-hub/devhub-toolkit)

Live, theme-aware previews for the files you already edit — plus a couple of
standalone developer tools. Edit in VS Code's native editor; DevHub renders the
preview to the side. Powered by [DevHub](https://github.com/AayushGour/devhub).

Everything runs locally. No account, no telemetry; the token and crypto tools work
fully offline.

## Install

- **Cursor / Windsurf / VSCodium / Gitpod** (Open VSX): search **DevHub**, or open
  https://open-vsx.org/extension/dev-hub/devhub-toolkit
- **From a `.vsix`**: Extensions panel → `…` → *Install from VSIX…*

## Features

### Open Preview to Side

Run **DevHub: Open Preview to Side** (`Cmd/Ctrl+Shift+P`) or click the preview icon
in the editor title bar. The tool is picked automatically from the file:

| File | Preview |
|------|---------|
| `.md`, `.mdc` | Rendered Markdown, with inline Mermaid diagrams |
| `.mmd`, `.mermaid` | Rendered Mermaid diagram (theme picker, zoom/pan) |
| `.json`, `.jsonc` | Tree / graph / schema views |
| `.svg` | Rendered SVG with zoom & pan |
| `.html`, `.htm` | The page rendered in a sandboxed iframe |

The preview tracks edits live (debounced) and is locked to its source document.

### Themed by default

The Markdown preview defaults to **Match VS Code** — it adopts the editor's
background, foreground, link and code colours (and recolours embedded Mermaid
diagrams to match), so it looks right in light or dark themes. A dropdown lets you
switch to any of the built-in document themes (Classic, Editorial, Slate, Emerald…).
The Mermaid preview follows the editor's light/dark theme until you pick a theme.

### Token Count

**DevHub: Token Count (Side)** tokenizes the active editor with offline tiktoken
encoders — `cl100k_base` (GPT-3.5/4), `o200k_base` (GPT-4o), `p50k_base` (Codex) —
showing token counts and a per-token breakdown.

### Standalone tools

Open in their own panel (no file needed):

- **DevHub: Crypto Studio** — JWT decode/encode, hashing, Base64, AES, HMAC, secure
  token/password generation.
- **DevHub: Image Studio** — batch image conversion (PNG/JPEG/WebP/AVIF/GIF/BMP/ICO)
  with per-image quality controls and ZIP download.

## Commands

| Command | What it does |
|---------|--------------|
| `DevHub: Open Preview to Side` | Preview the active file (auto-detected type) |
| `DevHub: Token Count (Side)` | Tokenize the active editor |
| `DevHub: Crypto Studio` | Open the crypto tools panel |
| `DevHub: Image Studio` | Open the image tools panel |

## Notes

- **HTML preview** renders markup, CSS, assets and scripts inside a sandboxed
  iframe isolated from the editor.
- **YAML frontmatter** (the leading `--- … ---` block in `.md`/`.mdc`) is rendered
  as a property/value table.

## License

MIT
