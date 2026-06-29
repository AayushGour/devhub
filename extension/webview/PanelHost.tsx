import { lazy, Suspense, useEffect } from 'react'

// Lazy so the preview webview never pulls in these heavier interactive pages.
const CryptoStudioPage = lazy(() => import('@/features/crypto-studio'))
const ImageStudioPage = lazy(() => import('@/features/image-studio'))

/** Standalone interactive tool panel (Crypto / Image), mounted as-is. */
export default function PanelHost({ tool }: { tool: string }) {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'theme' && e.data.colorTheme) {
        document.documentElement.setAttribute('data-theme', e.data.colorTheme)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <Suspense fallback={<div className="p-4 text-sm text-on-surface-muted">Loading…</div>}>
      {tool === 'image' ? <ImageStudioPage /> : <CryptoStudioPage />}
    </Suspense>
  )
}
