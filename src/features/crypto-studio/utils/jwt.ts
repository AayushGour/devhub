import { SignJWT } from 'jose'
import type { JwtAlgorithm } from './constants'

export interface JwtDecoded {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  isExpired: boolean
  hasExp: boolean
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(pad))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function decodeToken(token: string): JwtDecoded {
  const parts = token.trim().split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT — expected 3 dot-separated parts')
  const header = JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>
  const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>
  const exp = payload.exp as number | undefined
  return {
    header,
    payload,
    signature: parts[2],
    hasExp: exp !== undefined,
    isExpired: exp !== undefined && exp < Math.floor(Date.now() / 1000),
  }
}

export async function encodeToken(
  payloadJson: string,
  secret: string,
  algorithm: JwtAlgorithm,
): Promise<string> {
  const payload = JSON.parse(payloadJson) as Record<string, unknown>
  const key = new TextEncoder().encode(secret)
  return new SignJWT(payload).setProtectedHeader({ alg: algorithm }).sign(key)
}
