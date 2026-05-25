'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/lib/stores/authStore'
import { createClient } from '@/lib/supabase/client'
import { computeDailyLoginReward, shouldShowLoginReward } from '@/lib/game/daily'

const BOOSTER_LABELS: Record<string, string> = {
  coin: '×2 Pièces',
  luck: '×2 Chance',
  xp: '×2 XP',
  streak: '×2 Streak',
}

const BOOSTER_EMOJIS: Record<string, string> = {
  coin: '🪙',
  luck: '🍀',
  xp: '⚡',
  streak: '🔥',
}

export function DailyLoginModal() {
  const [open, setOpen] = useState(false)
  const [reward, setReward] = useState<{ day: number; boosterType: string; count: number } | null>(null)
  const [claiming, setClaiming] = useState(false)
  const { user, profile } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    if (!user || !profile) return
    if (shouldShowLoginReward(profile.last_login_day)) {
      const r = computeDailyLoginReward(profile.daily_login_streak + 1)
      setReward(r)
      setOpen(true)
    }
  }, [user, profile])

  const handleClaim = async () => {
    if (!user) return
    setClaiming(true)
    await supabase.rpc('claim_daily_login')
    setClaiming(false)
    setOpen(false)
  }

  if (!reward) return null

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Connexion quotidienne">
      <div className="text-center space-y-4">
        <p className="text-[var(--text-muted)] text-sm">Jour {reward.day}</p>
        <div className="text-6xl">{BOOSTER_EMOJIS[reward.boosterType]}</div>
        <div>
          <p className="text-xl font-bold text-text">
            {reward.count}× booster {BOOSTER_LABELS[reward.boosterType]}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Valable 24h</p>
        </div>
        <Button fullWidth size="lg" loading={claiming} onClick={handleClaim}>
          Récupérer
        </Button>
      </div>
    </Modal>
  )
}
