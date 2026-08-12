// Raw MCP (Model Context Protocol) wire types — the JSON-RPC/MCP-spec shapes
// returned by `initialize`, `tools/list`, `tools/call`, `prompts/list`,
// `prompts/get`, `resources/list`, `resources/read`, `resources/templates/list`.
//
// These are intentionally NOT the LLM-facing `ToolDefinition` wrapper used by
// agent-workspace (see `@/lib/llm/engine`) — mcp-studio inspects and invokes
// these raw shapes directly. agent-workspace adapts `McpTool` → `ToolDefinition`
// at its own call site (mcpStore.ts) so this module stays agnostic of either
// consumer.

export interface McpSession {
  sessionId: string
  serverUrl: string
  /** Per-connection auth/custom headers, merged into every HTTP-transport request. */
  headers: Record<string, string>
}

/** A JSON Schema object (tool `inputSchema`). Deliberately untyped beyond this — SchemaForm interprets it. */
export type JsonSchema = Record<string, unknown>

export interface McpTool {
  name: string
  description?: string
  inputSchema?: JsonSchema
}

export interface McpPromptArgument {
  name: string
  description?: string
  required?: boolean
}

export interface McpPrompt {
  name: string
  description?: string
  arguments?: McpPromptArgument[]
}

export interface McpResource {
  uri: string
  name?: string
  description?: string
  mimeType?: string
}

export interface McpResourceTemplate {
  uriTemplate: string
  name?: string
  description?: string
  mimeType?: string
}

export interface McpServerInfo {
  name: string
  version: string
}

/** Each key present (even as `{}`) means the server advertises that primitive. */
export interface McpCapabilities {
  tools?: Record<string, unknown>
  prompts?: Record<string, unknown>
  resources?: Record<string, unknown>
  logging?: Record<string, unknown>
  [key: string]: unknown
}

export interface InitializeResult {
  protocolVersion: string
  serverInfo?: McpServerInfo
  capabilities?: McpCapabilities
  instructions?: string
}

export interface McpContentBlock {
  type: string
  text?: string
  data?: string
  mimeType?: string
  [key: string]: unknown
}

export interface CallToolResult {
  content: McpContentBlock[]
  isError?: boolean
  [key: string]: unknown
}

export interface McpPromptMessage {
  role: string
  content: McpContentBlock | McpContentBlock[]
}

export interface GetPromptResult {
  description?: string
  messages: McpPromptMessage[]
}

export interface McpResourceContents {
  uri: string
  mimeType?: string
  text?: string
  blob?: string
}

export interface ReadResourceResult {
  contents: McpResourceContents[]
}
