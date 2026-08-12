// MCP Studio's own domain types — connection config, auth, and discovery
// view-state. Raw MCP wire shapes (McpTool, McpPrompt, ...) live in
// `@/lib/mcp/types` and are re-used directly here; this file only adds the
// studio-specific wrapping around them.

import type {
  McpSession,
  InitializeResult,
  McpTool,
  McpPrompt,
  McpResource,
  McpResourceTemplate,
} from '@/lib/mcp/types'

export type Protocol = 'auto' | 'http' | 'sse'

export type AuthMode = 'none' | 'bearer'

export interface CustomHeaderRow {
  key: string
  value: string
}

export interface AuthConfig {
  mode: AuthMode
  /** Bearer token. Ignored when `mode !== 'bearer'`. */
  token: string
}

/** A saved server entry — persisted to localStorage (see store/mcpStudioStore.ts). */
export interface Connection {
  id: string
  label: string
  url: string
  protocol: Protocol
  auth: AuthConfig
  headers: CustomHeaderRow[]
}

export type DiscoveryStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'unsupported'

export interface DiscoveryState<T> {
  status: DiscoveryStatus
  items: T[]
  error?: string
}

export type CapabilityKind = 'tools' | 'prompts' | 'resources' | 'templates'

export type ConnectionStatus = 'connecting' | 'connected' | 'error' | 'disconnected'

/** Ephemeral, NOT persisted — live session + discovery state for one connection. */
export interface ConnectionRuntime {
  status: ConnectionStatus
  errorMsg?: string
  usedTransport?: 'http' | 'sse'
  session?: McpSession
  initResult?: InitializeResult
  tools: DiscoveryState<McpTool>
  prompts: DiscoveryState<McpPrompt>
  resources: DiscoveryState<McpResource>
  templates: DiscoveryState<McpResourceTemplate>
}

export type ConnectErrorKind = 'cors' | 'not-mcp' | 'timeout' | 'bad-url' | 'unknown'

/** Typed connect failure — `kind` drives which hint ConnectionForm shows. */
export class McpConnectError extends Error {
  kind: ConnectErrorKind
  constructor(kind: ConnectErrorKind, message: string) {
    super(message)
    this.name = 'McpConnectError'
    this.kind = kind
  }
}
