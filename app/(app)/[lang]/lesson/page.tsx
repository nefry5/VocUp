'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { ChevronDown, ChevronRight, Lock, Volume2, BookOpen } from 'lucide-react'
import { CATEGORIES, SUBCATEGORIES, getWordsBySub } from '@/lib/data/words'
import { useLangStore } from '@/lib/stores/langStore'
import { scoreBadgeClass } from '@/lib/game/score'
import { Button } from '@/components/ui/Button'
import { DailyReviewModal } from '@/components/game/DailyReviewModal'
import type { Lang } from '@/lib/supabase/types'

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
    <div className="space-y-3">
      {/* Daily review btn */}
      <Button variant="secondary" fullWidth onClick={() => setReviewOpen(true)}>
        <BookOpen size={16} />
        Révision du jour
      </Button>

      {/* Categories accordion */}
      {CATEGORIES.map(cat => {
        const catExpanded = expandedCats.has(cat.id)
        const subs = SUBCATEGORIES.filter(s => s.catId === cat.id)

        return (
          <div key={cat.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-2)] transition-colors"
            >
              <span className="font-bold text-text text-sm">{cat.name}</span>
              {catExpanded ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
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
                    className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors ${unlocked ? 'hover:bg-[var(--surface-2)] cursor-pointer' : 'cursor-default opacity-60'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {!unlocked && <Lock size={13} className="text-[var(--text-dim)] shrink-0" />}
                      <span className="text-sm font-medium text-text truncate">{sub.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!unlocked && (
                        <span className="text-xs text-[var(--text-dim)]">{sub.wordCount} mots</span>
                      )}
                      {unlocked && (
                        <>
                          <span className="text-xs text-[var(--text-muted)]">{sub.wordCount}</span>
                          {subExpanded
                            ? <ChevronDown size={14} className="text-[var(--text-muted)]" />
                            : <ChevronRight size={14} className="text-[var(--text-muted)]" />}
                        </>
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
                        className="flex items-center gap-3 px-4 py-2 border-t border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors"
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
