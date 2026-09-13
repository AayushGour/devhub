// Test-only scaffolding. Imported by *.test.ts files, never by the app.
//
// jsdom's Blob implements `slice`, `size` and `type` and nothing else — no
// `arrayBuffer`, `text` or `stream`. Every browser that can run this app has
// had `Blob.arrayBuffer` for years, and reading a stored book depends on it, so
// the gap is jsdom's rather than the code's. FileReader, which jsdom does
// implement, fills it in.

export function installBlobArrayBuffer(): void {
  if (typeof Blob.prototype.arrayBuffer === 'function') return

  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('blob read failed'))
      reader.readAsArrayBuffer(this)
    })
  }
}
