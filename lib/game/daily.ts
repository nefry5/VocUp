/** Daily login reward calculator */

export type BoosterType = 'coin' | 'luck' | 'xp' | 'streak'

const BOOSTER_SLOTS: BoosterType[] = ['coin', 'luck', 'xp', 'streak']

export interface DailyLoginReward {
  day: number
  boosterType: BoosterType
  count: number     // how many ×2 boosters
  mult: number      // always 2
}

export function computeDailyLoginReward(day: number): DailyLoginReward {
  const slot = (day - 1) % 4
  const cycleIndex = Math.ceil(day / 4)
  return {
    day,
    boosterType: BOOSTER_SLOTS[slot],
    count: cycleIndex,
    mult: 2,
  }
}

/** Check if today's login reward should be shown */
export function shouldShowLoginReward(lastLoginDay: string | null): boolean {
  const today = new Date().toISOString().slice(0, 10)
  return lastLoginDay !== today
}

/** Did streak continue (yesterday or same day) */
export function checkStreakContinued(lastLoginDay: string | null): boolean {
  if (!lastLoginDay) return false
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  return lastLoginDay === yesterday
}
