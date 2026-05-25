'use client'

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/stores/authStore'
import { createClient } from '@/lib/supabase/client'
import { RANK_NAMES, RANK_COLORS } from '@/lib/game/rank'
import type { Lang, LeaderboardRow } from '@/lib/supabase/types'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const LANGS: Array<{ id: Lang; name: string; flag: string }> = [
  { id: 'en', name: 'Anglais', flag: '🇬🇧' },
  { id: 'de', name: 'Allemand', flag: '🇩🇪' },
  { id: 'es', name: 'Espagnol', flag: '🇪🇸' },
  { id: 'it', name: 'Italien', flag: '🇮🇹' },
]

export default function LeaderboardPage() {
  const { user } = useAuthStore()
  const supabase = createClient()
  const [lang, setLang] = useState<Lang>('en')
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [userRow, setUserRow] = useState<LeaderboardRow | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      // Refresh materialized view
      await supabase.rpc('refresh_leaderboard')
      // Fetch top 100
      const { data: top } = await supabase
        .from('leaderboard_view')
        .select('*')
        .eq('lang', lang)
        .order('xp', { ascending: false })
        .limit(100)
      setRows(top ?? [])

      // Fetch user rank if outside top 100
      if (user) {
        const userInTop = (top ?? []).find(r => r.user_id === user.id)
        if (!userInTop) {
          const { data: myRow } = await supabase
            .from('leaderboard_view')
            .select('*')
            .eq('lang', lang)
            .eq('user_id', user.id)
            .single()
          setUserRow(myRow ?? null)
        } else {
          setUserRow(null)
        }
      }
      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, user])

  // Build display rows: top 100 + window around user if outside
  const displayRows = rows
  // If user is outside top 100, show ±3 window
  const windowRows = userRow
    ? [userRow]
    : []

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <div className="flex items-center gap-3 py-2">
        <Link href="/home">
          <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
            <ChevronLeft size={20} />
          </button>
        </Link>
        <h1 className="text-xl font-bold text-text">Classement</h1>
      </div>

      {/* Lang switcher */}
      <div className="flex gap-2">
        {LANGS.map(l => (
          <button
            key={l.id}
            onClick={() => setLang(l.id)}
            className={[
              'flex-1 py-2 rounded-xl text-sm font-semibold transition-all',
              lang === l.id
                ? 'bg-action text-bg'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-text',
            ].join(' ')}
          >
            {l.flag}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-1">
          {displayRows.map((row, i) => {
            const isMe = user && row.user_id === user.id
            return (
              <div
                key={row.user_id}
                className={[
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors',
                  isMe ? 'bg-action/10 border border-action/30' : 'bg-[var(--surface)] border border-transparent hover:border-[var(--border)]',
                ].join(' ')}
              >
                {/* Rank number */}
                <span className={`text-sm font-black tabular-nums w-7 text-center ${i < 3 ? 'text-[var(--reward)]' : 'text-[var(--text-muted)]'}`}>
                  {i + 1}
                </span>

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-action to-[var(--reward)] overflow-hidden flex items-center justify-center shrink-0">
                  {row.photo_url
                    ? <img src={row.photo_url} alt="avatar" className="w-full h-full object-cover" />
                    : <span className="text-bg text-xs font-black">{row.display_name[0]?.toUpperCase()}</span>
                  }
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">
                    {row.display_name}
                    {isMe && <span className="text-action text-xs ml-1">(moi)</span>}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate">@{row.handle}</p>
                </div>

                {/* Rank badge */}
                <span className="text-xs font-bold px-2 py-0.5 rounded-md shrink-0"
                  style={{ color: RANK_COLORS[row.rank_tier], backgroundColor: `${RANK_COLORS[row.rank_tier]}20` }}>
                  {RANK_NAMES[row.rank_tier]}
                </span>

                {/* XP */}
                <span className="text-xs font-black text-[var(--text-muted)] tabular-nums shrink-0">
                  {row.xp.toLocaleString('fr-FR')} XP
                </span>
              </div>
            )
          })}

          {/* Separator + user window if outside top 100 */}
          {windowRows.length > 0 && (
            <>
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 h-px border-t border-dashed border-[var(--border)]" />
                <span className="text-xs text-[var(--text-dim)]">…</span>
                <div className="flex-1 h-px border-t border-dashed border-[var(--border)]" />
              </div>
              {windowRows.map(row => (
                <div key={row.user_id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-action/10 border border-action/30">
                  <span className="text-sm font-black tabular-nums w-7 text-center text-[var(--text-muted)]">?</span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-action to-[var(--reward)] flex items-center justify-center shrink-0">
                    <span className="text-bg text-xs font-black">{row.display_name[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text">{row.display_name} <span className="text-action text-xs">(moi)</span></p>
                    <p className="text-xs text-[var(--text-muted)]">@{row.handle}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ color: RANK_COLORS[row.rank_tier], backgroundColor: `${RANK_COLORS[row.rank_tier]}20` }}>
                    {RANK_NAMES[row.rank_tier]}
                  </span>
                  <span className="text-xs font-black text-[var(--text-muted)] tabular-nums">{row.xp.toLocaleString('fr-FR')} XP</span>
                </div>
              ))}
            </>
          )}

          {rows.length === 0 && !loading && (
            <p className="text-center text-[var(--text-muted)] py-8 text-sm">
              Aucun joueur pour cette langue encore.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
