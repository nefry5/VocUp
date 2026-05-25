'use client'

import Link from 'next/link'
import { User, Trophy } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/authStore'
import { useLangStore } from '@/lib/stores/langStore'
import { RANK_NAMES, RANK_COLORS } from '@/lib/game/rank'
import { WORDS } from '@/lib/data/words'
import { isMastered } from '@/lib/game/score'
import type { Lang } from '@/lib/supabase/types'

const LANGS: Array<{ id: Lang; name: string; flag: string; color: string }> = [
  { id: 'en', name: 'Anglais', flag: '🇬🇧', color: 'var(--lang-en)' },
  { id: 'de', name: 'Allemand', flag: '🇩🇪', color: 'var(--lang-de)' },
  { id: 'es', name: 'Espagnol', flag: '🇪🇸', color: 'var(--lang-es)' },
  { id: 'it', name: 'Italien', flag: '🇮🇹', color: 'var(--lang-it)' },
]

function LangTile({ lang }: { lang: typeof LANGS[0] }) {
  const langState = useLangStore(s => s.langStates[lang.id])
  const wordScores = useLangStore(s => s.wordScores[lang.id])

  const tier = langState?.rank_tier ?? 0
  const masteredCount = WORDS.filter(w => isMastered((wordScores?.get(w.id) ?? 4))).length

  return (
    <Link href={`/${lang.id}/lesson`}>
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 hover:border-[var(--action)] transition-all duration-150 active:scale-[0.98] group overflow-hidden">
        {/* Accent stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" style={{ backgroundColor: lang.color }} />

        <div className="flex items-start justify-between mb-4">
          <span className="text-3xl">{lang.flag}</span>
          <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ color: RANK_COLORS[tier], backgroundColor: `${RANK_COLORS[tier]}20` }}>
            {RANK_NAMES[tier]}
          </span>
        </div>

        <h3 className="text-lg font-bold text-text mb-3">{lang.name}</h3>

        {/* Mastery bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>Mots maîtrisés</span>
            <span className="tabular-nums">{masteredCount}/440</span>
          </div>
          <div className="h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(masteredCount / 440) * 100}%`, backgroundColor: lang.color }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { user, isGuest, profile } = useAuthStore()

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-text">VocUp</h1>
          {profile && (
            <p className="text-sm text-[var(--text-muted)]">Bonjour, {profile.display_name} !</p>
          )}
          {isGuest && (
            <p className="text-sm text-[var(--text-muted)]">Mode invité</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(user || !isGuest) && (
            <Link href="/leaderboard">
              <button className="p-2 rounded-xl text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors" aria-label="Classement">
                <Trophy size={22} />
              </button>
            </Link>
          )}
          <Link href="/profile">
            <button className="p-2 rounded-xl text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors" aria-label="Profil">
              <User size={22} />
            </button>
          </Link>
        </div>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {LANGS.map(lang => (
          <LangTile key={lang.id} lang={lang} />
        ))}
      </div>

      {/* Guest upsell */}
      {isGuest && (
        <div className="mt-6 bg-[var(--surface)] border border-[var(--action)]/30 rounded-2xl p-4 text-center">
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Crée un compte pour sauvegarder ta progression et accéder au classement.
          </p>
          <Link href="/signup">
            <button className="text-action text-sm font-semibold hover:underline">
              Créer un compte →
            </button>
          </Link>
        </div>
      )}
    </div>
  )
}
