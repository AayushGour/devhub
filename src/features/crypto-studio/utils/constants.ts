export type CryptoMode = 'jwt' | 'hash' | 'base64' | 'cipher' | 'hmac' | 'token'

export const CRYPTO_MODES: { id: CryptoMode; label: string }[] = [
  { id: 'jwt', label: 'JWT' },
  { id: 'hash', label: 'Hash' },
  { id: 'base64', label: 'Base64' },
  { id: 'cipher', label: 'Cipher' },
  { id: 'hmac', label: 'HMAC' },
  { id: 'token', label: 'Token' },
]

export type HashAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'
export const HASH_ALGORITHMS: HashAlgorithm[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']

export type HmacAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512'
export const HMAC_ALGORITHMS: HmacAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512']

export type CipherAlgorithm = 'AES-128-GCM' | 'AES-256-GCM' | 'AES-256-CBC'
export const CIPHER_ALGORITHMS: CipherAlgorithm[] = ['AES-128-GCM', 'AES-256-GCM', 'AES-256-CBC']
export const CIPHER_KEY_BITS: Record<CipherAlgorithm, 128 | 256> = {
  'AES-128-GCM': 128,
  'AES-256-GCM': 256,
  'AES-256-CBC': 256,
}

export type TokenFormat = 'hex' | 'base64' | 'alphanumeric' | 'uuid'
export const TOKEN_FORMATS: { id: TokenFormat; label: string }[] = [
  { id: 'hex', label: 'Hex' },
  { id: 'base64', label: 'Base64' },
  { id: 'alphanumeric', label: 'Alphanumeric' },
  { id: 'uuid', label: 'UUID v4' },
]
export const TOKEN_BITS = [128, 256, 512] as const
export type TokenBits = (typeof TOKEN_BITS)[number]

export type JwtSubMode = 'decode' | 'encode'
export type JwtAlgorithm = 'HS256' | 'HS384' | 'HS512'
export const JWT_ALGORITHMS: JwtAlgorithm[] = ['HS256', 'HS384', 'HS512']

export type CipherMode = 'encrypt' | 'decrypt'
export type CipherInputFormat = 'hex' | 'base64'
