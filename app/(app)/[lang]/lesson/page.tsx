'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronDown, ChevronRight, Lock, Volume2, BookOpen, Sparkles } from 'lucide-react'
import { CATEGORIES, SUBCATEGORIES, getWordsBySub } from '@/lib/data/words'
import { useLangStore } from '@/lib/stores/langStore'
import { scoreBadgeClass } from '@/lib/game/score'
import { DailyReviewModal } from '@/components/game/DailyReviewModal'
import type { Lang } from '@/lib/supabase/types'

const CAT_EMOJIS: Record<string, string> = {
  '1': '⭐',
  '2': '🌍',
  '3': '👤',
  '4': '🏠',
  '5': '🌿',
  '6': '💼',
  '7': '🎨',
  '8': '🔬',
  '9': '🧠',
}

const CAT_COLORS: Record<string, string> = {
  '1': '#facc15',
  '2': '#38bdf8',
  '3': '#f472b6',
  '4': '#fb923c',
  '5': '#34d399',
  '6': '#a78bfa',
  '7': '#f97316',
  '8': '#22d3ee',
  '9': '#818cf8',
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
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['1']))
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
    <div className="space-y-4">
      {/* Daily review btn */}
      <button
        onClick={() => setReviewOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border transition-all hover:border-action/50 active:scale-[0.98]"
        style={{ background: 'linear-gradient(135deg, var(--action)10, var(--reward)08)', borderColor: 'var(--action)30' }}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'var(--action)20' }}>
          <BookOpen size={20} style={{ color: 'var(--action)' }} />
        </div>
        <div className="text-left">
          <p className="font-bold text-text text-sm">Révision du jour</p>
          <p className="text-xs text-[var(--text-muted)]">10 mots à réviser · Audio automatique</p>
        </div>
        <Sparkles size={16} className="ml-auto shrink-0" style={{ color: 'var(--action)' }} />
      </button>

      {/* Categories accordion */}
      {CATEGORIES.map(cat => {
        const catExpanded = expandedCats.has(cat.id)
        const subs = SUBCATEGORIES.filter(s => s.catId === cat.id)
        const emoji = CAT_EMOJIS[cat.id] ?? '📚'
        const color = CAT_COLORS[cat.id] ?? 'var(--action)'
        // Count unlocked subs in this cat
        const unlockedCount = subs.filter(s => unlockedSubs.includes(s.id)).length

        return (
          <div key={cat.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
            {/* Category header — larger, more alive */}
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center gap-4 px-4 py-4 hover:bg-[var(--surface-2)] transition-colors"
            >
              {/* Emoji icon with colored bg */}
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-2xl"
                style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}>
                {emoji}
              </div>
              <div className="flex-1 text-left">
                <p className="font-bold text-text text-sm">{cat.name}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  {unlockedCount}/{subs.length} sous-catégories débloquées
                </p>
              </div>
              {catExpanded
                ? <ChevronDown size={18} className="text-[var(--text-muted)] shrink-0" />
                : <ChevronRight size={18} className="text-[var(--text-muted)] shrink-0" />}
            </button>

            {catExpanded && subs.map(sub => {
              const unlocked = unlockedSubs.includes(sub.id)
              const subExpanded = expandedSubs.has(sub.id)
              const words = getWordsBySub(sub.id)

              return (
                <div key={sub.id} className="border-t border-[var(--border-subtle)]">
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
                      {unlocked ? (
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      ) : (
                        <Lock size={13} className="text-[var(--text-dim)] shrink-0" />
                      )}
                      <span className="text-sm font-medium text-text truncate">{sub.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-[var(--text-dim)]">{sub.wordCount} mots</span>
                      {unlocked && (
                        subExpanded
                          ? <ChevronDown size={14} className="text-[var(--text-muted)]" />
                          : <ChevronRight size={14} className="text-[var(--text-muted)]" />
                      )}
                      {!unlocked && (
                        <span className="text-xs px-2 py-0.5 rounded-md font-semibold"
                          style={{ color: 'var(--reward)', backgroundColor: 'var(--reward)15' }}>
                          🔒 1 jeton
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Word rows */}
                  {unlocked && subExpanded && words.map(word => {
                    const score = (wordScores?.get(word.id) ?? 4)
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
        )
      })}

      <DailyReviewModal open={reviewOpen} onClose={() => setReviewOpen(false)} lang={lang} />
    </div>
  )
}
