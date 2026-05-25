'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useLangStore } from '@/lib/stores/langStore'
import { useAuthStore } from '@/lib/stores/authStore'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabContent } from '@/components/ui/Tabs'
import { ChestOpenModal } from '@/components/chest/ChestOpenModal'
import type { Lang } from '@/lib/supabase/types'

type ChestType = 'common' | 'rare' | 'legendary'

const CHESTS: Array<{
  id: ChestType
  label: string
  price: number
  emoji: string
  drops: string
  color: string
}> = [
  { id: 'common', label: 'Commun', price: 100, emoji: '📦', drops: 'C 70% · R 25% · SR 4% · E 1%', color: '#94a3b8' },
  { id: 'rare', label: 'Rare', price: 500, emoji: '💎', drops: 'R 70% · SR 25% · E 4% · L 1%', color: '#38bdf8' },
  { id: 'legendary', label: 'Légendaire', price: 2000, emoji: '👑', drops: 'SR 70% · E 25% · L 4% · Sec 1%', color: '#f59e0b' },
]

const RARITY_LABELS: Record<string, string> = {
  C: 'Commun', R: 'Rare', SR: 'Super Rare', E: 'Épique', L: 'Légendaire', Sec: 'Secret',
}

const RARITY_COLORS: Record<string, string> = {
  C: '#94a3b8', R: '#38bdf8', SR: '#a78bfa', E: '#f59e0b', L: '#ef5778', Sec: '#f97316',
}

// Generate catalog items
function genItems(type: 'skin' | 'theme') {
  const rarities = ['C','C','C','C','C','C','C','C','R','R','R','R','R','R','R','SR','SR','SR','SR','SR','SR','E','E','E','E','E','L','L','L','Sec']
  return rarities.map((r, i) => ({ id: `${type}_${r}_${i + 1}`, rarity: r, type }))
}

const SKINS = genItems('skin')
const THEMES = genItems('theme')

