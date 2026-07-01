let _dirHandle: FileSystemDirectoryHandle | null = null

async function ensureHandle(): Promise<FileSystemDirectoryHandle> {
  if (_dirHandle) return _dirHandle
  if (!('showDirectoryPicker' in window)) {
    throw new Error('File System Access API not supported in this browser (Chrome/Edge only)')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  return _dirHandle!
}

async function getFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<FileSystemFileHandle> {
  const parts = path.replace(/^\//, '').split('/')
  let dir = root
  for (let i = 0; i < parts.length - 1; i++) {
    dir = await dir.getDirectoryHandle(parts[i], { create })
  }
  return dir.getFileHandle(parts[parts.length - 1], { create })
}

async function readFile(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const fh = await getFileHandle(root, path)
  const file = await fh.getFile()
  return file.text()
}

async function writeFile(root: FileSystemDirectoryHandle, path: string, content: string): Promise<string> {
  const fh = await getFileHandle(root, path, true)
  const writable = await fh.createWritable()
  await writable.write(content)
  await writable.close()
  return `Written ${content.length} bytes to "${path}".`
}

async function listDirectory(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  let dir = root
  if (path && path !== '/' && path !== '.') {
    const parts = path.replace(/^\//, '').split('/')
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part)
    }
  }
  const entries: string[] = []
  for await (const [name, handle] of dir) {
    entries.push(handle.kind === 'directory' ? `${name}/` : name)
  }
  return entries.sort().join('\n') || '(empty directory)'
}

export async function executeFileSystem(args: Record<string, unknown>): Promise<string> {
  const op = args.operation as string
  const path = (args.path as string) ?? ''
  const content = args.content as string | undefined

  let root: FileSystemDirectoryHandle
  try {
    root = await ensureHandle()
  } catch (err) {
    return `[ERROR] file_system: ${err instanceof Error ? err.message : String(err)}`
  }

  if (op === 'read_file') return readFile(root, path)
  if (op === 'write_file') {
    if (content === undefined) return '[ERROR] file_system: content is required for write_file'
    return writeFile(root, path, content)
  }
  if (op === 'list_directory') return listDirectory(root, path)
  return `[ERROR] file_system: unknown operation "${op}"`
}
