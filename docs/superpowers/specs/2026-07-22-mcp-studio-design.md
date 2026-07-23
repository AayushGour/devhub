# MCP Studio — Design Spec

Date: 2026-07-22
Status: Approved, building

## Goal

New DevHub studio. User pastes an MCP server URL, selects protocol, connects, and
**inspects everything the server exposes** — tools, prompts, resources, resource
templates, plus server metadata — and can **manually invoke** them (fill arg form →
run → see raw JSON-RPC result). **No LLM. No API key.** This is a debug bench (like
the official MCP Inspector), not an agent chat. Agent-driven use already lives in
agent-workspace.

Note: MCP spec exposes `tools`, `prompts`, `resources`, `resource templates`, plus
`serverInfo` / `capabilities` / `instructions` / `protocolVersion` from `initialize`.
There is **no** standard `skills` or `plugins` primitive — those are Claude-app
concepts, not advertised by arbitrary MCP servers. "View everything" = the primitives
above.

## Decisions (locked)

1. **Inspect + manual invoke**, zero LLM.
2. **Persist recent servers** — url/protocol/auth/label to localStorage; sessions
   re-established live on reconnect.
3. **Protocol selector**: Auto (HTTP→SSE fallback, default) · Streamable HTTP ·
   HTTP+SSE (legacy). No stdio (impossible in browser).
4. **Auth**: optional bearer token + arbitrary custom header rows, sent on every
   request. Stored with the connection (plaintext localStorage — show a small warning).

## Hard browser constraints (must be handled, not worked around)

- **CORS**: remote server must send `Access-Control-Allow-Origin` for our origin or
  connect fails. #1 real-world failure → show a specific typed hint. Cannot fix
  client-side.
- **SSE + auth**: native `EventSource` **cannot set request headers**. So bearer token
  can't ride the SSE handshake as a header. Fallback: append as `?access_token=<token>`
  query param + show a warning banner. **Recommend Streamable HTTP for authed servers**
  (fetch → headers work). Custom headers likewise can't attach to native EventSource —
  same query-param caveat / recommend HTTP.

## Architecture

Two layers: a shared transport lib + the studio feature. State is **fully independent**
of agent-workspace; only wire code is shared.

### Shared transport lib — `src/lib/mcp/`

Lift `web/src/features/agent-workspace/mcp/mcpClient.ts` (today: HTTP + SSE transport,
tools only) into `src/lib/mcp/client.ts`, and **extend**:

- Per-session **custom headers** (auth bearer + custom rows). Streamable-HTTP path
  merges them into every fetch. SSE path: query-param fallback for token (see constraint).
- New RPC methods returning **raw MCP shapes** (NOT the LLM `ToolDefinition` wrapper):
  - `listTools(session) → McpTool[]`
  - `callTool(session, name, args) → CallToolResult` (return the full result object, not a flattened string)
  - `listPrompts(session) → McpPrompt[]`
  - `getPrompt(session, name, args) → GetPromptResult`
  - `listResources(session) → McpResource[]`
  - `readResource(session, uri) → ReadResourceResult`
  - `listResourceTemplates(session) → McpResourceTemplate[]`
- Keep `initSession`, `initSessionSse`, `sseUrlCandidates`, `closeSseSession`,
  `rpcCall` — extend signatures to thread headers through.
- `initSession`/`initSessionSse` must **return the full initialize result**
  (serverInfo, capabilities, instructions, protocolVersion), not just the session, so
  the studio can render server overview and capability-gate discovery.

`src/lib/mcp/types.ts` — raw JSON-RPC/MCP types: `McpTool` (name, description,
inputSchema), `McpPrompt` (name, description, arguments[]), `McpResource` (uri, name,
description, mimeType), `McpResourceTemplate` (uriTemplate, name, description, mimeType),
`InitializeResult` (protocolVersion, serverInfo{name,version}, capabilities, instructions),
`CallToolResult`, `GetPromptResult`, `ReadResourceResult`, `McpSession`.

**agent-workspace compat**: its `listTools` currently maps to `ToolDefinition`. After the
lift, keep agent-workspace compiling by giving it a thin adapter (`McpTool → ToolDefinition`,
~5 lines) that consumes the shared `listTools`. Do NOT break agent-workspace. Update its
imports from `./mcpClient` to `@/lib/mcp/client`. `mcpStore.ts` stays in agent-workspace.

### Studio feature — `src/features/mcp-studio/`

