/** Score bounds */
export const SCORE_MIN = 0
export const SCORE_MAX = 10
export const SCORE_DEFAULT = 4
export const SCORE_MASTERED = 8

/** Apply quiz result to score */
export function updateScore(current: number, correct: boolean): number {
  if (correct) return Math.min(SCORE_MAX, current + 1)
  return Math.max(SCORE_MIN, current - 2)
}

/** Color class for score */
export function scoreColor(score: number): string {
  if (score <= 4) return 'var(--score-red)'
  if (score <= 6) return 'var(--score-yellow)'
  if (score <= 9) return 'var(--score-green)'
  return 'var(--score-blue)'
}

export function scoreBadgeClass(score: number): string {
  if (score <= 4) return 'bg-score-red/20 text-score-red'
  if (score <= 6) return 'bg-score-yellow/20 text-score-yellow'
  if (score <= 9) return 'bg-score-green/20 text-score-green'
  return 'bg-score-blue/20 text-score-blue'
}

export function isMastered(score: number): boolean {
  return score >= SCORE_MASTERED
}
