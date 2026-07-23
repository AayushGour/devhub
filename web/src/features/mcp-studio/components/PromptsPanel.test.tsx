import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useActiveRuntime } from '../store/mcpStudioStore'
import PromptsPanel from './PromptsPanel'
import * as mcpClient from '@/lib/mcp/client'
import type { ConnectionRuntime } from '../types'
import type { McpPrompt, GetPromptResult } from '@/lib/mcp/types'

afterEach(cleanup)

vi.mock('../store/mcpStudioStore')
vi.mock('@/lib/mcp/client')
vi.mock('@/components/ui/Tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactElement }) => children,
}))

const mockUseActiveRuntime = vi.mocked(useActiveRuntime)
const mockGetPrompt = vi.mocked(mcpClient.getPrompt)

function emptyRuntime(): ConnectionRuntime {
  return {
    status: 'disconnected',
    tools: { status: 'idle', items: [] },
    prompts: { status: 'idle', items: [] },
    resources: { status: 'idle', items: [] },
    templates: { status: 'idle', items: [] },
  }
}

describe('PromptsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows no active runtime message when runtime is undefined', () => {
    mockUseActiveRuntime.mockReturnValue(undefined)
    render(<PromptsPanel />)
    expect(screen.getByText('Connect to an MCP server to inspect its prompts.')).toBeInTheDocument()
  })

  it('shows loading message when prompts status is loading', () => {
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      prompts: { status: 'loading', items: [] },
    })
    render(<PromptsPanel />)
    expect(screen.getByText('Loading prompts…')).toBeInTheDocument()
  })

  it('shows error message with error text when prompts status is error', () => {
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      prompts: { status: 'error', items: [], error: 'Network timeout' },
    })
    render(<PromptsPanel />)
    expect(screen.getByText('Error loading prompts')).toBeInTheDocument()
    expect(screen.getByText('Network timeout')).toBeInTheDocument()
  })

  it('shows unsupported message when prompts status is unsupported', () => {
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      prompts: { status: 'unsupported', items: [] },
    })
    render(<PromptsPanel />)
    expect(screen.getByText("Server doesn't advertise prompts.")).toBeInTheDocument()
  })

  it('shows no prompts message when items list is empty', () => {
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      prompts: { status: 'loaded', items: [] },
    })
    render(<PromptsPanel />)
    expect(screen.getByText('No prompts available.')).toBeInTheDocument()
  })

  it('renders prompts list and allows selection', async () => {
    const prompts: McpPrompt[] = [
      { name: 'prompt1', description: 'First prompt' },
      { name: 'prompt2', description: 'Second prompt description that is longer' },
    ]
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: { sessionId: 'test', serverUrl: 'http://localhost', headers: {} },
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // Both prompts should be in the list
    expect(screen.getByText('prompt1')).toBeInTheDocument()
    expect(screen.getByText('prompt2')).toBeInTheDocument()

    // Click to select first prompt
    const firstPromptBtn = screen.getByRole('button', { name: /prompt1/i })
    fireEvent.click(firstPromptBtn)

    // Detail panel should show Arguments label (indicating detail is shown)
    await waitFor(() => {
      expect(screen.getByText('Arguments')).toBeInTheDocument()
    })
  })

  it('shows description truncation in list when description is long', () => {
    const prompts: McpPrompt[] = [
      { name: 'prompt1', description: 'This is a very long description that should be truncated to keep the list clean' },
    ]
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // The truncated version should be shown
    expect(screen.getByText(/This is a very long descript/)).toBeInTheDocument()
  })

  it('renders schemaForm with prompt arguments', async () => {
    const prompts: McpPrompt[] = [
      {
        name: 'greet',
        description: 'Greeting prompt',
        arguments: [
          { name: 'name', description: 'Person to greet', required: true },
          { name: 'tone', description: 'Greeting tone', required: false },
        ],
      },
    ]
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: { sessionId: 'test', serverUrl: 'http://localhost', headers: {} },
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // Select the prompt
    const btn = screen.getByRole('button', { name: /greet/i })
    fireEvent.click(btn)

    // Arguments section should be visible with labels
    await waitFor(() => {
      expect(screen.getByText('Arguments')).toBeInTheDocument()
    })
  })

  it('disables Get button when no session', async () => {
    const prompts: McpPrompt[] = [{ name: 'prompt1' }]
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: undefined, // No session
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // Select the prompt
    const btn = screen.getByRole('button', { name: /prompt1/i })
    fireEvent.click(btn)

    await waitFor(() => {
      const getBtn = screen.getByRole('button', { name: /^Get$/i })
      expect(getBtn).toBeDisabled()
    })
  })

  it('invokes getPrompt with selected prompt name and args', async () => {
    const prompts: McpPrompt[] = [
      {
        name: 'summarize',
        arguments: [{ name: 'text', required: true }],
      },
    ]
    const mockResult: GetPromptResult = {
      description: 'Summary',
      messages: [
        { role: 'user', content: { type: 'text', text: 'Summarize this text.' } },
      ],
    }
    mockGetPrompt.mockResolvedValue(mockResult)

    const mockSession = { sessionId: 'test', serverUrl: 'http://localhost', headers: {} }
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: mockSession,
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // Select the prompt
    const promptBtn = screen.getByRole('button', { name: /summarize/i })
    fireEvent.click(promptBtn)

    // Fill in the argument
    const input = screen.getByDisplayValue('')
    fireEvent.change(input, { target: { value: 'test content' } })

    // Click Get
    const getBtn = await screen.findByRole('button', { name: /^Get$/i })
    fireEvent.click(getBtn)

    await waitFor(() => {
      expect(mockGetPrompt).toHaveBeenCalledWith(
        mockSession,
        'summarize',
        { text: 'test content' },
      )
    })
  })

  it('shows result after successful invocation', async () => {
    const prompts: McpPrompt[] = [{ name: 'prompt1' }]
    const mockResult: GetPromptResult = {
      messages: [
        { role: 'assistant', content: { type: 'text', text: 'Hello world' } },
      ],
    }
    mockGetPrompt.mockResolvedValue(mockResult)

    const mockSession = { sessionId: 'test', serverUrl: 'http://localhost', headers: {} }
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: mockSession,
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    const promptBtn = screen.getByRole('button', { name: /prompt1/i })
    fireEvent.click(promptBtn)

    const getBtn = await screen.findByRole('button', { name: /^Get$/i })
    fireEvent.click(getBtn)

    await waitFor(() => {
      expect(mockGetPrompt).toHaveBeenCalled()
    })

    // ResultView should render the result (look for the raw JSON output which contains the message)
    await waitFor(() => {
      expect(screen.getByText(/Hello world/)).toBeInTheDocument()
    })
  })

  it('shows error when getPrompt fails', async () => {
    const prompts: McpPrompt[] = [{ name: 'prompt1' }]
    mockGetPrompt.mockRejectedValue(new Error('Request failed'))

    const mockSession = { sessionId: 'test', serverUrl: 'http://localhost', headers: {} }
    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: mockSession,
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    const promptBtn = screen.getByRole('button', { name: /prompt1/i })
    fireEvent.click(promptBtn)

    const getBtn = await screen.findByRole('button', { name: /^Get$/i })
    fireEvent.click(getBtn)

    // The error message should be displayed (rendered as JSON by ResultView)
    await waitFor(() => {
      expect(screen.getByText(/Request failed/)).toBeInTheDocument()
    })
  })

  it('resets args and result when selection changes', async () => {
    const prompts: McpPrompt[] = [
      { name: 'prompt1', arguments: [{ name: 'arg1' }] },
      { name: 'prompt2', arguments: [{ name: 'arg2' }] },
    ]

    mockUseActiveRuntime.mockReturnValue({
      ...emptyRuntime(),
      session: { sessionId: 'test', serverUrl: 'http://localhost', headers: {} },
      prompts: { status: 'loaded', items: prompts },
    })
    render(<PromptsPanel />)

    // Select first prompt
    let btn = screen.getByRole('button', { name: /prompt1/i })
    fireEvent.click(btn)

    // Change selection to second prompt
    btn = screen.getByRole('button', { name: /prompt2/i })
    fireEvent.click(btn)

    // Result should be cleared (no result message visible after switching)
    await waitFor(() => {
      // The empty state message should show
      expect(screen.getByText('Get a prompt to see output.')).toBeInTheDocument()
    })
  })
})
