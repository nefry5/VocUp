'use client'

import { useState } from 'react'
import Link from 'next/link'
import { User, Trophy, X } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/authStore'
import { useLangStore } from '@/lib/stores/langStore'
import { RANK_NAMES, RANK_COLORS } from '@/lib/game/rank'
import { WORDS } from '@/lib/data/words'
import { isMastered } from '@/lib/game/score'
import type { Lang } from '@/lib/supabase/types'

const LANGS: Array<{ id: Lang; name: string; flag: string }> = [
  { id: 'en', name: 'Anglais', flag: '🇬🇧' },
  { id: 'de', name: 'Allemand', flag: '🇩🇪' },
  { id: 'es', name: 'Espagnol', flag: '🇪🇸' },
  { id: 'it', name: 'Italien', flag: '🇮🇹' },
]

const RANK_EMOJIS: Record<number, string> = {
  0: '❓',
  1: '🪵', 2: '🪵', 3: '🪵',
  4: '🥉', 5: '🥉', 6: '🥉',
  7: '🥈', 8: '🥈', 9: '🥈',
  10: '🥇', 11: '🥇', 12: '🥇',
  13: '💎', 14: '💎', 15: '💎',
  16: '🏆', 17: '🏆', 18: '🏆',
  19: '☀️',
}

function LangTile({ lang }: { lang: typeof LANGS[0] }) {
  const langState = useLangStore(s => s.langStates[lang.id])
  const wordScores = useLangStore(s => s.wordScores[lang.id])

  const tier = langState?.rank_tier ?? 0
  const coins = langState?.coins ?? 0
  const masteredCount = WORDS.filter(w => isMastered((wordScores?.get(w.id) ?? 4))).length
  const pct = (masteredCount / 440) * 100
  const rankEmoji = RANK_EMOJIS[tier] ?? '❓'

  return (
    <Link href={`/${lang.id}/lesson`}>
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--action)]/50 transition-all duration-200 active:scale-[0.97] group overflow-hidden flex flex-col gap-3"
        style={{ minHeight: '200px' }}>
        {/* Subtle glow on hover */}
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, var(--action)08, transparent 70%)' }} />

        {/* Coin counter — top right */}
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-[var(--surface-3)] rounded-lg px-2 py-1">
          <span className="text-xs">🪙</span>
          <span className="text-xs font-bold tabular-nums text-[var(--text-muted)]">{coins.toLocaleString('fr-FR')}</span>
        </div>

        {/* Flag — large, centered */}
        <div className="flex justify-center pt-2">
          <span className="text-5xl">{lang.flag}</span>
        </div>

        {/* Lang name */}
        <p className="text-center font-bold text-text text-sm">{lang.name}</p>

        {/* Rank */}
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-base">{rankEmoji}</span>
          <span className="text-xs font-bold" style={{ color: RANK_COLORS[tier] }}>{RANK_NAMES[tier]}</span>
        </div>

        {/* Mastery progress bar */}
        <div className="space-y-1 mt-auto">
          <div className="flex justify-between text-xs text-[var(--text-dim)]">
            <span>Maîtrisés</span>
            <span className="tabular-nums font-semibold text-[var(--text-muted)]">{masteredCount}/440</span>
          </div>
          <div className="h-2 bg-[var(--surface-3)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: pct > 0
                  ? 'linear-gradient(90deg, var(--action), #22c4a3)'
                  : 'transparent',
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { user, isGuest, profile } = useAuthStore()
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false)

  const handleLeaderboardClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault()
      setShowLeaderboardModal(true)
    }
  }

  return (
    <div className="min-h-screen p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-4 mb-6">
        <div>
          <h1 className="text-2xl font-black"
            style={{ background: 'linear-gradient(135deg, var(--action), var(--reward))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            VocUp
          </h1>
          {profile && (
            <p className="text-sm text-[var(--text-muted)]">Bonjour, <span className="text-text font-semibold">{profile.display_name}</span> ! 👋</p>
          )}
          {isGuest && (
            <p className="text-sm text-[var(--text-muted)]">Mode invité</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Leaderboard — always visible */}
          <Link href={user ? '/leaderboard' : '#'} onClick={handleLeaderboardClick}>
            <button className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--reward)] hover:bg-[var(--reward)]/10 transition-all duration-150" aria-label="Classement">
              <Trophy size={22} />
            </button>
          </Link>
          <Link href="/profile">
            <button className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-action hover:bg-action/10 transition-all duration-150" aria-label="Profil">
              <User size={22} />
            </button>
          </Link>
        </div>
      </div>

      {/* Section title */}
      <div className="mb-3">
        <p className="text-xs font-bold text-[var(--text-dim)] uppercase tracking-widest">Choisir une langue</p>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        {LANGS.map(lang => (
          <LangTile key={lang.id} lang={lang} />
        ))}
      </div>

      {/* Guest upsell */}
      {isGuest && (
        <div className="mt-6 border border-dashed border-[var(--reward)]/40 rounded-2xl p-5 text-center space-y-3"
          style={{ background: 'linear-gradient(135deg, var(--reward)08, var(--action)08)' }}>
          <p className="text-2xl">🚀</p>
          <p className="text-sm text-[var(--text-muted)]">
            Crée un compte pour sauvegarder ta progression et rivaliser au classement mondial.
          </p>
          <Link href="/signup">
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all"
              style={{ background: 'linear-gradient(135deg, var(--reward), var(--action))', color: '#0e0920' }}>
              Créer un compte gratuit →
            </button>
          </Link>
        </div>
      )}

      {/* Leaderboard locked modal */}
      {showLeaderboardModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowLeaderboardModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowLeaderboardModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-dim)] hover:text-text">
              <X size={18} />
            </button>
            <div className="text-center space-y-2">
              <span className="text-4xl">🏆</span>
              <h2 className="text-lg font-black text-text">Classement mondial</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Le classement est réservé aux comptes inscrits. Crée un compte gratuit pour te mesurer aux autres joueurs !
              </p>
            </div>
            <div className="space-y-2">
              <Link href="/signup" onClick={() => setShowLeaderboardModal(false)}>
                <button className="w-full py-3 rounded-xl font-bold text-sm"
                  style={{ background: 'linear-gradient(135deg, var(--reward), var(--action))', color: '#0e0920' }}>
                  Créer un compte gratuit
                </button>
              </Link>
              <Link href="/login" onClick={() => setShowLeaderboardModal(false)}>
                <button className="w-full py-3 rounded-xl font-semibold text-sm text-[var(--text-muted)] hover:text-text transition-colors">
                  Se connecter
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
