// Voice registry.
//
// Structured as language-keyed packs so adding a non-English pack later is a
// data change rather than a refactor. Only the English packs are populated:
// kokoro-js ships an English-only grapheme-to-phoneme front end in the browser,
// so a non-English book would be pronounced with English phonemes — audibly
// broken rather than merely accented. The gate is `supported`.

export type Grade = 'A' | 'A-' | 'B-' | 'C+' | 'C' | 'C-' | 'D+' | 'D' | 'D-' | 'F+'

export interface VoiceEntry {
  /** Kokoro voice id, e.g. 'af_heart'. */
  id: string
  label: string
  gender: 'female' | 'male'
  accent: 'US' | 'UK'
  /** Kokoro's own published quality grade for the voice. */
  grade: Grade
}

export const ACCENT_LABEL: Record<VoiceEntry['accent'], string> = {
  US: 'American',
  UK: 'British',
}

export interface VoicePack {
  lang: string
  label: string
  supported: boolean
  voices: VoiceEntry[]
}

const EN_US: VoiceEntry[] = [
  { id: 'af_heart',   label: 'Heart',   gender: 'female', accent: 'US', grade: 'A'  },
  { id: 'af_bella',   label: 'Bella',   gender: 'female', accent: 'US', grade: 'A-' },
  { id: 'af_nicole',  label: 'Nicole',  gender: 'female', accent: 'US', grade: 'B-' },
  { id: 'af_aoede',   label: 'Aoede',   gender: 'female', accent: 'US', grade: 'C+' },
  { id: 'af_kore',    label: 'Kore',    gender: 'female', accent: 'US', grade: 'C+' },
  { id: 'af_sarah',   label: 'Sarah',   gender: 'female', accent: 'US', grade: 'C+' },
  { id: 'af_nova',    label: 'Nova',    gender: 'female', accent: 'US', grade: 'C'  },
  { id: 'af_sky',     label: 'Sky',     gender: 'female', accent: 'US', grade: 'C-' },
  { id: 'af_alloy',   label: 'Alloy',   gender: 'female', accent: 'US', grade: 'C'  },
  { id: 'af_jessica', label: 'Jessica', gender: 'female', accent: 'US', grade: 'D'  },
  { id: 'af_river',   label: 'River',   gender: 'female', accent: 'US', grade: 'D'  },
  { id: 'am_fenrir',  label: 'Fenrir',  gender: 'male', accent: 'US', grade: 'C+' },
  { id: 'am_michael', label: 'Michael', gender: 'male', accent: 'US', grade: 'C+' },
  { id: 'am_puck',    label: 'Puck',    gender: 'male', accent: 'US', grade: 'C+' },
  { id: 'am_echo',    label: 'Echo',    gender: 'male', accent: 'US', grade: 'D'  },
  { id: 'am_eric',    label: 'Eric',    gender: 'male', accent: 'US', grade: 'D'  },
  { id: 'am_liam',    label: 'Liam',    gender: 'male', accent: 'US', grade: 'D'  },
  { id: 'am_onyx',    label: 'Onyx',    gender: 'male', accent: 'US', grade: 'D'  },
  { id: 'am_santa',   label: 'Santa',   gender: 'male', accent: 'US', grade: 'D-' },
  { id: 'am_adam',    label: 'Adam',    gender: 'male', accent: 'US', grade: 'F+' },
]

const EN_GB: VoiceEntry[] = [
  { id: 'bf_emma',     label: 'Emma',     gender: 'female', accent: 'UK', grade: 'B-' },
  { id: 'bf_isabella', label: 'Isabella', gender: 'female', accent: 'UK', grade: 'C'  },
  { id: 'bf_alice',    label: 'Alice',    gender: 'female', accent: 'UK', grade: 'D'  },
  { id: 'bf_lily',     label: 'Lily',     gender: 'female', accent: 'UK', grade: 'D'  },
  { id: 'bm_fable',    label: 'Fable',    gender: 'male', accent: 'UK', grade: 'C'  },
  { id: 'bm_george',   label: 'George',   gender: 'male', accent: 'UK', grade: 'C'  },
  { id: 'bm_lewis',    label: 'Lewis',    gender: 'male', accent: 'UK', grade: 'D+' },
  { id: 'bm_daniel',   label: 'Daniel',   gender: 'male', accent: 'UK', grade: 'D'  },
]

export const VOICE_PACKS: Record<string, VoicePack> = {
  'en-US': { lang: 'en-US', label: 'English (US)', supported: true, voices: EN_US },
  'en-GB': { lang: 'en-GB', label: 'English (UK)', supported: true, voices: EN_GB },
}

export const ALL_VOICES: VoiceEntry[] = [...EN_US, ...EN_GB]

export const DEFAULT_VOICE_ID = 'af_heart'

export const SAMPLE_SENTENCE =
  'The caravans moved at night, when the sand was cold and the stars were a map.'

export function findVoice(id: string): VoiceEntry | undefined {
  return ALL_VOICES.find((v) => v.id === id)
}

/** Human-readable one-liner for a voice, e.g. "Heart — American female, grade A". */
export function describeVoice(voice: VoiceEntry): string {
  return `${voice.label} — ${ACCENT_LABEL[voice.accent]} ${voice.gender}, grade ${voice.grade}`
}

/** Whether a book in `language` (a BCP-47 tag or bare code) can be narrated. */
export function isLanguageSupported(language: string | undefined): boolean {
  if (!language) return true // unlabelled — assume English rather than blocking
  return language.toLowerCase().startsWith('en')
}
