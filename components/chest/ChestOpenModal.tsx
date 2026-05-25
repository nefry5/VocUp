'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'

interface ChestResult {
  item_id: string
  item_type: string
  rarity: string
  is_dupe: boolean
  shards_gained: number
}

const RARITY_COLORS: Record<string, string> = {
  C: '#94a3b8', R: '#38bdf8', SR: '#a78bfa', E: '#f59e0b', L: '#ef5778', Sec: '#f97316',
}
const RARITY_LABELS: Record<string, string> = {
  C: 'Commun', R: 'Rare', SR: 'Super Rare', E: 'Épique', L: 'Légendaire', Sec: 'Secret',
}

interface Props {
  open: boolean
  onClose: () => void
  result: ChestResult
}

export function ChestOpenModal({ open, onClose, result }: Props) {
  if (!open) return null

  const color = RARITY_COLORS[result.rarity] ?? '#94a3b8'
  const label = RARITY_LABELS[result.rarity] ?? result.rarity

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <motion.div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-8 text-center max-w-sm w-full mx-4 shadow-2xl"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300, delay: 0.1 }}
      >
        {/* Roulette animation placeholder */}
        <motion.div
          className="text-6xl mb-4"
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        >
          {result.item_type === 'skin' ? '🃏' : '🎨'}
        </motion.div>

        <span
          className="inline-block px-3 py-1 rounded-full text-sm font-bold mb-3"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {label}
        </span>

        <h2 className="text-xl font-black text-text mb-1">
          {result.item_type === 'skin' ? 'Nouveau Skin !' : 'Nouveau Thème !'}
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-2">{result.item_id}</p>

        {result.is_dupe && (
          <div className="bg-[var(--surface-2)] rounded-xl p-3 mb-4">
            <p className="text-sm text-[var(--text-muted)]">Déjà possédé</p>
            <p className="text-lg font-bold text-[var(--reward)]">+{result.shards_gained} éclats ✨</p>
          </div>
        )}

        <Button fullWidth onClick={onClose}>Super !</Button>
      </motion.div>
    </div>
  )
}
