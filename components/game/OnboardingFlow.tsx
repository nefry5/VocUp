'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, X } from 'lucide-react'
const DUMMY_CARDS: Array<{ front: string; back: string; hint: string }> = [
  { front: 'mot en français', back: 'traduction en (langue)', hint: '👆 Appuie sur la carte pour la retourner' },
  { front: 'un autre mot', back: 'another word', hint: '✅ Appuie sur ✓ si tu connaissais, ✗ sinon' },
  { front: 'dernier exemple', back: 'last example', hint: '🎉 Le quiz est infini — pars quand tu veux !' },
]

interface Props {
  onDone: () => void
}

export function OnboardingFlow({ onDone }: Props) {
  const [step, setStep] = useState(0)
  const [flipped, setFlipped] = useState(false)

  const card = DUMMY_CARDS[step]
  const isLast = step === DUMMY_CARDS.length - 1

  const handleFlip = () => {
    if (!flipped) setFlipped(true)
  }

  const handleAnswer = () => {
    if (isLast) {
      onDone()
    } else {
      setStep(s => s + 1)
      setFlipped(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <div className="text-center">
        <p className="text-sm font-bold text-action uppercase tracking-wider">Tutoriel</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">{step + 1} / {DUMMY_CARDS.length}</p>
      </div>

      {/* Tooltip hint */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="bg-action/10 border border-action/30 rounded-xl px-4 py-2 text-sm text-action text-center"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          {card.hint}
        </motion.div>
      </AnimatePresence>

      {/* Card */}
      <div className="perspective w-full max-w-sm" style={{ height: '220px' }}>
        <motion.div
          className="preserve-3d relative w-full h-full cursor-pointer"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6 }}
          onClick={handleFlip}
        >
          <div className="backface-hidden absolute inset-0 bg-[var(--surface)] border-2 border-action/40 rounded-3xl flex flex-col items-center justify-center p-6 gap-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Français</p>
            <p className="text-xl font-bold text-text text-center italic text-[var(--text-muted)]">{card.front}</p>
            {!flipped && <p className="text-xs text-action mt-3 animate-pulse">← Appuie ici →</p>}
          </div>
          <div className="backface-hidden rotate-y-180 absolute inset-0 bg-[var(--surface-2)] border-2 border-action/40 rounded-3xl flex flex-col items-center justify-center p-6 gap-2">
            <p className="text-xs text-[var(--text-dim)] uppercase tracking-wider">Traduction</p>
            <p className="text-xl font-bold text-text text-center italic text-[var(--text-muted)]">{card.back}</p>
          </div>
        </motion.div>
      </div>

      {/* Answer buttons (show after flip) */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            className="flex gap-3 w-full max-w-sm"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
          >
            <button
              onClick={handleAnswer}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-score-red/20 text-score-red font-bold text-lg active:scale-95 transition-transform"
            >
              <X size={22} />
            </button>
            <button
              onClick={handleAnswer}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-action/20 text-action font-bold text-lg active:scale-95 transition-transform"
            >
              <Check size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
