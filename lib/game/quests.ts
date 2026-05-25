import type { Lang } from '@/lib/supabase/types'

export type QuestType =
  | 'answer_N_cards'
  | 'streak_N'
  | 'earn_N_coins'
  | 'master_N_words'
  | 'complete_subcat'
  | 'open_chest'
  | 'win_rate_X_over_Y_cards'

export interface QuestDef {
  id: string
  type: QuestType
  label: string
  target: number
  period: 'daily' | 'weekly'
  xpReward: number
  coinReward: number
}

// Base rewards (scaled by rank in RPC)
export const QUEST_DEFS: QuestDef[] = [
  // Daily
  { id: 'daily_cards_20', type: 'answer_N_cards', label: 'Répondre à 20 cartes', target: 20, period: 'daily', xpReward: 15, coinReward: 50 },
  { id: 'daily_cards_50', type: 'answer_N_cards', label: 'Répondre à 50 cartes', target: 50, period: 'daily', xpReward: 30, coinReward: 100 },
  { id: 'daily_streak_10', type: 'streak_N', label: 'Atteindre un streak de 10', target: 10, period: 'daily', xpReward: 20, coinReward: 80 },
  // Weekly
  { id: 'weekly_cards_200', type: 'answer_N_cards', label: 'Répondre à 200 cartes', target: 200, period: 'weekly', xpReward: 100, coinReward: 400 },
  { id: 'weekly_cards_500', type: 'answer_N_cards', label: 'Répondre à 500 cartes', target: 500, period: 'weekly', xpReward: 200, coinReward: 800 },
  { id: 'weekly_streak_30', type: 'streak_N', label: 'Atteindre un streak de 30', target: 30, period: 'weekly', xpReward: 150, coinReward: 500 },
  { id: 'weekly_earn_5000', type: 'earn_N_coins', label: 'Gagner 5000 pièces', target: 5000, period: 'weekly', xpReward: 175, coinReward: 0 },
  { id: 'weekly_winrate_80_100', type: 'win_rate_X_over_Y_cards', label: '80% de bonnes réponses sur 100 cartes', target: 80, period: 'weekly', xpReward: 120, coinReward: 300 },
  { id: 'weekly_master_5', type: 'master_N_words', label: 'Maîtriser 5 mots', target: 5, period: 'weekly', xpReward: 200, coinReward: 600 },
]

// 3 daily + 5 weekly per lang (deterministic by lang+date)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getActiveQuests(_lang: Lang, _date: Date): QuestDef[] {
  const daily = QUEST_DEFS.filter(q => q.period === 'daily')
  const weekly = QUEST_DEFS.filter(q => q.period === 'weekly')
  return [...daily.slice(0, 3), ...weekly.slice(0, 5)]
}

/** ISO period key: 'YYYY-MM-DD' for daily, 'YYYY-WNN' for weekly */
export function getPeriodKey(period: 'daily' | 'weekly', date: Date = new Date()): string {
  if (period === 'daily') {
    return date.toISOString().slice(0, 10)
  }
  // ISO week: Monday-based
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`
}
