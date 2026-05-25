import type { RankTier } from '@/lib/supabase/types'

/** XP thresholds (cumulative) for tiers 1..19 */
export const XP_THRESHOLDS: number[] = [
  0,  // tier 0 = unranked (base)
  ...Array.from({ length: 19 }, (_, i) => {
    const n = i + 1
    return Math.round(593 * (Math.pow(1.15, n) - 1) / 0.15)
  }),
]
// XP_THRESHOLDS[0] = 0, [1] = threshold to reach tier 1, ..., [19] = threshold for solar

export const RANK_NAMES = [
  'Non classé',
  'Bois I', 'Bois II', 'Bois III',
  'Bronze I', 'Bronze II', 'Bronze III',
  'Argent I', 'Argent II', 'Argent III',
  'Or I', 'Or II', 'Or III',
  'Diamant I', 'Diamant II', 'Diamant III',
  'Platine I', 'Platine II', 'Platine III',
  'Solaire',
] as const

export const RANK_COLORS = [
  'var(--text-dim)',      // 0 unranked
  'var(--rank-wood)',     // 1
  'var(--rank-wood)',     // 2
  'var(--rank-wood)',     // 3
  'var(--rank-bronze)',   // 4
  'var(--rank-bronze)',   // 5
  'var(--rank-bronze)',   // 6
  'var(--rank-silver)',   // 7
  'var(--rank-silver)',   // 8
  'var(--rank-silver)',   // 9
  'var(--rank-gold)',     // 10
  'var(--rank-gold)',     // 11
  'var(--rank-gold)',     // 12
  'var(--rank-diamond)',  // 13
  'var(--rank-diamond)',  // 14
  'var(--rank-diamond)',  // 15
  'var(--rank-platinum)', // 16
  'var(--rank-platinum)', // 17
  'var(--rank-platinum)', // 18
  'var(--rank-solar)',    // 19
] as const

/** Compute rank tier from cumulative XP (client-side check, RPC is authoritative) */
export function getTierFromXP(xp: number): RankTier {
  let tier = 0 as RankTier
  for (let i = 1; i <= 19; i++) {
    if (xp >= XP_THRESHOLDS[i]) {
      tier = i as RankTier
    } else {
      break
    }
  }
  return tier
}

/** XP progress within current tier (0–100%) */
export function getTierProgress(xp: number, tier: RankTier): number {
  if (tier >= 19) return 100
  const tierStart = XP_THRESHOLDS[tier]
  const tierEnd = XP_THRESHOLDS[tier + 1]
  return Math.round(((xp - tierStart) / (tierEnd - tierStart)) * 100)
}

/** XP needed to reach next tier */
export function xpToNextTier(xp: number, tier: RankTier): number {
  if (tier >= 19) return 0
  return XP_THRESHOLDS[tier + 1] - xp
}

/** Tokens granted on promotion to `newTier` */
export function tokensForPromotion(newTier: number): number {
  if (newTier === 19) return 5  // solar = 5 tokens
  return 1
}
