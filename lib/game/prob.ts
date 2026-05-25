import type { Word } from '@/lib/data/words'

/** Weight for a word: (11 - score)^2 */
export function wordWeight(score: number): number {
  return Math.pow(11 - score, 2)
}

/** Weighted random pick from unlocked words */
export function pickWord(
  words: Word[],
  scores: Map<string, number>  // word_id → score (default 4)
): Word {
  if (words.length === 0) throw new Error('empty word pool')

  const weights = words.map(w => wordWeight(scores.get(w.id) ?? 4))
  const total = weights.reduce((a, b) => a + b, 0)
  let rand = Math.random() * total

  for (let i = 0; i < words.length; i++) {
    rand -= weights[i]
    if (rand <= 0) return words[i]
  }

  return words[words.length - 1]
}

/** 60% FR→target, 40% target→FR */
export function pickDirection(): 'fr_to_target' | 'target_to_fr' {
  return Math.random() < 0.6 ? 'fr_to_target' : 'target_to_fr'
}

/** Pick N lowest-score words (ties broken by last_seen_at ascending) */
export function pickLowestScore(
  words: Word[],
  scores: Map<string, number>,
  n: number
): Word[] {
  return [...words]
    .sort((a, b) => (scores.get(a.id) ?? 4) - (scores.get(b.id) ?? 4))
    .slice(0, n)
}

/** Compute XP for a correct answer */
export function computeXP(
  scoreAtShow: number,
  streak: number,
  streakBoosterMult: number = 1,
  speedBonus: boolean = false,
  dailyChallenge: boolean = false,
  xpBoosterMult: number = 1
): number {
  const streakBonus = Math.floor((streak / 2) * streakBoosterMult)
  let base = scoreAtShow + streakBonus
  if (speedBonus) base += 1
  if (dailyChallenge) base *= 5
  return Math.round(base * xpBoosterMult)
}

/** Streak flame stages — index = stage (0..15) */
export const STREAK_THRESHOLDS = [0, 5, 10, 20, 30, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 10000]

export function getStreakStage(streak: number): number {
  let stage = 0
  for (let i = 1; i < STREAK_THRESHOLDS.length; i++) {
    if (streak >= STREAK_THRESHOLDS[i]) stage = i
    else break
  }
  return Math.min(stage, 15)
}
