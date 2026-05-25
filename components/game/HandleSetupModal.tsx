'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  handle: z
    .string()
    .min(3, 'Minimum 3 caractères')
    .max(20, 'Maximum 20 caractères')
    .regex(/^[a-z0-9_]+$/, 'Lettres minuscules, chiffres et _ uniquement'),
  display_name: z.string().min(1, 'Nom requis').max(50, 'Trop long'),
})

type FormData = z.infer<typeof schema>

interface Props {
  onDone: () => void
}

export function HandleSetupModal({ onDone }: Props) {
  const { user, profile, setProfile } = useAuthStore()
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: profile?.display_name ?? '',
    },
  })

  const onSubmit = async (data: FormData) => {
    if (!user) return
    setLoading(true)
    setError(null)

    // Check handle uniqueness
    const { data: existing } = await supabase
      .from('profiles')
      .select('handle')
      .eq('handle', data.handle)
      .single()

    if (existing) {
      setError('Ce pseudo est déjà pris')
      setLoading(false)
      return
    }

    // Upsert profile with handle
    const { error: upsertErr } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        handle: data.handle,
        display_name: data.display_name,
      }, { onConflict: 'id' })

    if (upsertErr) {
      setError('Erreur lors de la création du profil')
      setLoading(false)
      return
    }

    // Initialize lang_states if missing
    const langs = ['en', 'de', 'es', 'it'] as const
    await Promise.all(langs.map(lang =>
      supabase.from('lang_state').upsert({
        user_id: user.id,
        lang,
        coins: 100,
      }, { onConflict: 'user_id,lang', ignoreDuplicates: true })
    ))

    setProfile({
      ...(profile ?? {
        id: user.id,
        photo_url: null,
        showcase_lang: null,
        pinned_achievements: [],
        active_session_id: null,
        daily_login_streak: 0,
        last_login_day: null,
        created_at: new Date().toISOString(),
      }),
      handle: data.handle,
      display_name: data.display_name,
    } as Parameters<typeof setProfile>[0])

    setLoading(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-6 space-y-5">
        <div className="text-center space-y-2">
          <span className="text-4xl">🎮</span>
          <h2 className="text-xl font-black text-text">Crée ton profil</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Choisis ton pseudo unique. Il ne pourra plus être modifié.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Pseudo (pseudo unique, immutable)"
            placeholder="ex: jean_leroi"
            hint="3–20 caractères, minuscules, chiffres, _"
            error={errors.handle?.message}
            {...register('handle')}
          />
          <Input
            label="Nom affiché"
            placeholder="ex: Jean"
            error={errors.display_name?.message}
            {...register('display_name')}
          />
          {error && (
            <p className="text-sm text-score-red">{error}</p>
          )}
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Commencer à jouer 🚀
          </Button>
        </form>
      </div>
    </div>
  )
}
