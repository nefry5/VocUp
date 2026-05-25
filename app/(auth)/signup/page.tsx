'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  handle: z
    .string()
    .min(3, 'Minimum 3 caractères')
    .max(20, 'Maximum 20 caractères')
    .regex(/^[a-z0-9_]+$/, 'Lettres minuscules, chiffres et _ uniquement'),
  display_name: z.string().min(1, 'Nom requis').max(50, 'Trop long'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Minimum 8 caractères'),
})

type FormData = z.infer<typeof schema>

export default function SignupPage() {
  const supabase = createClient()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
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

    const { error: signupErr, data: authData } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          handle: data.handle,
          display_name: data.display_name,
        },
      },
    })

    if (signupErr) {
      setError(signupErr.message)
      setLoading(false)
      return
    }

    // Create profile
    if (authData.user) {
      await supabase.from('profiles').insert({
        id: authData.user.id,
        handle: data.handle,
        display_name: data.display_name,
      })

      // Initialize lang_states for all 4 langs
      const langs = ['en', 'de', 'es', 'it'] as const
      await Promise.all(langs.map(lang =>
        supabase.from('lang_state').insert({
          user_id: authData.user!.id,
          lang,
          coins: 100,
        })
      ))
    }

    setLoading(false)
    setDone(true)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-action/20 flex items-center justify-center mx-auto">
            <span className="text-3xl">✉️</span>
          </div>
          <h2 className="text-xl font-bold text-text">Vérifie ton email !</h2>
          <p className="text-[var(--text-muted)] text-sm">
            Un lien de confirmation a été envoyé. Clique dessus pour activer ton compte.
          </p>
          <Link href="/login">
            <Button variant="secondary" fullWidth>Retour à la connexion</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-black text-action tracking-tight">VocUp</h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">Créer un compte</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Pseudo"
            placeholder="ex: jean_leroi"
            hint="3–20 caractères, lettres minuscules, chiffres, _"
            error={errors.handle?.message}
            {...register('handle')}
          />
          <Input
            label="Nom affiché"
            placeholder="ex: Jean"
            error={errors.display_name?.message}
            {...register('display_name')}
          />
          <Input
            label="Email"
            type="email"
            placeholder="ton@email.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Mot de passe"
            type="password"
            placeholder="Minimum 8 caractères"
            error={errors.password?.message}
            {...register('password')}
          />
          {error && <p className="text-sm text-score-red">{error}</p>}
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Créer mon compte
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--text-muted)]">
          Déjà un compte ?{' '}
          <Link href="/login" className="text-action hover:underline font-medium">
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  )
}