export default function ShopPage() {
  const { lang } = useParams() as { lang: Lang }
  const { user } = useAuthStore()
  const langState = useLangStore(s => s.langStates[lang])
  const updateLangState = useLangStore(s => s.updateLangState)
  const supabase = createClient()

  const [tab, setTab] = useState('skins')
  const [openChest, setOpenChest] = useState<ChestType | null>(null)
  const [bonusOpen, setBonusOpen] = useState(false)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [chestResult, setChestResult] = useState<{ item_id: string; item_type: string; rarity: string; is_dupe: boolean; shards_gained: number } | null>(null)

  const coins = langState?.coins ?? 0
  const shards = langState?.shards ?? 0
  const inventory_skins = langState?.inventory_skins ?? []
  const inventory_themes = langState?.inventory_themes ?? []
  const active_skin = langState?.active_skin_id
  const active_theme = langState?.active_theme_id

  const handleBuyChest = async (chest: typeof CHESTS[0]) => {
    if (coins < chest.price) return
    setPurchasing(chest.id)
    // Deduct coins
    const { error } = await supabase.rpc('spend_coins', {
      p_lang: lang,
      p_amount: chest.price,
      p_item: `${chest.id}_chest`,
    })
    if (error) { setPurchasing(null); return }
    // Open chest
    const { data } = await supabase.rpc('open_chest', { p_lang: lang, p_type: chest.id })
    if (data) {
      setChestResult(data)
      setOpenChest(chest.id)
      // Refresh lang state
      if (user) {
        const { data: ls } = await supabase.from('lang_state').select('*').eq('user_id', user.id).eq('lang', lang).single()
        if (ls) updateLangState(lang, ls)
      }
    }
    setPurchasing(null)
  }

  const handleBonusChest = async () => {
    if (shards < 300) return
    setBonusOpen(true)
    const { data } = await supabase.rpc('open_bonus_chest', { p_lang: lang })
    if (data && user) {
      const { data: ls } = await supabase.from('lang_state').select('*').eq('user_id', user.id).eq('lang', lang).single()
      if (ls) updateLangState(lang, ls)
    }
    setBonusOpen(false)
  }

  const equipItem = async (itemId: string, itemType: 'skin' | 'theme') => {
    if (!user) return
    const patch = itemType === 'skin'
      ? { active_skin_id: active_skin === itemId ? null : itemId }
      : { active_theme_id: active_theme === itemId ? null : itemId }
    await supabase.from('lang_state').update(patch).eq('user_id', user.id).eq('lang', lang)
    updateLangState(lang, patch)
  }

  function ItemGrid({ items, inventory, active, type }: {
    items: typeof SKINS
    inventory: string[]
    active: string | null | undefined
    type: 'skin' | 'theme'
  }) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {items.map(item => {
          const owned = inventory.includes(item.id)
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              disabled={!owned}
              onClick={() => owned && equipItem(item.id, type)}
              className={[
                'relative rounded-xl border p-3 flex flex-col items-center gap-1.5 text-center transition-all',
                isActive ? 'border-action bg-action/10' : 'border-[var(--border)]',
                owned ? 'hover:border-[var(--action)]/50 cursor-pointer' : 'opacity-40 cursor-not-allowed',
              ].join(' ')}
            >
              <span className="text-2xl">{type === 'skin' ? '🃏' : '🎨'}</span>
              <span className="text-xs font-bold" style={{ color: RARITY_COLORS[item.rarity] }}>
                {RARITY_LABELS[item.rarity]}
              </span>
              {owned && (
                <span className="text-xs text-[var(--text-muted)]">
                  {isActive ? 'Équipé' : 'Possédé'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Chest cards */}
      <div className="space-y-3">
        {CHESTS.map(chest => (
          <div key={chest.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{chest.emoji}</span>
                <div>
                  <p className="font-bold text-sm text-text">{chest.label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{chest.drops}</p>
                </div>
              </div>
              <Button
                size="sm"
                loading={purchasing === chest.id}
                disabled={coins < chest.price || !user}
                onClick={() => handleBuyChest(chest)}
              >
                🪙 {chest.price.toLocaleString('fr-FR')}
              </Button>
            </div>
          </div>
        ))}

        {/* Bonus chest */}
        <div className="bg-[var(--surface)] border border-reward/30 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <div>
                <p className="font-bold text-sm text-text">Coffre Bonus</p>
                <p className="text-xs text-[var(--text-muted)]">Donne un booster aléatoire</p>
              </div>
            </div>
            <div className="text-right">
              <Button
                size="sm"
                variant="reward"
                loading={bonusOpen}
                disabled={shards < 300 || !user}
                onClick={handleBonusChest}
              >
                ✨ 300
              </Button>
              <p className="text-xs text-[var(--text-muted)] mt-1 tabular-nums">Tu as {shards} éclats</p>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div>
        <h2 className="font-bold text-text mb-3">Inventaire</h2>
        <Tabs value={tab} onChange={setTab}>
          <TabList className="mb-4">
            <TabTrigger value="skins">Skins</TabTrigger>
            <TabTrigger value="themes">Thèmes</TabTrigger>
          </TabList>
          <TabContent value="skins">
            <ItemGrid items={SKINS} inventory={inventory_skins} active={active_skin} type="skin" />
          </TabContent>
          <TabContent value="themes">
            <ItemGrid items={THEMES} inventory={inventory_themes} active={active_theme} type="theme" />
          </TabContent>
        </Tabs>
      </div>

      {!user && (
        <p className="text-center text-sm text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
          Connecte-toi pour acheter des coffres.
        </p>
      )}

      {/* Chest open result */}
      {chestResult && openChest && (
        <ChestOpenModal
          open={true}
          onClose={() => { setChestResult(null); setOpenChest(null) }}
          result={chestResult}
        />
      )}
    </div>
  )
}
