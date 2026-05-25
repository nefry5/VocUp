'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useAuthStore } from '@/lib/stores/authStore'

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe trop court'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const setGuest = useAuthStore(s => s.setGuest)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    router.push('/home')
  }

  const signInWithGoogle = async () => {
    setOauthLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const continueAsGuest = () => {
    setGuest(true)
    router.push('/home')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-4xl font-black text-action tracking-tight">VocUp</h1>
          <p className="text-[var(--text-muted)] mt-1 text-sm">Apprends le vocabulaire</p>
        </div>

        {/* Google OAuth */}
        <Button
          variant="secondary"
          fullWidth
          size="lg"
          loading={oauthLoading}
          onClick={signInWithGoogle}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z" fill="#4285F4"/>
            <path d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26a5.43 5.43 0 0 1-3.04.86 5.38 5.38 0 0 1-5.06-3.72H.96v2.34A9 9 0 0 0 9 18z" fill="#34A853"/>
            <path d="M3.94 10.7A5.43 5.43 0 0 1 3.66 9a5.43 5.43 0 0 1 .28-1.7V4.96H.96A9 9 0 0 0 0 9a9 9 0 0 0 .96 4.04z" fill="#FBBC05"/>
            <path d="M9 3.58a4.86 4.86 0 0 1 3.44 1.34l2.58-2.58A8.64 8.64 0 0 0 9 0 9 9 0 0 0 .96 4.96l2.98 2.34A5.38 5.38 0 0 1 9 3.58z" fill="#EA4335"/>
          </svg>
          Continuer avec Google
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--border)]" />
          <span className="text-xs text-[var(--text-dim)]">ou</span>
          <div className="flex-1 h-px bg-[var(--border)]" />
        </div>

        {/* Email/password form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            placeholder="••••••••"
            error={errors.password?.message}
            {...register('password')}
          />
          {error && <p className="text-sm text-score-red">{error}</p>}
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Se connecter
          </Button>
        </form>

        <p className="text-center text-sm text-[var(--text-muted)]">
          Pas de compte ?{' '}
          <Link href="/signup" className="text-action hover:underline font-medium">
            Créer un compte
          </Link>
        </p>

        {/* Guest */}
        <Button variant="ghost" fullWidth onClick={continueAsGuest}>
          Continuer en invité
        </Button>
      </div>
    </div>
  )
}
