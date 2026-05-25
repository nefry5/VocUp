export type Lang = 'en' | 'de' | 'es' | 'it'
export type RankTier = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19

export interface Profile {
  id: string
  handle: string
  display_name: string
  photo_url: string | null
  showcase_lang: Lang | null
  pinned_achievements: string[]
  active_session_id: string | null
  daily_login_streak: number
  last_login_day: string | null
  created_at: string
}

export interface LangState {
  user_id: string
  lang: Lang
  xp: number
  coins: number
  shards: number
  unlock_tokens: number
  rank_tier: RankTier
  active_skin_id: string | null
  active_theme_id: string | null
  inventory_skins: string[]
  inventory_themes: string[]
  unlocked_subcats: string[]
  max_streak: number
  total_cards: number
  correct_cards: number
  time_spent_s: number
  active_boosters: BoosterMap
  daily_challenge: DailyChallenge
}

export interface BoosterMap {
  coin?: Booster
  luck?: Booster
  xp?: Booster
  streak?: Booster
}

export interface Booster {
  mult: number
  until: string  // ISO timestamptz
}

export interface DailyChallenge {
  date?: string
  word_key?: string
  claimed?: boolean
}

export interface WordScore {
  user_id: string
  lang: Lang
  word_id: string
  score: number
  last_seen_at: string | null
}

export interface QuestState {
  user_id: string
  lang: Lang
  quest_id: string
  period: 'daily' | 'weekly'
  period_key: string
  progress: number
  claimed: boolean
}

export interface Achievement {
  user_id: string
  achievement_id: string
  unlocked_at: string
}

export interface LeaderboardRow {
  user_id: string
  lang: Lang
  handle: string
  display_name: string
  photo_url: string | null
  xp: number
  rank_tier: RankTier
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any
