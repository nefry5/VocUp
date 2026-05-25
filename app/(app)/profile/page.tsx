'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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
import { Camera, LogOut, ChevronLeft, Check } from 'lucide-react'
import Link from 'next/link'

const LANGS: Array<{ id: Lang; name: string; flag: string }> = [
  { id: 'en', name: 'Anglais', flag: '🇬🇧' },
  { id: 'de', name: 'Allemand', flag: '🇩🇪' },
  { id: 'es', name: 'Espagnol', flag: '🇪🇸' },
  { id: 'it', name: 'Italien', flag: '🇮🇹' },
]

export default function ProfilePage() {
  const { user, profile, setProfile, isLoading } = useAuthStore()
  const langStates = useLangStore(s => s.langStates)
  const wordScores = useLangStore(s => s.wordScores)
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [showcaseLang, setShowcaseLang] = useState<Lang | null>(profile?.showcase_lang ?? null)
  const [autoSaved, setAutoSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setShowcaseLang(profile.showcase_lang ?? null)
    }
  }, [profile])

  const doSave = useCallback(async (name: string, lang: Lang | null) => {
    if (!user) return
    await supabase.from('profiles').update({
      display_name: name,
      showcase_lang: lang,
    }).eq('id', user.id)
    setProfile({ ...profile!, display_name: name, showcase_lang: lang })
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 2000)
  }, [user, profile, supabase, setProfile])

  const handleNameChange = (val: string) => {
    setDisplayName(val)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(val, showcaseLang), 800)
  }

  const handleLangChange = (lang: Lang) => {
    const next = lang === showcaseLang ? null : lang
    setShowcaseLang(next)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => doSave(displayName, next), 300)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    // Unique filename with timestamp to bust browser cache
    const ts = Date.now()
    const path = `${user.id}/avatar_${ts}.${ext}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const newUrl = `${data.publicUrl}?t=${ts}`
      await supabase.from('profiles').update({ photo_url: newUrl }).eq('id', user.id)
      setProfile({ ...profile!, photo_url: newUrl })
    }
    setUploading(false)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Show loading while auth hydrates (fixes mobile flicker)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-4 text-center space-y-4 mt-16">
        <span className="text-5xl">🔒</span>
        <p className="text-[var(--text-muted)]">Connecte-toi pour accéder à ton profil.</p>
        <Link href="/login"><Button>Se connecter</Button></Link>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6 pb-12">
      {/* Nav */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-3">
          <Link href="/home">
            <button className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface)] transition-colors">
              <ChevronLeft size={20} />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-text">Profil</h1>
        </div>
        {autoSaved && (
          <div className="flex items-center gap-1 text-action text-xs font-semibold">
            <Check size={13} />
            <span>Sauvegardé</span>
          </div>
        )}
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <button
          className="relative"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          aria-label="Changer la photo de profil"
        >
          <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--action), var(--reward))' }}>
            {profile?.photo_url ? (
              <img
                src={profile.photo_url}
                alt="avatar"
                className="w-full h-full object-cover"
                key={profile.photo_url} // force remount on URL change
              />
            ) : (
              <span className="text-[#0e0920] text-3xl font-black">
                {(profile?.display_name ?? 'V')[0].toUpperCase()}
              </span>
            )}
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[var(--surface-2)] border-2 border-[var(--bg)] rounded-full flex items-center justify-center">
            {uploading
              ? <div className="w-3.5 h-3.5 border-2 border-action border-t-transparent rounded-full animate-spin" />
              : <Camera size={13} className="text-[var(--text-muted)]" />
            }
          </div>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
        <div>
          <p className="font-bold text-text text-lg">{profile?.display_name}</p>
          <p className="text-sm text-[var(--text-muted)]">@{profile?.handle}</p>
          <p className="text-xs text-[var(--text-dim)] mt-0.5">Appuie sur la photo pour la modifier</p>
        </div>
      </div>

      {/* Edit display name — auto-save */}
      <div className="space-y-1">
        <Input
          label="Nom affiché"
          value={displayName}
          onChange={e => handleNameChange(e.target.value)}
          placeholder="Ton nom"
        />
        <p className="text-xs text-[var(--text-dim)] pl-1">Sauvegardé automatiquement</p>
      </div>

      {/* Showcase lang */}
      <div>
        <p className="text-sm font-semibold text-[var(--text-muted)] mb-2">Langue mise en avant</p>
        <div className="grid grid-cols-2 gap-2">
          {LANGS.map(l => {
            const ls = langStates[l.id]
            const tier = ls?.rank_tier ?? 0
            const selected = showcaseLang === l.id
            return (
              <button
                key={l.id}
                onClick={() => handleLangChange(l.id)}
                className={[
                  'flex items-center gap-2 p-3 rounded-xl border transition-all text-left',
                  selected
                    ? 'border-action bg-action/10'
                    : 'border-[var(--border)] hover:border-[var(--action)]/40',
                ].join(' ')}
              >
                <span className="text-lg">{l.flag}</span>
                <div>
                  <p className="text-xs font-semibold text-text">{l.name}</p>
                  <p className="text-xs font-bold" style={{ color: RANK_COLORS[tier] }}>{RANK_NAMES[tier]}</p>
                </div>
                {selected && <Check size={14} className="text-action ml-auto" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Per-lang stats */}
      <div>
        <h2 className="font-bold text-text mb-3">Statistiques par langue</h2>
        <div className="space-y-3">
          {LANGS.map(l => {
            const ls = langStates[l.id]
            const ws = wordScores[l.id]
            const mastered = WORDS.filter(w => isMastered((ws?.get(w.id) ?? 4))).length
            const acc = ls && ls.total_cards > 0
              ? Math.round((ls.correct_cards / ls.total_cards) * 100)
              : 0
            const tier = ls?.rank_tier ?? 0
            return (
              <div key={l.id} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{l.flag}</span>
                    <span className="font-semibold text-sm text-text">{l.name}</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                    style={{ color: RANK_COLORS[tier], backgroundColor: `${RANK_COLORS[tier]}20` }}>
                    {RANK_NAMES[tier]}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Maîtrisés', value: mastered, unit: '/440' },
                    { label: 'Cartes', value: (ls?.total_cards ?? 0).toLocaleString('fr-FR') },
                    { label: 'Précision', value: `${acc}%` },
                  ].map(stat => (
                    <div key={stat.label} className="bg-[var(--surface-2)] rounded-lg py-2">
                      <p className="text-sm font-black text-text tabular-nums">
                        {stat.value}
                        {stat.unit && <span className="text-xs text-[var(--text-dim)]">{stat.unit}</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Button variant="danger" fullWidth onClick={handleSignOut}>
        <LogOut size={16} />
        Se déconnecter
      </Button>
    </div>
  )
}
