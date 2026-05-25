'use client'

import { useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'
import { useLangStore } from '@/lib/stores/langStore'
import { createClient } from '@/lib/supabase/client'
import { QUEST_DEFS, getActiveQuests, getPeriodKey } from '@/lib/game/quests'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { useState, useEffect } from 'react'
import type { Lang, QuestState } from '@/lib/supabase/types'
import { CheckCircle2, Clock, Zap } from 'lucide-react'

export default function QuestsPage() {
  const { lang } = useParams() as { lang: Lang }
  const { user } = useAuthStore()
  const langState = useLangStore(s => s.langStates[lang])
  const supabase = createClient()
  const [questStates, setQuestStates] = useState<QuestState[]>([])
  const [claiming, setClaiming] = useState<string | null>(null)

  const activeQuests = getActiveQuests(lang, new Date())
  const tier = langState?.rank_tier ?? 0
  const rankMult = 1 + 0.15 * tier

  useEffect(() => {
    if (!user) return
    const fetchQuests = async () => {
      const { data } = await supabase
        .from('quest_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('lang', lang)
      setQuestStates(data ?? [])
    }
    fetchQuests()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, lang])

  const getQuestState = (questId: string, period: 'daily' | 'weekly') => {
    const key = getPeriodKey(period)
    return questStates.find(qs => qs.quest_id === questId && qs.period_key === key)
  }

  const handleClaim = async (questId: string, period: 'daily' | 'weekly') => {
    if (!user) return
    const key = getPeriodKey(period)
    setClaiming(questId)
    await supabase.rpc('claim_quest', { p_lang: lang, p_quest_id: questId, p_period_key: key })
    // Refresh
    const { data } = await supabase.from('quest_state').select('*').eq('user_id', user.id).eq('lang', lang)
    setQuestStates(data ?? [])
    setClaiming(null)
  }

  const daily = activeQuests.filter(q => q.period === 'daily')
  const weekly = activeQuests.filter(q => q.period === 'weekly')

  function QuestCard({ quest }: { quest: typeof QUEST_DEFS[0] }) {
    const state = getQuestState(quest.id, quest.period)
    const progress = state?.progress ?? 0
    const claimed = state?.claimed ?? false
    const canClaim = !claimed && progress >= quest.target

    const xpScaled = Math.round(quest.xpReward * rankMult)
    const coinScaled = Math.round(quest.coinReward * rankMult)

    return (
      <div className={`bg-[var(--surface)] border rounded-2xl p-4 ${claimed ? 'opacity-60 border-[var(--border)]' : 'border-[var(--border)] hover:border-[var(--action)]/40 transition-colors'}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className="text-sm font-semibold text-text leading-tight">{quest.label}</p>
          {claimed && <CheckCircle2 size={18} className="text-action shrink-0" />}
        </div>

        {/* Progress bar */}
        <ProgressBar
          value={quest.target > 0 ? Math.min(100, (progress / quest.target) * 100) : 0}
          color={claimed ? 'var(--action)' : 'var(--action)'}
          height={4}
          animated
          className="mb-2"
        />
        <p className="text-xs text-[var(--text-muted)] tabular-nums mb-3">
          {Math.min(progress, quest.target)} / {quest.target}
        </p>

        {/* Rewards */}
        <div className="flex items-center gap-3 text-xs">
          {xpScaled > 0 && (
            <span className="flex items-center gap-1 text-score-blue font-semibold">
              <Zap size={12} />+{xpScaled} XP
            </span>
          )}
          {coinScaled > 0 && (
            <span className="flex items-center gap-1 text-[var(--reward)] font-semibold">
              🪙 +{coinScaled}
            </span>
          )}
        </div>

        {canClaim && (
          <Button
            size="sm"
            fullWidth
            className="mt-3"
            loading={claiming === quest.id}
            onClick={() => handleClaim(quest.id, quest.period)}
          >
            Récupérer
          </Button>
        )}
      </div>
    )
  }

  // Reset countdown
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setUTCHours(24, 0, 0, 0)
  const hoursLeft = Math.floor((nextMidnight.getTime() - now.getTime()) / 3600000)
  const minLeft = Math.floor(((nextMidnight.getTime() - now.getTime()) % 3600000) / 60000)

  return (
    <div className="space-y-6">
      {/* Daily */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-text">Quêtes Journalières</h2>
          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Clock size={12} />
            <span className="tabular-nums">{hoursLeft}h {minLeft}m</span>
          </div>
        </div>
        <div className="space-y-3">
          {daily.map(q => <QuestCard key={q.id} quest={q} />)}
        </div>
      </section>

      {/* Weekly */}
      <section>
        <h2 className="font-bold text-text mb-3">Quêtes Hebdomadaires</h2>
        <div className="space-y-3">
          {weekly.map(q => <QuestCard key={q.id} quest={q} />)}
        </div>
      </section>

      {!user && (
        <p className="text-center text-sm text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          Connecte-toi pour sauvegarder ta progression de quêtes.
        </p>
      )}
    </div>
  )
}
