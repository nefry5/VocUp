'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/stores/authStore'
import { ToastProvider } from '@/components/ui/Toast'
import { DailyLoginModal } from '@/components/game/DailyLoginModal'
import type { Profile } from '@/lib/supabase/types'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setProfile, setLoading } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setLoading(true)
      setUser(session?.user ?? null)

      if (session?.user) {
        // Load profile
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
        setProfile(data as Profile | null)
      } else {
        setProfile(null)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase, setUser, setProfile, setLoading])

  return (
    <ToastProvider>
      {children}
      <DailyLoginModal />
    </ToastProvider>
  )
}
