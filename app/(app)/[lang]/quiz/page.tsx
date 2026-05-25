'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Volume2, Maximize2, Minimize2, BarChart2, Check, X } from 'lucide-react'
import { WORDS } from '@/lib/data/words'
import { useLangStore } from '@/lib/stores/langStore'
import { useAuthStore } from '@/lib/stores/authStore'
import { pickWord, pickDirection, computeXP, getStreakStage } from '@/lib/game/prob'
import { scoreColor } from '@/lib/game/score'
import { createClient } from '@/lib/supabase/client'
import { StatsModal } from '@/components/game/StatsModal'
import { RankUpModal } from '@/components/game/RankUpModal'
import { OnboardingFlow } from '@/components/game/OnboardingFlow'
import type { Lang, RankTier } from '@/lib/supabase/types'
import { randomVariant } from '@/lib/data/words'

const LANG_CODES: Record<Lang, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT' }
const MILESTONES = [10, 25, 50, 100]

export default function QuizPage() {
  const { lang } = useParams() as { lang: Lang }
  const supabase = createClient()
  const { user } = useAuthStore()

  const langState = useLangStore(s => s.langStates[lang])
  const wordScores = useLangStore(s => s.wordScores[lang])
  const session = useLangStore(s => s.sessions[lang])
  const tutorialDone = useLangStore(s => s.tutorialDone)

  const {
    updateLangState, setWordScore,
    resetSession, getWordScore, getSessionCoins, setTutorialDone,
  } = useLangStore()

  // Card state
  const [flipped, setFlipped] = useState(false)
  const [direction, setDirection] = useState<'fr_to_target' | 'target_to_fr'>('fr_to_target')
  const [currentWord, setCurrentWord] = useState<typeof WORDS[0] | null>(null)
  const [flipTime, setFlipTime] = useState<number | null>(null)

  // UI state
  const [focusMode, setFocusMode] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [rankUpTier, setRankUpTier] = useState<RankTier | null>(null)
  const [milestoneNum, setMilestoneNum] = useState<number | null>(null)
  const [sessionResults, setSessionResults] = useState<Array<{ correct: boolean }>>([])

  // Streak
  const streak = session?.streakCount ?? 0
  const cardN = session?.cardCount ?? 0
  const sessionCoins = getSessionCoins(lang)

  const unlockedSubs = langState?.unlocked_subcats ?? ['1.1', '1.2', '1.3', '1.4']

  // Pool of available words
  const availableWords = WORDS.filter(w => unlockedSubs.includes(w.subId))
  const scores = wordScores ?? new Map()

  const drawNextCard = useCallback(() => {
    if (availableWords.length === 0) return
    const word = pickWord(availableWords, scores)
    const dir = pickDirection()
    setCurrentWord(word)
    setDirection(dir)
    setFlipped(false)
    setFlipTime(null)
  }, [availableWords, scores])

  // Init
  useEffect(() => {
    resetSession(lang)
    drawNextCard()
    return () => {
      resetSession(lang)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !flipped) {
        e.preventDefault()
        handleFlip()
      } else if (e.code === 'ArrowRight' && flipped) {
        handleAnswer(true)
      } else if (e.code === 'ArrowLeft' && flipped) {
        handleAnswer(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleFlip = () => {
    if (flipped) return
    setFlipped(true)
    setFlipTime(Date.now())
    // TTS: play non-French side
    const word = currentWord
    if (!word) return
    const targetText = direction === 'fr_to_target' ? word[lang] : word.fr
    if (direction === 'fr_to_target') {
      const utter = new SpeechSynthesisUtterance(targetText.split('/')[0].trim())
      utter.lang = LANG_CODES[lang]
      speechSynthesis.cancel()
      speechSynthesis.speak(utter)
    }
  }

  const handleAnswer = async (correct: boolean) => {
    if (!currentWord || !flipped) return

    const wordId = currentWord.id
    const scoreAtShow = getWordScore(lang, wordId)
    const elapsed = flipTime ? (Date.now() - flipTime) / 1000 : 99
    const speedBonus = elapsed < 3

    // Update score locally
    const newScore = correct
      ? Math.min(10, scoreAtShow + 1)
      : Math.max(0, scoreAtShow - 2)
    setWordScore(lang, wordId, newScore)

    // Session tracking
    const newCardN = cardN + 1
    const newStreak = correct ? streak + 1 : 0
    const coinBoosterMult = getBoosterMult('coin')
    const xpBoosterMult = getBoosterMult('xp')
    const streakBoosterMult = getBoosterMult('streak')

    setSessionResults(prev => [...prev, { correct }])

    // Check milestones
    if (MILESTONES.includes(newCardN)) {
      setMilestoneNum(newCardN)
      setTimeout(() => setMilestoneNum(null), 2000)
    }

    // Update session state
    useLangStore.setState(state => ({
      sessions: {
        ...state.sessions,
        [lang]: {
          cardCount: newCardN,
          streakCount: newStreak,
          correctCount: (state.sessions[lang]?.correctCount ?? 0) + (correct ? 1 : 0),
          totalCount: (state.sessions[lang]?.totalCount ?? 0) + 1,
        },
      },
    }))

    // Sync with backend if logged in
    if (user) {
      if (correct) {
        const xpAmount = computeXP(scoreAtShow, newStreak - 1, streakBoosterMult, speedBonus, false, xpBoosterMult)
        const result = await supabase.rpc('award_xp', {
          p_lang: lang,
          p_amount: xpAmount,
          p_source: 'quiz',
        })
        if (result.data?.promoted) {
          setRankUpTier(result.data.new_tier as RankTier)
          updateLangState(lang, {
            rank_tier: result.data.new_tier as RankTier,
            unlock_tokens: (langState?.unlock_tokens ?? 0) + result.data.tokens_granted,
          })
        }
      }

      // Update word score in DB
      await supabase.from('word_scores').upsert({
        user_id: user.id,
        lang,
        word_id: wordId,
        score: newScore,
        last_seen_at: new Date().toISOString(),
      })

      // Award coins (session cumulative)
      updateLangState(lang, { coins: (langState?.coins ?? 0) + newCardN * coinBoosterMult })
    }

    drawNextCard()
  }

  const getBoosterMult = (type: 'coin' | 'xp' | 'streak' | 'luck'): number => {
    const booster = langState?.active_boosters?.[type]
    if (!booster) return 1
    if (new Date(booster.until) < new Date()) return 1
    return booster.mult
  }

  const speakCurrent = () => {
    if (!currentWord) return
    const text = (direction === 'fr_to_target' ? currentWord[lang] : currentWord.fr).split('/')[0].trim()
    const langCode = direction === 'fr_to_target' ? LANG_CODES[lang] : 'fr-FR'
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = langCode
    speechSynthesis.cancel()
    speechSynthesis.speak(utter)
  }

  // Front and back text
  const frontText = currentWord
    ? (direction === 'fr_to_target' ? randomVariant(currentWord.fr) : randomVariant(currentWord[lang]))
    : ''
  const backText = currentWord
    ? (direction === 'fr_to_target' ? randomVariant(currentWord[lang]) : randomVariant(currentWord.fr))
    : ''

  const flameStage = getStreakStage(streak)

  if (!tutorialDone) {
    return <OnboardingFlow onDone={() => { setTutorialDone(); drawNextCard() }} />
  }

  return (
    <div className={`flex flex-col ${focusMode ? 'fixed inset-0 bg-[var(--bg)] z-30 p-4' : ''}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        {/* Streak */}
        <div className="flex items-center gap-1.5">
          <span className="text-xl" title={`Stage de flamme ${flameStage}`}>
            {flameStage === 0 ? '💨' : '🔥'}
          </span>
          <span className="font-black text-lg tabular-nums text-text">{streak}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => setStatsOpen(true)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
            <BarChart2 size={18} />
          </button>
          <button onClick={() => setFocusMode(f => !f)} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
            {focusMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {/* Session coins */}
        <div className="flex items-center gap-1 text-sm font-bold text-[var(--reward)] tabular-nums">
          <span>🪙</span>
          <span>{sessionCoins}</span>
        </div>
      </div>

      {/* Milestone */}
      <AnimatePresence>
        {milestoneNum && (
          <motion.div
            className="text-center mb-3 text-action font-black text-xl"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.5, opacity: 0 }}
          >
            🎉 {milestoneNum} cartes !
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flashcard */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className={`perspective w-full ${focusMode ? 'max-w-lg' : 'max-w-sm'}`}
          style={{ height: focusMode ? '380px' : '280px' }}
        >
          <motion.div
            className="preserve-3d relative w-full h-full cursor-pointer"
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
            onClick={!flipped ? handleFlip : undefined}
          >
            {/* Front */}
            <div className="backface-hidden absolute inset-0 bg-[var(--surface)] border border-[var(--border)] rounded-3xl flex flex-col items-center justify-center p-6 gap-3">
              <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                {direction === 'fr_to_target' ? 'Français' : 'Traduction'}
              </p>
              <p className="text-2xl font-bold text-text text-center leading-snug">{frontText}</p>
              {!flipped && (
                <p className="text-xs text-[var(--text-dim)] mt-2">Appuie pour révéler</p>
              )}
            </div>

            {/* Back */}
            <div className="backface-hidden rotate-y-180 absolute inset-0 bg-[var(--surface-2)] border border-[var(--action)]/30 rounded-3xl flex flex-col items-center justify-center p-6 gap-3">
              <p className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">
                {direction === 'fr_to_target' ? 'Traduction' : 'Français'}
              </p>
              <p className="text-2xl font-bold text-text text-center leading-snug">{backText}</p>
              {currentWord && (
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={speakCurrent} className="p-2 rounded-lg text-[var(--text-muted)] hover:text-action hover:bg-action/10 transition-colors">
                    <Volume2 size={18} />
                  </button>
                  <span className="text-xs px-2 py-0.5 rounded-md font-bold"
                    style={{ color: scoreColor(getWordScore(lang, currentWord.id)), backgroundColor: `${scoreColor(getWordScore(lang, currentWord.id))}20` }}>
                    {getWordScore(lang, currentWord.id)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Answer buttons */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            className="flex gap-3 mt-4"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <button
              onClick={() => handleAnswer(false)}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-score-red/20 text-score-red font-bold text-lg active:scale-95 transition-transform hover:bg-score-red/30"
              aria-label="Faux (←)"
            >
              <X size={22} />
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-action/20 text-action font-bold text-lg active:scale-95 transition-transform hover:bg-action/30"
              aria-label="Correct (→)"
            >
              <Check size={22} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <StatsModal open={statsOpen} onClose={() => setStatsOpen(false)} results={sessionResults} />
      {rankUpTier && (
        <RankUpModal tier={rankUpTier} onClose={() => setRankUpTier(null)} />
      )}
    </div>
  )
}
