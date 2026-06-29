export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'gif' | 'bmp' | 'ico'

export interface FormatInfo {
  mime: string
  ext: string
  label: string
  qualityCapable: boolean
}

export const OUTPUT_FORMATS: Record<OutputFormat, FormatInfo> = {
  png:  { mime: 'image/png',      ext: 'png',  label: 'PNG',  qualityCapable: false },
  jpeg: { mime: 'image/jpeg',     ext: 'jpg',  label: 'JPEG', qualityCapable: true  },
  webp: { mime: 'image/webp',     ext: 'webp', label: 'WEBP', qualityCapable: true  },
  avif: { mime: 'image/avif',     ext: 'avif', label: 'AVIF', qualityCapable: true  },
  gif:  { mime: 'image/gif',      ext: 'gif',  label: 'GIF',  qualityCapable: false },
  bmp:  { mime: 'image/bmp',      ext: 'bmp',  label: 'BMP',  qualityCapable: false },
  ico:  { mime: 'image/x-icon',   ext: 'ico',  label: 'ICO',  qualityCapable: false },
}

export const OUTPUT_FORMAT_LIST = Object.keys(OUTPUT_FORMATS) as OutputFormat[]

export const ACCEPTED_MIMES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'image/bmp', 'image/svg+xml', 'image/x-icon', 'image/avif',
  'image/tiff',
]

export const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.ico,.avif,.tiff,.tif'
