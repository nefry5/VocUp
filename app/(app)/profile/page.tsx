'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/authStore'
import { useLangStore } from '@/lib/stores/langStore'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RANK_NAMES, RANK_COLORS } from '@/lib/game/rank'
import { WORDS } from '@/lib/data/words'
import { isMastered } from '@/lib/game/score'
import type { Lang } from '@/lib/supabase/types'
import { Camera, LogOut, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const LANGS: Array<{ id: Lang; name: string; flag: string }> = [
  { id: 'en', name: 'Anglais', flag: '🇬🇧' },
  { id: 'de', name: 'Allemand', flag: '🇩🇪' },
  { id: 'es', name: 'Espagnol', flag: '🇪🇸' },
  { id: 'it', name: 'Italien', flag: '🇮🇹' },
]

export default function ProfilePage() {
  const { user, profile, setProfile } = useAuthStore()
  const langStates = useLangStore(s => s.langStates)
  const wordScores = useLangStore(s => s.wordScores)
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [showcaseLang, setShowcaseLang] = useState<Lang | null>(profile?.showcase_lang ?? null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name)
      setShowcaseLang(profile.showcase_lang)
    }
  }, [profile])

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').update({
      display_name: displayName,
      showcase_lang: showcaseLang,
    }).eq('id', user.id)
    setProfile({ ...profile!, display_name: displayName, showcase_lang: showcaseLang })
    setSaving(false)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    const ext = file.name.split('.').pop()
    const path = `${user.id}/avatar.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('profiles').update({ photo_url: data.publicUrl }).eq('id', user.id)
      setProfile({ ...profile!, photo_url: data.publicUrl })
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!user && !profile) {
    return (
      <div className="p-4 text-center space-y-4">
        <p className="text-[var(--text-muted)]">Connecte-toi pour accéder à ton profil.</p>
        <Link href="/login"><Button>Se connecter</Button></Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3 py-2">
        <Link href="/home">
          <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
            <ChevronLeft size={20} />
          </button>
        </Link>
        <h1 className="text-xl font-bold text-text">Profil</h1>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button className="relative" onClick={() => fileRef.current?.click()}>
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-action to-[var(--reward)] overflow-hidden flex items-center justify-center">
            {profile?.photo_url
              ? <img src={profile.photo_url} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-bg text-2xl font-black">{(profile?.display_name ?? 'V')[0].toUpperCase()}</span>
            }
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[var(--surface-2)] border border-[var(--border)] rounded-full flex items-center justify-center">
            <Camera size={11} className="text-[var(--text-muted)]" />
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        <div>
          <p className="font-bold text-text">{profile?.display_name}</p>
          <p className="text-sm text-[var(--text-muted)]">@{profile?.handle}</p>
        </div>
      </div>

      {/* Edit display name */}
      <Input
        label="Nom affiché"
        value={displayName}
        onChange={e => setDisplayName(e.target.value)}
        placeholder="Ton nom"
      />

      {/* Showcase lang */}
      <div>
        <p className="text-sm font-medium text-[var(--text-muted)] mb-2">Langue mise en avant</p>
        <div className="grid grid-cols-2 gap-2">
          {LANGS.map(l => {
            const ls = langStates[l.id]
            const tier = ls?.rank_tier ?? 0
            return (
              <button
                key={l.id}
                onClick={() => setShowcaseLang(l.id)}
                className={[
                  'flex items-center gap-2 p-3 rounded-xl border transition-all text-left',
                  showcaseLang === l.id ? 'border-action bg-action/10' : 'border-[var(--border)] hover:border-[var(--action)]/40',
                ].join(' ')}
              >
                <span className="text-lg">{l.flag}</span>
                <div>
                  <p className="text-xs font-semibold text-text">{l.name}</p>
                  <p className="text-xs font-bold" style={{ color: RANK_COLORS[tier] }}>{RANK_NAMES[tier]}</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Per-lang stats */}
      <div>
        <h2 className="font-bold text-text mb-3">Statistiques</h2>
        <div className="space-y-3">
          {LANGS.map(l => {
            const ls = langStates[l.id]
            const ws = wordScores[l.id]
            const mastered = WORDS.filter(w => isMastered((ws?.get(w.id) ?? 4))).length
            const acc = ls && ls.total_cards > 0
              ? Math.round((ls.correct_cards / ls.total_cards) * 100)
              : 0
            return (
              <div key={l.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span>{l.flag}</span>
                  <span className="font-semibold text-sm text-text">{l.name}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Maîtrisés', value: mastered },
                    { label: 'Cartes', value: (ls?.total_cards ?? 0).toLocaleString('fr-FR') },
                    { label: 'Précision', value: `${acc}%` },
                  ].map(stat => (
                    <div key={stat.label}>
                      <p className="text-sm font-black text-text tabular-nums">{stat.value}</p>
                      <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Button fullWidth loading={saving} onClick={handleSave}>Sauvegarder</Button>

      <Button variant="danger" fullWidth onClick={handleSignOut}>
        <LogOut size={16} />
        Se déconnecter
      </Button>
    </div>
  )
}
