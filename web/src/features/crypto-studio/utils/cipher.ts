import type { CipherAlgorithm, CipherInputFormat } from './constants'
import { CIPHER_KEY_BITS } from './constants'

function bufToHex(buf: Uint8Array | ArrayBuffer): string {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '')
  const pairs = clean.match(/.{1,2}/g) ?? []
  return new Uint8Array(pairs.map(b => parseInt(b, 16)))
}

function bufToBase64(buf: Uint8Array | ArrayBuffer): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(Array.from(arr).map(b => String.fromCharCode(b)).join(''))
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function algoName(algorithm: CipherAlgorithm): 'AES-GCM' | 'AES-CBC' {
  return algorithm.includes('GCM') ? 'AES-GCM' : 'AES-CBC'
}

function ivLength(algorithm: CipherAlgorithm): number {
  return algorithm.includes('GCM') ? 12 : 16
}

async function deriveKey(password: string, algorithm: CipherAlgorithm): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('devhub-crypto-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: algoName(algorithm), length: CIPHER_KEY_BITS[algorithm] },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptText(
  plaintext: string,
  password: string,
  algorithm: CipherAlgorithm,
): Promise<{ hex: string; base64: string }> {
  const key = await deriveKey(password, algorithm)
  const iv = crypto.getRandomValues(new Uint8Array(ivLength(algorithm)))
  const encrypted = await crypto.subtle.encrypt(
    { name: algoName(algorithm), iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)
  return { hex: bufToHex(combined), base64: bufToBase64(combined) }
}

export async function decryptText(
  ciphertext: string,
  password: string,
  algorithm: CipherAlgorithm,
  inputFormat: CipherInputFormat,
): Promise<string> {
  const combined = inputFormat === 'hex' ? hexToBuf(ciphertext) : base64ToBuf(ciphertext)
  const ivLen = ivLength(algorithm)
  const iv = combined.slice(0, ivLen)
  const data = combined.slice(ivLen)
  const key = await deriveKey(password, algorithm)
  try {
    const decrypted = await crypto.subtle.decrypt({ name: algoName(algorithm), iv }, key, data)
    return new TextDecoder().decode(decrypted)
  } catch (e) {
    // DOMException from Web Crypto has empty .message in Chrome — rethrow with useful context
    if (e instanceof DOMException && e.name === 'OperationError') {
      throw new Error('Decryption failed — wrong password or corrupted ciphertext')
    }
    throw e
  }
}

export function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return bufToHex(bytes)
}
