'use client'

import { Modal } from '@/components/ui/Modal'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Props {
  open: boolean
  onClose: () => void
  results: Array<{ correct: boolean }>
}

export function StatsModal({ open, onClose, results }: Props) {
  const total = results.length
  const correct = results.filter(r => r.correct).length
  const winRate = total === 0 ? 0 : Math.round((correct / total) * 100)

  // Build chart data in blocks of 10
  const blocks = []
  for (let i = 0; i < results.length; i += 10) {
    const chunk = results.slice(i, i + 10)
    const rate = Math.round((chunk.filter(r => r.correct).length / chunk.length) * 100)
    blocks.push({ label: `${i + 1}–${i + chunk.length}`, rate })
  }

  return (
    <Modal open={open} onClose={onClose} title="Statistiques de session">
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Cartes', value: total, color: 'var(--text)' },
            { label: 'Bonnes', value: correct, color: 'var(--action)' },
            { label: '% Correct', value: `${winRate}%`, color: winRate >= 70 ? 'var(--action)' : 'var(--score-yellow)' },
          ].map(stat => (
            <div key={stat.label} className="bg-[var(--surface-2)] rounded-xl p-3 text-center">
              <p className="text-2xl font-black tabular-nums" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Chart */}
        {blocks.length > 1 && (
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">Taux par tranche de 10</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={blocks} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface-2)', border: 'none', borderRadius: '8px', fontSize: '12px' }}
                  cursor={{ fill: 'var(--surface-3)' }}
                />
                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                  {blocks.map((entry, i) => (
                    <Cell key={i} fill={entry.rate >= 70 ? 'var(--action)' : entry.rate >= 50 ? 'var(--score-yellow)' : 'var(--score-red)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {total === 0 && (
          <p className="text-center text-[var(--text-muted)] text-sm py-4">
            Commence à jouer pour voir tes stats !
          </p>
        )}
      </div>
    </Modal>
  )
}
