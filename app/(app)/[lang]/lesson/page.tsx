'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronDown, ChevronRight, Lock, Volume2, BookOpen, Sparkles } from 'lucide-react'
import { CATEGORIES, SUBCATEGORIES, WORDS, getWordsBySub } from '@/lib/data/words'
import { useLangStore } from '@/lib/stores/langStore'
import { scoreBadgeClass, isMastered } from '@/lib/game/score'
import { DailyReviewModal } from '@/components/game/DailyReviewModal'
import type { Lang } from '@/lib/supabase/types'

const CAT_EMOJIS: Record<string, string> = {
  '1': '⚡',
  '2': '🌍',
  '3': '❤️',
  '4': '🍎',
  '5': '🌿',
  '6': '🏠',
  '7': '😊',
  '8': '⏰',
  '9': '🌐',
}

// Category names in French matching reference image style
const CAT_DISPLAY_NAMES: Record<string, string> = {
  '1': 'Actions',
  '2': 'Espace & Temps',
  '3': 'Corps',
  '4': 'Nourriture',
  '5': 'Nature',
  '6': 'Maison',
  '7': 'Émotions',
  '8': 'Temps',
  '9': 'Société',
}

function speakWord(text: string, langCode: Lang) {
  if (!('speechSynthesis' in window)) return
  const langMap: Record<Lang, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES', it: 'it-IT' }
  const utter = new SpeechSynthesisUtterance(text.split('/')[0].trim())
  utter.lang = langMap[langCode]
  speechSynthesis.cancel()
  speechSynthesis.speak(utter)
}

export default function LessonPage() {
  const { lang } = useParams() as { lang: Lang }
  const langState = useLangStore(s => s.langStates[lang])
  const wordScores = useLangStore(s => s.wordScores[lang])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [reviewOpen, setReviewOpen] = useState(false)

  const unlockedSubs = langState?.unlocked_subcats ?? ['1.1', '1.2', '1.3', '1.4']

  const toggleCat = (catId: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(catId)) { next.delete(catId) } else { next.add(catId) }
      return next
    })
  }

  const toggleSub = (subId: string) => {
    if (!unlockedSubs.includes(subId)) return
    setExpandedSubs(prev => {
      const next = new Set(prev)
      if (next.has(subId)) { next.delete(subId) } else { next.add(subId) }
      return next
    })
  }

  return (
    <div className="space-y-2">
      {/* Daily review btn */}
      <button
        onClick={() => setReviewOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border mb-4 transition-all hover:opacity-90 active:scale-[0.98]"
        style={{
          background: 'linear-gradient(135deg, var(--action)12, var(--reward)08)',
          borderColor: 'var(--action)40',
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--action)20' }}
        >
          <BookOpen size={18} style={{ color: 'var(--action)' }} />
        </div>
        <div className="text-left flex-1">
          <p className="font-bold text-text text-sm">Révision du jour</p>
          <p className="text-xs text-[var(--text-muted)]">10 mots · Audio automatique</p>
        </div>
        <Sparkles size={15} style={{ color: 'var(--action)' }} className="shrink-0" />
      </button>

      {/* Category rows */}
      {CATEGORIES.map(cat => {
        const catExpanded = expandedCats.has(cat.id)
        const subs = SUBCATEGORIES.filter(s => s.catId === cat.id)
        const emoji = CAT_EMOJIS[cat.id] ?? '📚'
        const displayName = CAT_DISPLAY_NAMES[cat.id] ?? cat.name

        // Per-category mastered / total
        const catWords = WORDS.filter(w => w.catId === cat.id)
        const catTotal = catWords.length
        const catMastered = catWords.filter(w =>
          isMastered(wordScores?.get(w.id) ?? 4)
        ).length

        return (
          <div key={cat.id}>
            {/* Category row */}
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors active:scale-[0.99]"
            >
              {/* Emoji icon — rounded square, like app icon style */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-2xl"
                style={{ background: 'var(--surface-3)' }}
              >
                {emoji}
              </div>

              {/* Text */}
              <div className="flex-1 text-left">
                <p className="font-bold text-text text-base leading-tight">{displayName}</p>
                <p className="text-sm text-[var(--text-muted)] mt-0.5 tabular-nums">
                  {catMastered}/{catTotal} maîtrisés
                </p>
              </div>

              {/* Chevron */}
              {catExpanded
                ? <ChevronDown size={18} className="text-[var(--text-dim)] shrink-0" />
                : <ChevronRight size={18} className="text-[var(--text-dim)] shrink-0" />}
            </button>

            {/* Subcategories */}
            {catExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {subs.map(sub => {
                  const unlocked = unlockedSubs.includes(sub.id)
                  const subExpanded = expandedSubs.has(sub.id)
                  const words = getWordsBySub(sub.id)

                  return (
                    <div key={sub.id} className="bg-[var(--surface)] rounded-xl overflow-hidden">
                      {/* Subcat header */}
                      <button
                        onClick={() => toggleSub(sub.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 transition-colors ${
                          unlocked
                            ? 'hover:bg-[var(--surface-2)] cursor-pointer'
                            : 'cursor-default opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {!unlocked && (
                            <Lock size={13} className="text-[var(--text-dim)] shrink-0" />
                          )}
                          <span className="text-sm font-medium text-text truncate">{sub.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-[var(--text-dim)] tabular-nums">{sub.wordCount} mots</span>
                          {!unlocked && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-md font-semibold"
                              style={{ color: 'var(--reward)', background: 'var(--reward)15' }}
                            >
                              🔒 1 jeton
                            </span>
                          )}
                          {unlocked && (
                            subExpanded
                              ? <ChevronDown size={14} className="text-[var(--text-muted)]" />
                              : <ChevronRight size={14} className="text-[var(--text-muted)]" />
                          )}
                        </div>
                      </button>

                      {/* Word rows */}
                      {unlocked && subExpanded && words.map(word => {
                        const score = wordScores?.get(word.id) ?? 4
                        const targetText = word[lang]
                        return (
                          <div
                            key={word.id}
                            className="flex items-center gap-3 px-4 py-2.5 border-t border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors"
                          >
                            <span className="flex-1 text-sm text-[var(--text-muted)]">{word.fr}</span>
                            <span className="flex-1 text-sm text-text font-medium">{targetText}</span>
                            <button
                              onClick={() => speakWord(targetText, lang)}
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-action hover:bg-action/10 transition-colors"
                              aria-label={`Écouter ${targetText}`}
                            >
                              <Volume2 size={15} />
                            </button>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-md tabular-nums ${scoreBadgeClass(score)}`}>
                              {score}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <DailyReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} lang={lang} />
    </div>
  )
}
