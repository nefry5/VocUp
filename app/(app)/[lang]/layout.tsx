'use client'

import { useParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useLangStore } from '@/lib/stores/langStore'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { RANK_NAMES, RANK_COLORS, getTierProgress } from '@/lib/game/rank'
import type { Lang } from '@/lib/supabase/types'
import { BookOpen, Zap, Target, ShoppingBag, ChevronLeft } from 'lucide-react'

const TABS = [
  { id: 'lesson', label: 'Leçon', icon: BookOpen },
  { id: 'quiz', label: 'Quiz', icon: Zap },
  { id: 'quests', label: 'Quêtes', icon: Target },
  { id: 'shop', label: 'Boutique', icon: ShoppingBag },
] as const

const LANG_NAMES: Record<Lang, string> = {
  en: 'Anglais',
  de: 'Allemand',
  es: 'Espagnol',
  it: 'Italien',
}

const LANG_FLAGS: Record<Lang, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  es: '🇪🇸',
  it: '🇮🇹',
}

export default function LangLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const lang = params.lang as Lang

  const langState = useLangStore(s => s.langStates[lang])
  const tier = langState?.rank_tier ?? 0
  const xp = langState?.xp ?? 0
  const coins = langState?.coins ?? 0

  const progress = getTierProgress(xp, tier)

  // Detect active tab from pathname
  const activeTab = TABS.find(t => pathname.includes(`/${t.id}`))?.id ?? 'lesson'

  // Hide tab bar on quiz page (focus mode handled there)
  const isQuiz = activeTab === 'quiz'

  return (
    <div className="min-h-screen flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href="/home" aria-label="Retour">
            <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
              <ChevronLeft size={20} />
            </button>
          </Link>

          {/* Rank + lang */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-lg">{LANG_FLAGS[lang]}</span>
            <span className="font-semibold text-text text-sm truncate">{LANG_NAMES[lang]}</span>
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
              style={{ color: RANK_COLORS[tier], backgroundColor: `${RANK_COLORS[tier]}20` }}
            >
              {RANK_NAMES[tier]}
            </span>
          </div>

          {/* Coin counter */}
          <div className="flex items-center gap-1 tabular-nums text-sm font-bold text-[var(--reward)]">
            <span>🪙</span>
            <span>{coins.toLocaleString('fr-FR')}</span>
          </div>
        </div>

        {/* XP progress bar */}
        <ProgressBar
          value={progress}
          color={RANK_COLORS[tier] as string}
          height={3}
          animated
          label={`XP vers ${RANK_NAMES[Math.min(19, tier + 1) as keyof typeof RANK_NAMES]}`}
          className="mt-2"
        />
      </header>

      {/* Tab nav */}
      {!isQuiz && (
        <nav className="flex border-b border-[var(--border)] bg-[var(--bg)]">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <Link
                key={tab.id}
                href={`/${lang}/${tab.id}`}
                className={[
                  'flex-1 flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors',
                  isActive
                    ? 'text-action border-b-2 border-action'
                    : 'text-[var(--text-muted)] hover:text-text',
                ].join(' ')}
              >
                <Icon size={18} />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      )}

      {/* Page content */}
      <main className="flex-1 p-4">
        {children}
      </main>
    </div>
  )
}
