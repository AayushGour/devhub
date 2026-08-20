import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMarkdownEditor } from './useMarkdownEditor'

vi.mock('../utils/fileStore', () => ({
  getAllFiles: vi.fn(async () => []),
  getFile: vi.fn(async () => undefined),
  putFile: vi.fn(async () => {}),
  deleteFile: vi.fn(async () => {}),
}))

// Monaco keycode/keymod constants used by the hook's mount handler.
const CtrlCmd = 2048
const KeyV = 52

function fakeMonaco() {
  return { KeyMod: { CtrlCmd }, KeyCode: { KeyV } } as never
}

function fakeEditor(addCommand: (id: number, fn: () => void) => void) {
  return {
    getValue: () => '',
    setValue: () => {},
    getSelection: () => null,
    executeEdits: () => {},
    pushUndoStop: () => {},
    getDomNode: () => null,
    addCommand,
  } as never
}

describe('markdown editor paste', () => {
  // Monaco intentionally leaves Cmd/Ctrl+V unbound in the browser so the native
  // paste event reaches its hidden textarea (see monaco clipboard.js: "Do not
  // bind paste keybindings in the browser"). Registering our own Cmd+V command
  // makes Monaco preventDefault the keydown, which suppresses that native paste
  // event — Safari then has no working path at all, since it grants neither
  // navigator.clipboard.readText() from a keybinding handler nor
  // document.execCommand('paste').
  it('does not register a Cmd/Ctrl+V keybinding', () => {
    const addCommand = vi.fn()
    const { result } = renderHook(() => useMarkdownEditor())

    result.current.handleEditorMount(fakeEditor(addCommand), fakeMonaco())

    const boundKeys = addCommand.mock.calls.map(c => c[0])
    expect(boundKeys).not.toContain(CtrlCmd | KeyV)
  })
})
