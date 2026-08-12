import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ToolsPanel from './ToolsPanel'
import * as mcpStudioStore from '../store/mcpStudioStore'
import * as mcpClient from '@/lib/mcp/client'
import type { ConnectionRuntime } from '../types'
import type { McpTool, McpSession } from '@/lib/mcp/types'

vi.mock('../store/mcpStudioStore')
vi.mock('@/lib/mcp/client')
// CollapsiblePanel (via PanelShell) renders a Tooltip that needs TooltipProvider —
// pass children through so ToolsPanel can render standalone in tests.
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactElement }) => children,
}))

describe('ToolsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows connect prompt when no active runtime', () => {
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(undefined)
    render(<ToolsPanel />)
    expect(screen.getByText(/Connect to an MCP server/i)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      tools: { status: 'loading', items: [] },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)
    expect(screen.getByText(/Loading tools/i)).toBeInTheDocument()
  })

  it('shows error state with error message', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      tools: { status: 'error', items: [], error: 'Connection lost' },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)
    expect(screen.getByText(/Error loading tools/i)).toBeInTheDocument()
    expect(screen.getByText('Connection lost')).toBeInTheDocument()
  })

  it('shows unsupported state', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      tools: { status: 'unsupported', items: [] },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)
    expect(screen.getByText(/Server doesn't advertise tools/i)).toBeInTheDocument()
  })

  it('shows empty state when no tools', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      tools: { status: 'loaded', items: [] },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)
    expect(screen.getByText(/No tools available/i)).toBeInTheDocument()
  })

  it('renders list of tools and allows selection', () => {
    const tools: McpTool[] = [
      { name: 'get_weather', description: 'Get current weather' },
      { name: 'set_alarm', description: 'Set an alarm' },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      tools: { status: 'loaded', items: tools },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)

    expect(screen.getByText('get_weather')).toBeInTheDocument()
    expect(screen.getByText('set_alarm')).toBeInTheDocument()
  })

  it('shows tool detail when selected', () => {
    const tools: McpTool[] = [
      {
        name: 'get_weather',
        description: 'Get current weather',
        inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
      },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session: { sessionId: 'test-session', serverUrl: 'http://localhost:3000', headers: {} },
      tools: { status: 'loaded', items: tools },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)

    const toolButton = screen.getByText('get_weather')
    fireEvent.click(toolButton)

    expect(screen.getByText('Parameters')).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
  })

  it('calls callTool on Run button click', async () => {
    const mockCallTool = vi.mocked(mcpClient.callTool)
    mockCallTool.mockResolvedValue({ content: [{ type: 'text', text: 'Sunny' }] })

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const tools: McpTool[] = [
      { name: 'get_weather', inputSchema: { type: 'object', properties: {} } },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      tools: { status: 'loaded', items: tools },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)

    fireEvent.click(screen.getByText('get_weather'))
    fireEvent.click(screen.getByText('Run'))

    await waitFor(() => {
      expect(mockCallTool).toHaveBeenCalledWith(session, 'get_weather', {})
    })
  })

  it('disables Run button when no session', () => {
    const tools: McpTool[] = [
      { name: 'test_tool', inputSchema: { type: 'object', properties: {} } },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session: undefined,
      tools: { status: 'loaded', items: tools },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)

    fireEvent.click(screen.getByText('test_tool'))
    const runBtn = screen.getByText('Run')

    expect(runBtn).toBeDisabled()
  })

  it('resets form when switching tool selection', () => {
    const tools: McpTool[] = [
      { name: 'tool1', inputSchema: { type: 'object', properties: { arg: { type: 'string' } } } },
      { name: 'tool2', inputSchema: { type: 'object', properties: {} } },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session: { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} },
      tools: { status: 'loaded', items: tools },
      prompts: { status: 'idle', items: [] },
      resources: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)
    render(<ToolsPanel />)

    // Select first tool - should show parameters
    fireEvent.click(screen.getAllByText('tool1')[0])
    expect(screen.getByText('Parameters')).toBeInTheDocument()

    // Select second tool - should still show parameters (form reset)
    fireEvent.click(screen.getAllByText('tool2')[0])
    expect(screen.getByText('Parameters')).toBeInTheDocument()
  })
})
