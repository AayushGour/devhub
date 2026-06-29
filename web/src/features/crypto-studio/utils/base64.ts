export function encodeBase64(text: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary)
  if (urlSafe) return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return encoded
}

export function decodeBase64(text: string, urlSafe = false): string {
  let b64 = text.trim()
  if (urlSafe) {
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/')
    const pad = (4 - (b64.length % 4)) % 4
    b64 += '='.repeat(pad)
  }
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function encodeFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
