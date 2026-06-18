declare module 'gifenc' {
  type Palette = number[][]

  interface GIFEncoderInstance {
    writeFrame(
      indexedPixels: Uint8Array,
      width: number,
      height: number,
      options?: {
        transparent?: boolean
        transparentIndex?: number
        delay?: number
        palette?: Palette
        repeat?: number
        colorDepth?: number
        dispose?: number
        first?: boolean
      }
    ): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    reset(): void
    readonly buffer: ArrayBuffer
  }

  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: {
      format?: 'rgb565' | 'rgb444' | 'rgba4444'
      clearAlpha?: boolean
      clearAlphaColor?: number
      clearAlphaThreshold?: number
      oneBitAlpha?: boolean | number
      useSqrt?: boolean
    }
  ): Palette

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
  ): Uint8Array

  export default GIFEncoder
}
