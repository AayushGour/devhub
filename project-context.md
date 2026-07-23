# Project context — <project>

The single source of truth for WHAT + WHY. business-analyst seeds it; architect adds design; anyone appends decisions.

## Goal
<problem + why it matters>

## Users
<who uses this>

## User stories
- As <user>, I want <action>, so <benefit>.
  - AC: <testable>
  - AC: <testable>

## Business rules
<rules, edge cases>

## Constraints
<deadlines, tech limits, must-use / must-avoid>

## Assumptions / open questions
<flagged by business-analyst when the client didn't specify>

## Out of scope
<explicit non-goals>

---

## Architecture  (architect)
- Stack: <...>
- Modules: <module → responsibility>
- Data model: <entities, relationships>
- APIs: <endpoint → purpose → in/out>

## Decisions  (append-only; only if it constrains future work)
### D1 — <title>  (<date>, <agent>)
Why: <reason>. Alt: <rejected> because <...>. Impact: <what it locks>. Files: <paths>

### D2 — MCP Studio Round 1: shared transport lib + independent studio store  (2026-07-22, senior-dev)
Why: mcp-studio (debug/inspect bench) and agent-workspace (tool-calling) both need MCP
wire transport but must not share runtime state. Lifted agent-workspace's
`mcpClient.ts` into `web/src/lib/mcp/{client,types}.ts`, extended with per-session
custom headers (bearer + rows), raw-shape RPC methods (`listTools`/`callTool`/
`listPrompts`/`getPrompt`/`listResources`/`readResource`/`listResourceTemplates`
returning `McpTool`/`CallToolResult`/etc. from `types.ts`, NOT the LLM `ToolDefinition`
wrapper), and `initSession`/`initSessionSse` now return `{ session, initResult }` (full
MCP `initialize` result) instead of just a session.
Alt: keep two separate transport implementations — rejected, would duplicate the
SSE-waiter/rpc-id/initialize-validation correctness guards.
Impact: agent-workspace's `mcpStore.ts` now imports from `@/lib/mcp/client` and adapts
`McpTool → ToolDefinition` (and `useAgentTools.ts` adapts `CallToolResult → string`)
at its own call sites — agent-workspace *behavior* is unchanged, only its import
source. The old `agent-workspace/mcp/mcpClient.ts` is deleted (nothing else imported
it). mcp-studio's `store/mcpStudioStore.ts` (zustand+persist) is a brand-new,
independent store — only `connections[]` + `activeConnectionId` persist to
localStorage (`devhub-mcp-studio-connections`); per-connection `runtimes` (session,
initResult, discovered tools/prompts/resources/templates) is rebuilt live on every
connect/reconnect via `hooks/useMcpConnection.ts` and never persisted. `Connection`
shape is `{id, label, url, protocol, auth: {mode, token}, headers: CustomHeaderRow[]}`
— `headers` (custom rows) is a sibling of `auth`, not nested in it, per the design
spec's literal contract.
Round 1 delivered chrome (`index.tsx`, McpToolbar, ConnectionForm, ConnectionRail,
ServerOverview, CapabilityTabs) + fully-built shared `SchemaForm.tsx` (JSON-schema
and prompt-argument forms; field derivation lives in
`utils/schemaFormFields.ts`, unit-tested) + `ResultView.tsx`, plus **prop-less**
placeholder panels (ToolsPanel/PromptsPanel/ResourcesPanel/TemplatesPanel) that
Round 2 fills in by reading `useActiveConnection()`/`useActiveRuntime()` selectors
directly from the store — CapabilityTabs renders them with zero props so Round 2
never touches the call site.
Files: `web/src/lib/mcp/{client,types,client.test}.ts`,
`web/src/features/agent-workspace/mcp/mcpStore.ts`,
`web/src/features/agent-workspace/hooks/useAgentTools.ts`,
`web/src/features/mcp-studio/**`, `web/src/App.tsx`, `web/src/pages/HomePage.tsx`.
