// Thin typed accessor for the VSCode webview API. `acquireVsCodeApi` may only be
// called once per webview, so the handle is cached.
interface VsCodeApi {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

let api: VsCodeApi | undefined

export function getVsCodeApi(): VsCodeApi {
  if (!api) api = acquireVsCodeApi()
  return api
}