```
index.tsx                    studio-root: McpToolbar + connection rail + inspector area
store/mcpStudioStore.ts      zustand + persist. connections[] {id,label,url,protocol,auth,headers},
                             activeConnectionId, per-session runtime state (session, initResult,
                             tools/prompts/resources/templates, discovery status/errors).
                             INDEPENDENT of agent-workspace mcpStore.
hooks/useMcpConnection.ts    connect(url,protocol,auth,headers) / disconnect / reconnect(id);
                             capability-gated discovery; typed connect errors.
types.ts                     Connection, AuthConfig, Protocol, discovery view-state.
components/
  McpToolbar.tsx             active server name, protocol badge, disconnect button.
  ConnectionForm.tsx         URL, protocol dropdown, auth (none/bearer + token), custom header
                             rows (add/remove), Connect. Shows SSE+auth + localStorage warnings.
  ConnectionRail.tsx         recent servers (localStorage) → reconnect / remove. "+ New".
  ServerOverview.tsx         serverInfo (name/version), protocolVersion, capabilities badges,
                             instructions (if any).
  CapabilityTabs.tsx         Tools · Prompts · Resources · Templates, each with count; hide/
                             disable a tab the server didn't advertise.
  ToolsPanel.tsx             master-detail: list → detail (description + schema) → SchemaForm →
                             Run → ResultView. [ROUND 2]
  PromptsPanel.tsx           list → arguments form → Get → rendered messages. [ROUND 2]
  ResourcesPanel.tsx         list (uri/name/mime) → Read → contents (text/blob). [ROUND 2]
  TemplatesPanel.tsx         resource templates: uriTemplate + fill params → expand → Read. [ROUND 2]
  SchemaForm.tsx             JSON-Schema → input form. Shared by tools + prompts. string/number/
                             integer/boolean/enum/array/object; required markers; returns typed args.
  ResultView.tsx             JSON-RPC result render: pretty ⇄ raw toggle, copy, isError styling.
```

## Data flow

1. `ConnectionForm` → `useMcpConnection.connect(url, protocol, auth, headers)`.
2. Hook calls `initSession` / `initSessionSse` **with headers** → `{ session, initResult }`.
3. Store `initResult` → `ServerOverview`.
4. **Capability-gated discovery**: only call `*/list` for primitives present in
   `initResult.capabilities`. Store results; per-primitive status + error.
5. `CapabilityTabs` shows counts; panels render lists; select → detail + `SchemaForm`.
6. Run → `callTool`/`getPrompt`/`readResource` → `ResultView`.
7. On successful connect, connection meta → localStorage (persist middleware).

## Error handling

- Connect fail → typed hint: CORS ("server must allow this origin via CORS"),
  not-an-MCP-endpoint (existing initialize-shape guard), timeout, bad URL.
- SSE + auth/headers → query-param fallback for token + warning banner.
- Per-primitive discovery error → inline in that tab only; connection survives.
- Invoke error → JSON-RPC `error` or `isError:true` content rendered in `ResultView`,
  never a crash.

## Registration

- `web/src/App.tsx`: `<Route path="tools/mcp" element={<McpStudioPage />} />`, import from
  `@/features/mcp-studio`.
- `web/src/pages/HomePage.tsx` `studios[]`: card `{ id:'mcp', title:'MCP Studio',
  description:'Connect to any MCP server. Inspect tools, prompts, resources & templates,
  and invoke them by hand — no LLM.', icon:<Plug size={20}/>, status:'available',
  phase:'Phase 6', href:'/tools/mcp' }`. Import `Plug` from lucide-react.

## Coding standards (from CLAUDE.md — non-negotiable)

- Tailwind-first; **no** `style={{}}` except runtime-dynamic data values. No JS style
  mutation (use state variants). `cn()` for conditional classes. CSS-var→Tailwind map
  (bg-surface, text-on-surface, border-border, bg-accent, etc.).
- Studio root element **must** use class `studio-root`.
- Extract repeated class strings to a `const`. Semantic class names on layout elements.
- Run `npx tsc --noEmit` after every file change. No `@ts-ignore`/`as any` without a
  justifying comment.

## Reference files to read for patterns

- Studio page + layout: `web/src/features/diagram-studio/index.tsx`,
  `web/src/components/ui/CollapsiblePanel.tsx`, `web/src/features/diagram-studio/components/DiagramToolbar.tsx`.
- Store pattern: `web/src/features/agent-workspace/mcp/mcpStore.ts`.
- Existing transport: `web/src/features/agent-workspace/mcp/mcpClient.ts` (the thing we lift).
- MCP consumer UI already built: `web/src/features/agent-workspace/components/McpSetupPanel.tsx`,
  `ToolManager.tsx`.

## Testing / verification

- `npx tsc --noEmit` clean after every change.
- Unit (if a runner exists): `SchemaForm` control-per-type + arg serialization;
  capability-gating; `sseUrlCandidates`. Mock `fetch` for transport.
- Manual integration: connect to a public SSE server + a local streamable-HTTP server;
  verify list + one invoke per primitive.

## Build rounds

- **Round 1 (foundation, sequential)**: shared `src/lib/mcp/` (client + types),
  agent-workspace adapter fix, studio `types.ts` + `store` + `hooks/useMcpConnection.ts`,
  chrome (`index.tsx`, `McpToolbar`, `ConnectionForm`, `ConnectionRail`, `ServerOverview`,
  `CapabilityTabs`), shared `SchemaForm.tsx` + `ResultView.tsx`, registration
  (App.tsx + HomePage). Deliver a compiling, connectable studio with **placeholder**
  capability panels. tsc clean.
- **Round 2 (parallel, disjoint files)**: `ToolsPanel`, `PromptsPanel`, `ResourcesPanel`,
  `TemplatesPanel` — each against the frozen store/SchemaForm/ResultView interfaces.
```
