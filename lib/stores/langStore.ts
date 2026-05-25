'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Lang, LangState } from '@/lib/supabase/types'
import { updateScore } from '@/lib/game/score'

// Per-lang quiz session state (not persisted)
export interface SessionState {
  cardCount: number       // N cards answered this session
  streakCount: number     // current streak
  correctCount: number    // correct this session
  totalCount: number      // total this session (right + wrong)
}

interface LangStore {
  // Persisted lang states (keyed by lang)
  langStates: Partial<Record<Lang, LangState>>
  // Word scores per lang
  wordScores: Partial<Record<Lang, Map<string, number>>>
  // Session state (volatile)
  sessions: Partial<Record<Lang, SessionState>>
  // Tutorial done flag
  tutorialDone: boolean

  // Actions
  setLangState: (lang: Lang, state: LangState) => void
  updateLangState: (lang: Lang, patch: Partial<LangState>) => void
  setWordScore: (lang: Lang, wordId: string, score: number) => void
  applyCardResult: (lang: Lang, wordId: string, correct: boolean) => void
  resetSession: (lang: Lang) => void
  incrementSession: (lang: Lang) => void
  setTutorialDone: () => void
  getWordScore: (lang: Lang, wordId: string) => number
  getSessionCoins: (lang: Lang) => number  // cumulative N*(N+1)/2
}

const defaultSession = (): SessionState => ({
  cardCount: 0,
  streakCount: 0,
  correctCount: 0,
  totalCount: 0,
})

// IndexedDB-backed persist (falls back to localStorage if IDB not available)
const idbStorage = createJSONStorage(() => {
  if (typeof window === 'undefined') return localStorage
  // Use localStorage as fallback; real IDB integration in sync layer
  return localStorage
})

export const useLangStore = create<LangStore>()(
  persist(
    (set, get) => ({
      langStates: {},
      wordScores: {},
      sessions: {},
      tutorialDone: false,

      setLangState: (lang, state) =>
        set(s => ({ langStates: { ...s.langStates, [lang]: state } })),

      updateLangState: (lang, patch) =>
        set(s => ({
          langStates: {
            ...s.langStates,
            [lang]: { ...(s.langStates[lang] as LangState), ...patch },
          },
        })),

      setWordScore: (lang, wordId, score) =>
        set(s => {
          const existing = s.wordScores[lang] ?? new Map()
          const updated = new Map(existing)
          updated.set(wordId, score)
          return { wordScores: { ...s.wordScores, [lang]: updated } }
        }),

      applyCardResult: (lang, wordId, correct) => {
        const { wordScores } = get()
        const current = (wordScores[lang] ?? new Map()).get(wordId) ?? 4
        const newScore = updateScore(current, correct)
        get().setWordScore(lang, wordId, newScore)
      },

      resetSession: (lang) =>
        set(s => ({ sessions: { ...s.sessions, [lang]: defaultSession() } })),

      incrementSession: (lang) =>
        set(s => {
          const sess = s.sessions[lang] ?? defaultSession()
          return {
            sessions: {
              ...s.sessions,
              [lang]: { ...sess, cardCount: sess.cardCount + 1 },
            },
          }
        }),

      setTutorialDone: () => set({ tutorialDone: true }),

      getWordScore: (lang, wordId) => {
        return (get().wordScores[lang] ?? new Map()).get(wordId) ?? 4
      },

      getSessionCoins: (lang) => {
        const n = get().sessions[lang]?.cardCount ?? 0
        return Math.floor(n * (n + 1) / 2)
      },
    }),
    {
      name: 'vocup-lang-store',
      storage: idbStorage,
      // Serialize Maps as arrays for JSON
      partialize: (state) => ({
        langStates: state.langStates,
        wordScores: Object.fromEntries(
          Object.entries(state.wordScores).map(([lang, map]) => {
            const m = map as Map<string, number>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return [lang, Array.from(m.entries()) as unknown as [string, number][]]
          })
        ),
        tutorialDone: state.tutorialDone,
        // sessions NOT persisted
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.wordScores) {
          // Convert arrays back to Maps
          const maps: Partial<Record<Lang, Map<string, number>>> = {}
          for (const [lang, entries] of Object.entries(state.wordScores)) {
            maps[lang as Lang] = new Map(entries as unknown as [string, number][])
          }
          state.wordScores = maps
        }
      },
    }
  )
)
