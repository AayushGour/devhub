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
  gender: 'F' | 'M'
  accent: 'US' | 'UK'
  /** Kokoro's own published quality grade for the voice. */
  grade: Grade
}

export interface VoicePack {
  lang: string
  label: string
  supported: boolean
  voices: VoiceEntry[]
}

const EN_US: VoiceEntry[] = [
  { id: 'af_heart',   label: 'Heart',   gender: 'F', accent: 'US', grade: 'A'  },
  { id: 'af_bella',   label: 'Bella',   gender: 'F', accent: 'US', grade: 'A-' },
  { id: 'af_nicole',  label: 'Nicole',  gender: 'F', accent: 'US', grade: 'B-' },
  { id: 'af_aoede',   label: 'Aoede',   gender: 'F', accent: 'US', grade: 'C+' },
  { id: 'af_kore',    label: 'Kore',    gender: 'F', accent: 'US', grade: 'C+' },
  { id: 'af_sarah',   label: 'Sarah',   gender: 'F', accent: 'US', grade: 'C+' },
  { id: 'af_nova',    label: 'Nova',    gender: 'F', accent: 'US', grade: 'C'  },
  { id: 'af_sky',     label: 'Sky',     gender: 'F', accent: 'US', grade: 'C-' },
  { id: 'af_alloy',   label: 'Alloy',   gender: 'F', accent: 'US', grade: 'C'  },
  { id: 'af_jessica', label: 'Jessica', gender: 'F', accent: 'US', grade: 'D'  },
  { id: 'af_river',   label: 'River',   gender: 'F', accent: 'US', grade: 'D'  },
  { id: 'am_fenrir',  label: 'Fenrir',  gender: 'M', accent: 'US', grade: 'C+' },
  { id: 'am_michael', label: 'Michael', gender: 'M', accent: 'US', grade: 'C+' },
  { id: 'am_puck',    label: 'Puck',    gender: 'M', accent: 'US', grade: 'C+' },
  { id: 'am_echo',    label: 'Echo',    gender: 'M', accent: 'US', grade: 'D'  },
  { id: 'am_eric',    label: 'Eric',    gender: 'M', accent: 'US', grade: 'D'  },
  { id: 'am_liam',    label: 'Liam',    gender: 'M', accent: 'US', grade: 'D'  },
  { id: 'am_onyx',    label: 'Onyx',    gender: 'M', accent: 'US', grade: 'D'  },
  { id: 'am_santa',   label: 'Santa',   gender: 'M', accent: 'US', grade: 'D-' },
  { id: 'am_adam',    label: 'Adam',    gender: 'M', accent: 'US', grade: 'F+' },
]

const EN_GB: VoiceEntry[] = [
  { id: 'bf_emma',     label: 'Emma',     gender: 'F', accent: 'UK', grade: 'B-' },
  { id: 'bf_isabella', label: 'Isabella', gender: 'F', accent: 'UK', grade: 'C'  },
  { id: 'bf_alice',    label: 'Alice',    gender: 'F', accent: 'UK', grade: 'D'  },
  { id: 'bf_lily',     label: 'Lily',     gender: 'F', accent: 'UK', grade: 'D'  },
  { id: 'bm_fable',    label: 'Fable',    gender: 'M', accent: 'UK', grade: 'C'  },
  { id: 'bm_george',   label: 'George',   gender: 'M', accent: 'UK', grade: 'C'  },
  { id: 'bm_lewis',    label: 'Lewis',    gender: 'M', accent: 'UK', grade: 'D+' },
  { id: 'bm_daniel',   label: 'Daniel',   gender: 'M', accent: 'UK', grade: 'D'  },
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

/** Whether a book in `language` (a BCP-47 tag or bare code) can be narrated. */
export function isLanguageSupported(language: string | undefined): boolean {
  if (!language) return true // unlabelled — assume English rather than blocking
  return language.toLowerCase().startsWith('en')
}
