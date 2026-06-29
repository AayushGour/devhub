declare module 'utif' {
  interface IFD {
    width: number
    height: number
    data?: Uint8Array
    [key: string]: unknown
  }

  export function decode(buffer: ArrayBuffer): IFD[]
  export function decodeImage(buffer: ArrayBuffer, ifd: IFD, ifds?: IFD[]): void
  export function toRGBA8(ifd: IFD): Uint8Array
}
