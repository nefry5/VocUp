'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { WORDS } from '@/lib/data/words'
import { useLangStore } from '@/lib/stores/langStore'
import { pickLowestScore } from '@/lib/game/prob'
import type { Lang } from '@/lib/supabase/types'

interface Props {
  open: boolean
  onClose: () => void
  lang: Lang
}

const LANG_CODES: Record<Lang, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT' }

export function DailyReviewModal({ open, onClose, lang }: Props) {
  const wordScores = useLangStore(s => s.wordScores[lang])
  const langState = useLangStore(s => s.langStates[lang])
  const [words, setWords] = useState<typeof WORDS>([])
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!open) return
    const scores = wordScores ?? new Map()
    const unlockedIds = new Set(langState?.unlocked_subcats?.flatMap(sub =>
      WORDS.filter(w => w.subId === sub).map(w => w.id)
    ) ?? WORDS.filter(w => w.subId.startsWith('1.')).map(w => w.id))
    const available = WORDS.filter(w => unlockedIds.has(w.id))
    const reviewed = pickLowestScore(available, scores, 10)
    setWords(reviewed)
    setIndex(0)
    setDone(false)
  }, [open])

  useEffect(() => {
    if (!open || words.length === 0) return
    const word = words[index]
    if (!word) return
    const text = word[lang].split('/')[0].trim()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = LANG_CODES[lang]
    setTimeout(() => {
      speechSynthesis.cancel()
      speechSynthesis.speak(utter)
    }, 300)
  }, [index, words, open, lang])

  const handleNext = () => {
    if (index < words.length - 1) {
      setIndex(i => i + 1)
    } else {
      setDone(true)
    }
  }

  const current = words[index]

  return (
    <Modal open={open} onClose={onClose} title="Révision du jour" size="md">
      {done || words.length === 0 ? (
        <div className="text-center space-y-4 py-4">
          <span className="text-4xl">✅</span>
          <p className="font-bold text-text">Révision terminée !</p>
          <p className="text-sm text-[var(--text-muted)]">10 mots révisés. Continue dans le quiz !</p>
          <Button fullWidth onClick={onClose}>Fermer</Button>
        </div>
      ) : current ? (
        <div className="space-y-4 py-2">
          <div className="text-center text-xs text-[var(--text-muted)] tabular-nums">
            {index + 1} / {words.length}
          </div>
          <div className="bg-[var(--surface-2)] rounded-2xl p-6 text-center space-y-3">
            <p className="text-[var(--text-muted)] text-sm">{current.fr}</p>
            <p className="text-2xl font-bold text-text">{current[lang]}</p>
          </div>
          <Button fullWidth onClick={handleNext}>
            {index < words.length - 1 ? 'Suivant →' : 'Terminer'}
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}
