import type { HashAlgorithm } from './constants'

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff)
  return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff)
}
function rol(n: number, c: number): number {
  return (n << c) | (n >>> (32 - c))
}
function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b)
}
const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
  cmn((b & c) | (~b & d), a, b, x, s, t)
const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
  cmn((b & d) | (c & ~d), a, b, x, s, t)
const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
  cmn(b ^ c ^ d, a, b, x, s, t)
const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
  cmn(c ^ (b | ~d), a, b, x, s, t)

function toWords(bytes: Uint8Array): number[] {
  const nblk = ((bytes.length + 8) >> 6) + 1
  const blks = new Array(nblk * 16).fill(0)
  for (let i = 0; i < bytes.length; i++) blks[i >> 2] |= bytes[i] << ((i & 3) * 8)
  blks[bytes.length >> 2] |= 0x80 << ((bytes.length & 3) * 8)
  blks[nblk * 16 - 2] = bytes.length * 8
  return blks
}

function wordsToHex(w: number[]): string {
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < w.length * 4; i++) {
    s += h[(w[i >> 2] >> ((i & 3) * 8 + 4)) & 0xf] + h[(w[i >> 2] >> ((i & 3) * 8)) & 0xf]
  }
  return s
}

function md5Core(M: number[]): number[] {
  let a = 0x67452301,
    b = 0xefcdab89 | 0,
    c = 0x98badcfe | 0,
    d = 0x10325476
  for (let i = 0; i < M.length; i += 16) {
    const [oa, ob, oc, od] = [a, b, c, d]
    a=ff(a,b,c,d,M[i+0],7,-680876936);d=ff(d,a,b,c,M[i+1],12,-389564586);c=ff(c,d,a,b,M[i+2],17,606105819);b=ff(b,c,d,a,M[i+3],22,-1044525330)
    a=ff(a,b,c,d,M[i+4],7,-176418897);d=ff(d,a,b,c,M[i+5],12,1200080426);c=ff(c,d,a,b,M[i+6],17,-1473231341);b=ff(b,c,d,a,M[i+7],22,-45705983)
    a=ff(a,b,c,d,M[i+8],7,1770035416);d=ff(d,a,b,c,M[i+9],12,-1958414417);c=ff(c,d,a,b,M[i+10],17,-42063);b=ff(b,c,d,a,M[i+11],22,-1990404162)
    a=ff(a,b,c,d,M[i+12],7,1804603682);d=ff(d,a,b,c,M[i+13],12,-40341101);c=ff(c,d,a,b,M[i+14],17,-1502002290);b=ff(b,c,d,a,M[i+15],22,1236535329)
    a=gg(a,b,c,d,M[i+1],5,-165796510);d=gg(d,a,b,c,M[i+6],9,-1069501632);c=gg(c,d,a,b,M[i+11],14,643717713);b=gg(b,c,d,a,M[i+0],20,-373897302)
    a=gg(a,b,c,d,M[i+5],5,-701558691);d=gg(d,a,b,c,M[i+10],9,38016083);c=gg(c,d,a,b,M[i+15],14,-660478335);b=gg(b,c,d,a,M[i+4],20,-405537848)
    a=gg(a,b,c,d,M[i+9],5,568446438);d=gg(d,a,b,c,M[i+14],9,-1019803690);c=gg(c,d,a,b,M[i+3],14,-187363961);b=gg(b,c,d,a,M[i+8],20,1163531501)
    a=gg(a,b,c,d,M[i+13],5,-1444681467);d=gg(d,a,b,c,M[i+2],9,-51403784);c=gg(c,d,a,b,M[i+7],14,1735328473);b=gg(b,c,d,a,M[i+12],20,-1926607734)
    a=hh(a,b,c,d,M[i+5],4,-378558);d=hh(d,a,b,c,M[i+8],11,-2022574463);c=hh(c,d,a,b,M[i+11],16,1839030562);b=hh(b,c,d,a,M[i+14],23,-35309556)
    a=hh(a,b,c,d,M[i+1],4,-1530992060);d=hh(d,a,b,c,M[i+4],11,1272893353);c=hh(c,d,a,b,M[i+7],16,-155497632);b=hh(b,c,d,a,M[i+10],23,-1094730640)
    a=hh(a,b,c,d,M[i+13],4,681279174);d=hh(d,a,b,c,M[i+0],11,-358537222);c=hh(c,d,a,b,M[i+3],16,-722521979);b=hh(b,c,d,a,M[i+6],23,76029189)
    a=hh(a,b,c,d,M[i+9],4,-640364487);d=hh(d,a,b,c,M[i+12],11,-421815835);c=hh(c,d,a,b,M[i+15],16,530742520);b=hh(b,c,d,a,M[i+2],23,-995338651)
    a=ii(a,b,c,d,M[i+0],6,-198630844);d=ii(d,a,b,c,M[i+7],10,1126891415);c=ii(c,d,a,b,M[i+14],15,-1416354905);b=ii(b,c,d,a,M[i+5],21,-57434055)
    a=ii(a,b,c,d,M[i+12],6,1700485571);d=ii(d,a,b,c,M[i+3],10,-1894986606);c=ii(c,d,a,b,M[i+10],15,-1051523);b=ii(b,c,d,a,M[i+1],21,-2054922799)
    a=ii(a,b,c,d,M[i+8],6,1873313359);d=ii(d,a,b,c,M[i+15],10,-30611744);c=ii(c,d,a,b,M[i+6],15,-1560198380);b=ii(b,c,d,a,M[i+13],21,1309151649)
    a=ii(a,b,c,d,M[i+4],6,-145523070);d=ii(d,a,b,c,M[i+11],10,-1120210379);c=ii(c,d,a,b,M[i+2],15,718787259);b=ii(b,c,d,a,M[i+9],21,-343485551)
    a=safeAdd(a,oa);b=safeAdd(b,ob);c=safeAdd(c,oc);d=safeAdd(d,od)
  }
  return [a, b, c, d]
}

function computeMd5(str: string): string {
  const bytes = new TextEncoder().encode(str)
  return wordsToHex(md5Core(toWords(bytes)))
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function bufToBase64(buf: ArrayBuffer): string {
  return btoa(Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(''))
}

export async function computeHash(
  text: string,
  algorithm: HashAlgorithm,
): Promise<{ hex: string; base64: string }> {
  if (algorithm === 'MD5') {
    const hex = computeMd5(text)
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    const base64 = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
    return { hex, base64 }
  }
  const buf = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text))
  return { hex: bufToHex(buf), base64: bufToBase64(buf) }
}
