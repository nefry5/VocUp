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

/** CSS clip-path shield badge for rank */
function RankBadge({ tier }: { tier: number }) {
  const color = RANK_COLORS[tier] as string
  const name = RANK_NAMES[tier]

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Shield shape */}
      <div className="relative" style={{ width: 40, height: 44 }}>
        {/* Shield background glow */}
        <div
          className="absolute inset-0"
          style={{
            background: color,
            clipPath: 'polygon(50% 0%, 96% 18%, 96% 62%, 50% 100%, 4% 62%, 4% 18%)',
            opacity: 0.25,
          }}
        />
        {/* Shield border */}
        <div
          className="absolute inset-0"
          style={{
            background: color,
            clipPath: 'polygon(50% 0%, 96% 18%, 96% 62%, 50% 100%, 4% 62%, 4% 18%)',
            opacity: 0.5,
            transform: 'scale(0.88)',
            transformOrigin: 'center',
          }}
        />
        {/* Shield inner fill */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(160deg, ${color}30, ${color}10)`,
            clipPath: 'polygon(50% 0%, 96% 18%, 96% 62%, 50% 100%, 4% 62%, 4% 18%)',
            transform: 'scale(0.82)',
            transformOrigin: 'center',
          }}
        />
        {/* Rank tier number inside shield */}
        <div className="absolute inset-0 flex items-center justify-center pb-1">
          <span
            className="text-xs font-black tabular-nums"
            style={{ color, textShadow: `0 0 8px ${color}60` }}
          >
            {tier === 0 ? '?' : tier <= 3 ? 'I II III'.split(' ')[tier - 1] : tier <= 6 ? 'I II III'.split(' ')[tier - 4] : tier <= 9 ? 'I II III'.split(' ')[tier - 7] : tier <= 12 ? 'I II III'.split(' ')[tier - 10] : tier <= 15 ? 'I II III'.split(' ')[tier - 13] : tier <= 18 ? 'I II III'.split(' ')[tier - 16] : '★'}
          </span>
        </div>
      </div>
      {/* Rank name */}
      <span className="text-xs font-bold tabular-nums" style={{ color }}>
        {name}
      </span>
    </div>
  )
}

function LangTile({ lang }: { lang: typeof LANGS[0] }) {
  const langState = useLangStore(s => s.langStates[lang.id])
  const wordScores = useLangStore(s => s.wordScores[lang.id])

  const tier = langState?.rank_tier ?? 0
  const coins = langState?.coins ?? 0
  const masteredCount = WORDS.filter(w => isMastered((wordScores?.get(w.id) ?? 4))).length
  const pct = Math.round((masteredCount / 440) * 100)

  return (
    <Link href={`/${lang.id}/lesson`}>
      <div
        className="relative bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden flex flex-col items-center gap-3 hover:border-[var(--border)] transition-all duration-200 active:scale-[0.97] group"
        style={{ paddingTop: 12, paddingBottom: 14, paddingLeft: 12, paddingRight: 12, minHeight: 210 }}
      >
        {/* Coin counter — top right */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-[var(--surface-2)] rounded-lg px-2 py-0.5">
          <span className="text-xs">🪙</span>
          <span className="text-xs font-bold tabular-nums text-[var(--text-muted)]">
            {coins.toLocaleString('fr-FR')}
          </span>
        </div>

        {/* Flag */}
        <span className="text-5xl mt-2">{lang.flag}</span>

        {/* Lang name */}
        <p className="font-black text-text text-base tracking-tight">{lang.name}</p>

        {/* Rank badge */}
        <RankBadge tier={tier} />

        {/* Progress bar + label */}
        <div className="w-full space-y-1 mt-auto">
          <div className="h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: pct > 0
                  ? 'linear-gradient(90deg, var(--action), #22c4a3)'
                  : 'transparent',
                transition: 'width 0.7s ease',
              }}
            />
          </div>
          <p className="text-center text-xs text-[var(--text-dim)] tabular-nums">
            {masteredCount}/440 · {pct}%
          </p>
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
      <div className="flex items-center justify-between py-4 mb-5">
        <div>
          <h1
            className="text-2xl font-black"
            style={{
              background: 'linear-gradient(135deg, var(--action), var(--reward))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            VocUp
          </h1>
          {profile && (
            <p className="text-sm text-[var(--text-muted)]">
              Bonjour, <span className="text-text font-semibold">{profile.display_name}</span> 👋
            </p>
          )}
          {isGuest && <p className="text-sm text-[var(--text-muted)]">Mode invité</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <Link href={user ? '/leaderboard' : '#'} onClick={handleLeaderboardClick}>
            <button
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--reward)] hover:bg-[var(--reward)]/10 transition-all"
              aria-label="Classement"
            >
              <Trophy size={22} />
            </button>
          </Link>
          <Link href="/profile">
            <button
              className="p-2.5 rounded-xl text-[var(--text-muted)] hover:text-action hover:bg-action/10 transition-all"
              aria-label="Profil"
            >
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
        <div
          className="mt-6 rounded-2xl p-5 text-center space-y-3 border border-dashed border-[var(--reward)]/40"
          style={{ background: 'linear-gradient(135deg, var(--reward)08, var(--action)08)' }}
        >
          <p className="text-2xl">🚀</p>
          <p className="text-sm text-[var(--text-muted)]">
            Crée un compte pour sauvegarder ta progression et rivaliser au classement mondial.
          </p>
          <Link href="/signup">
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--reward), var(--action))',
                color: '#0e0920',
              }}
            >
              Créer un compte gratuit →
            </button>
          </Link>
        </div>
      )}

      {/* Leaderboard locked modal */}
      {showLeaderboardModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowLeaderboardModal(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowLeaderboardModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-[var(--text-dim)] hover:text-text"
            >
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
                <button
                  className="w-full py-3 rounded-xl font-bold text-sm"
                  style={{
                    background: 'linear-gradient(135deg, var(--reward), var(--action))',
                    color: '#0e0920',
                  }}
                >
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
