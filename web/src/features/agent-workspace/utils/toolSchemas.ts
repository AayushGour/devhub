import type { ToolDefinition } from '@/lib/llm/engine'

export const FETCH_URL_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'fetch_url',
    description: 'Fetch the text content of a URL using Jina Reader. Returns up to 8000 characters of clean readable text.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
      },
      required: ['url'],
    },
  },
}

export const WEB_SEARCH_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web. Returns top results from Wikipedia and HackerNews.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
}

export const RUN_JAVASCRIPT_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_javascript',
    description: 'Execute JavaScript code in a sandboxed environment. Returns the result and any console.log output.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['code'],
    },
  },
}

export const RUN_PYTHON_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python',
    description: 'Execute Python code using Pyodide (in-browser). Returns the result and stdout. Loads ~8MB on first use.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' },
      },
      required: ['code'],
    },
  },
}

export const FILE_SYSTEM_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'file_system',
    description: 'Read, write, or list files on the local filesystem using the File System Access API (Chrome/Edge only). User will be prompted once to select a directory.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['read_file', 'write_file', 'list_directory'], description: 'Operation to perform' },
        path: { type: 'string', description: 'File or directory path relative to the chosen root' },
        content: { type: 'string', description: 'Content to write (only for write_file)' },
      },
      required: ['operation', 'path'],
    },
  },
}

export const MEMORY_SCHEMA: ToolDefinition = {
  type: 'function',
  function: {
    name: 'memory',
    description: 'Persist key-value data across agent runs using IndexedDB. Use remember to store, recall to retrieve, list_keys to see all stored keys.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['remember', 'recall', 'list_keys'], description: 'Operation to perform' },
        key: { type: 'string', description: 'Key to store or retrieve (not needed for list_keys)' },
        value: { type: 'string', description: 'Value to store (only for remember)' },
      },
      required: ['operation'],
    },
  },
}
