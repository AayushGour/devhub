import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as defaultRender, screen, fireEvent, waitFor } from '@testing-library/react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import ResourcesPanel from './ResourcesPanel'
import * as mcpStudioStore from '../store/mcpStudioStore'
import * as mcpClient from '@/lib/mcp/client'
import type { ConnectionRuntime } from '../types'
import type { McpResource, McpSession, ReadResourceResult } from '@/lib/mcp/types'

vi.mock('../store/mcpStudioStore')
vi.mock('@/lib/mcp/client')

const renderWithTooltip = (component: React.ReactElement) =>
  defaultRender(<TooltipPrimitive.Provider>{component}</TooltipPrimitive.Provider>)

describe('ResourcesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "no active runtime" when runtime is undefined', () => {
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(undefined)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText('No active runtime.')).toBeInTheDocument()
  })

  it('renders loading state', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'loading', items: [] },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText(/Loading resources/)).toBeInTheDocument()
  })

  it('renders error state with error message', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'error', items: [], error: 'Network error' },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText(/Error loading resources/)).toBeInTheDocument()
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('renders unsupported state', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'unsupported', items: [] },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText(/doesn't advertise resources/)).toBeInTheDocument()
  })

  it('renders empty state when no resources', () => {
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'loaded', items: [] },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText(/No resources available/)).toBeInTheDocument()
  })

  it('renders resource list', () => {
    const resources: McpResource[] = [
      { uri: 'file:///docs/readme.md', name: 'README', mimeType: 'text/markdown' },
      { uri: 'file:///image.png', name: 'Image', mimeType: 'image/png', description: 'A test image' },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    expect(screen.getByText('README')).toBeInTheDocument()
    expect(screen.getByText('Image')).toBeInTheDocument()
    expect(screen.getByText('text/markdown')).toBeInTheDocument()
    expect(screen.getByText('image/png')).toBeInTheDocument()
  })

  it('selects a resource when clicked', () => {
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    // URI should appear in the detail section with the font-mono class
    const allUris = screen.getAllByText('file:///test.txt')
    expect(allUris.length).toBeGreaterThan(0)
    expect(allUris.some((el) => el.className.includes('font-mono'))).toBe(true)
  })

  it('disables Read button when no session', () => {
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session: undefined,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    expect(readButton).toBeDisabled()
  })

  it('calls readResource when Read button is clicked', async () => {
    const mockReadResource = vi.mocked(mcpClient.readResource)
    mockReadResource.mockResolvedValue({ contents: [{ uri: 'file:///test.txt', text: 'Hello World' }] })

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    fireEvent.click(readButton)

    await waitFor(() => {
      expect(mockReadResource).toHaveBeenCalledWith(session, 'file:///test.txt')
    })
  })

  it('displays text content after successful read', async () => {
    const mockReadResource = vi.mocked(mcpClient.readResource)
    mockReadResource.mockResolvedValue({ contents: [{ uri: 'file:///test.txt', text: 'File contents here' }] })

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    fireEvent.click(readButton)

    // Wait for the async readResource to complete and result to be rendered
    await waitFor(
      () => {
        expect(mockReadResource).toHaveBeenCalled()
      },
      { timeout: 5000 }
    )

    // Now check that the content is displayed (it will be in a pre tag from ResultView)
    const container = screen.getByText(/File contents here/, { exact: false })
    expect(container).toBeInTheDocument()
  })

  it('shows loading state while reading', async () => {
    const mockReadResource = vi.mocked(mcpClient.readResource)
    let resolveFn: ((value: ReadResourceResult) => void) | undefined
    mockReadResource.mockReturnValueOnce(new Promise<ReadResourceResult>((resolve) => { resolveFn = resolve }))

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    fireEvent.click(readButton)

    await waitFor(() => {
      expect(screen.getByText('Reading…')).toBeInTheDocument()
    })

    // Resolve the promise to complete loading
    if (resolveFn) {
      resolveFn({ contents: [{ uri: 'file:///test.txt', text: 'Done' }] })
    }

    await waitFor(() => {
      expect(screen.queryByText('Reading…')).not.toBeInTheDocument()
    })
  })

  it('displays error when read fails', async () => {
    const mockReadResource = vi.mocked(mcpClient.readResource)
    mockReadResource.mockRejectedValueOnce(new Error('Read failed'))

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const resources: McpResource[] = [{ uri: 'file:///test.txt', name: 'Test' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const testButton = screen.getByText('Test')
    fireEvent.click(testButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    fireEvent.click(readButton)

    await waitFor(() => {
      expect(screen.getByText(/Read failed/)).toBeInTheDocument()
    })
  })

  it('displays blob content with size info', async () => {
    const mockReadResource = vi.mocked(mcpClient.readResource)
    mockReadResource.mockResolvedValue({
      contents: [{ uri: 'file:///image.png', mimeType: 'image/png', blob: 'base64encodeddata' }],
    })

    const session: McpSession = { sessionId: 'test', serverUrl: 'http://localhost:3000', headers: {} }
    const resources: McpResource[] = [{ uri: 'file:///image.png', name: 'Image' }]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      session,
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const imageButton = screen.getByText('Image')
    fireEvent.click(imageButton)

    const readButton = screen.getByRole('button', { name: /Read/ })
    fireEvent.click(readButton)

    await waitFor(() => {
      expect(screen.getByText(/Binary content/)).toBeInTheDocument()
      expect(screen.getByText(/image\/png/)).toBeInTheDocument()
    })
  })

  it('renders resource description when available', () => {
    const resources: McpResource[] = [
      { uri: 'file:///readme.md', name: 'README', description: 'Project documentation' },
    ]
    const runtime: ConnectionRuntime = {
      status: 'connected',
      resources: { status: 'loaded', items: resources },
      tools: { status: 'idle', items: [] },
      prompts: { status: 'idle', items: [] },
      templates: { status: 'idle', items: [] },
      session: undefined,
    }
    vi.mocked(mcpStudioStore.useActiveRuntime).mockReturnValue(runtime)

    renderWithTooltip(<ResourcesPanel />)
    const readmeButton = screen.getByText('README')
    fireEvent.click(readmeButton)

    expect(screen.getByText('Project documentation')).toBeInTheDocument()
  })
})
