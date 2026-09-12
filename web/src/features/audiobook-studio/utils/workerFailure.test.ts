// Every worker the engine talks to must survive dying.
//
// Each request is a promise waiting on a message. A worker that crashes, or
// posts something that cannot be structured-cloned, never sends that message —
// so without an error handler the import or conversion hangs with nothing to
// show the user. This guards the wiring rather than the crash itself: the
// failure modes are not reproducible in jsdom, but a missing handler is.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(
  join(__dirname, 'conversionEngine.ts'),
  'utf8',
)

/** Worker factories in the engine, by the label passed to onWorkerFailure. */
const WORKERS = ['parsing', 'narration', 'audio encoding', 'packaging']

describe('worker failure handling', () => {
  it('wires failure handling for every worker the engine owns', () => {
    for (const label of WORKERS) {
      expect(
        source.includes(`onWorkerFailure(`) && source.includes(`'${label}'`),
        `no failure handling registered for the ${label} worker`,
      ).toBe(true)
    }
  })

  it('registers one handler per constructed worker', () => {
    const constructed = source.match(/new Worker\(new URL\(/g) ?? []
    const handled = source.match(/onWorkerFailure\(/g) ?? []
    // One definition plus one registration per worker.
    expect(handled.length - 1).toBe(constructed.length)
  })

  it('covers both silent-failure paths, not just onerror', () => {
    expect(source).toMatch(/worker\.onerror\s*=/)
    expect(source).toMatch(/worker\.onmessageerror\s*=/)
  })

  it('discards a dead worker so the next request does not reuse it', () => {
    // Reusing a crashed instance would hang every later request as well.
    for (const name of ['parseWorker', 'narrateWorker', 'encodeWorker', 'sealWorker']) {
      expect(source, `${name} is not cleared when it dies`).toContain(`${name} = null`)
    }
  })
})
