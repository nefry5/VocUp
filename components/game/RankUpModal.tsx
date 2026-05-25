'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { RANK_NAMES, RANK_COLORS } from '@/lib/game/rank'
import type { RankTier } from '@/lib/supabase/types'

interface Props {
  tier: RankTier
  onClose: () => void
}

// Simple confetti particles
function Confetti() {
  const colors = ['#34d399', '#ef5778', '#f59e0b', '#38bdf8', '#e879f9']
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-sm"
          style={{
            left: `${Math.random() * 100}%`,
            backgroundColor: colors[i % colors.length],
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{
            y: '100vh',
            opacity: 0,
            rotate: Math.random() * 360 * (Math.random() > 0.5 ? 1 : -1),
          }}
          transition={{ duration: 1.5 + Math.random(), delay: Math.random() * 0.5, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

export function RankUpModal({ tier, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <Confetti />
      <motion.div
        className="relative bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        <div className="text-6xl mb-4">🏆</div>
        <p className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Promotion !</p>
        <h2 className="text-3xl font-black mb-2" style={{ color: RANK_COLORS[tier] }}>
          {RANK_NAMES[tier]}
        </h2>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          Tu as atteint le rang {RANK_NAMES[tier]} !{' '}
          {tier < 19 ? '+1 jeton de déverrouillage gagné.' : '+5 jetons gagnés !'}
        </p>
        <Button fullWidth size="lg" onClick={onClose}>
          Continuer 🚀
        </Button>
      </motion.div>
    </div>
  )
}
