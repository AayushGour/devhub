interface LangInfo {
  name: string
  color: string
}

const EXT_MAP: Record<string, LangInfo> = {
  ts: { name: 'TypeScript', color: '#3178c6' },
  tsx: { name: 'TypeScript', color: '#3178c6' },
  js: { name: 'JavaScript', color: '#f7df1e' },
  jsx: { name: 'JavaScript', color: '#f7df1e' },
  mjs: { name: 'JavaScript', color: '#f7df1e' },
  cjs: { name: 'JavaScript', color: '#f7df1e' },
  py: { name: 'Python', color: '#3572A5' },
  rs: { name: 'Rust', color: '#dea584' },
  go: { name: 'Go', color: '#00ADD8' },
  java: { name: 'Java', color: '#b07219' },
  kt: { name: 'Kotlin', color: '#A97BFF' },
  kts: { name: 'Kotlin', color: '#A97BFF' },
  rb: { name: 'Ruby', color: '#701516' },
  php: { name: 'PHP', color: '#4F5D95' },
  cs: { name: 'C#', color: '#178600' },
  cpp: { name: 'C++', color: '#f34b7d' },
  cc: { name: 'C++', color: '#f34b7d' },
  cxx: { name: 'C++', color: '#f34b7d' },
  c: { name: 'C', color: '#555555' },
  h: { name: 'C', color: '#555555' },
  hpp: { name: 'C++', color: '#f34b7d' },
  swift: { name: 'Swift', color: '#F05138' },
  dart: { name: 'Dart', color: '#00B4AB' },
  scala: { name: 'Scala', color: '#c22d40' },
  lua: { name: 'Lua', color: '#000080' },
  r: { name: 'R', color: '#198CE7' },
  vue: { name: 'Vue', color: '#41b883' },
  svelte: { name: 'Svelte', color: '#ff3e00' },
  json: { name: 'JSON', color: '#292929' },
  yaml: { name: 'YAML', color: '#cb171e' },
  yml: { name: 'YAML', color: '#cb171e' },
  toml: { name: 'TOML', color: '#9c4221' },
  md: { name: 'Markdown', color: '#083fa1' },
  sh: { name: 'Shell', color: '#89e051' },
  bash: { name: 'Shell', color: '#89e051' },
  zsh: { name: 'Shell', color: '#89e051' },
  css: { name: 'CSS', color: '#563d7c' },
  scss: { name: 'SCSS', color: '#c6538c' },
  html: { name: 'HTML', color: '#e34c26' },
}

const BINARY_EXTS = new Set([
  'png','jpg','jpeg','gif','svg','ico','webp','bmp','tiff',
  'woff','woff2','ttf','eot','otf',
  'zip','tar','gz','bz2','7z','rar',
  'exe','dll','so','dylib','a','lib',
  'pdf','docx','xlsx','pptx',
  'mp3','mp4','wav','avi','mov',
  'db','sqlite','sqlite3',
  'lock', // lockfiles are text but huge and not useful for analysis
])

export function isBinary(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return BINARY_EXTS.has(ext)
}

export function detectLanguage(path: string): LangInfo {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP[ext] ?? { name: 'Unknown', color: '#888888' }
}

export function languageColor(language: string): string {
  const entry = Object.values(EXT_MAP).find((l) => l.name === language)
  return entry?.color ?? '#888888'
}
