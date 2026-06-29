declare module 'potrace-js/src/index.js' {
  export interface TraceOptions {
    turnpolicy?: 'black' | 'white' | 'left' | 'right' | 'minority' | 'majority'
    turdsize?: number
    optcurve?: boolean
    alphamax?: number
    opttolerance?: number
  }

  export class Bitmap {
    constructor(width: number, height: number)
    width: number
    height: number
    size: number
    data: Int8Array
  }

  interface CurvePoint {
    x: number
    y: number
  }
  interface Curve {
    n: number
    tag: string[]
    c: CurvePoint[]
  }
  export interface TracedPath {
    curve: Curve
  }

  export function traceBitmap(bitmap: Bitmap, options?: TraceOptions): TracedPath[]
}
