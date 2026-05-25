'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/stores/authStore'
import { ToastProvider } from '@/components/ui/Toast'
import { DailyLoginModal } from '@/components/game/DailyLoginModal'
import type { Profile } from '@/lib/supabase/types'
import { HandleSetupModal } from '@/components/game/HandleSetupModal'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setProfile, setLoading } = useAuthStore()
  const supabase = createClient()
  const [showHandleSetup, setShowHandleSetup] = useState(false)

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

        const profile = data as Profile | null
        setProfile(profile)

        // If user has no handle, force handle setup
        if (!profile?.handle) {
          setShowHandleSetup(true)
        } else {
          setShowHandleSetup(false)
        }
      } else {
        setProfile(null)
        setShowHandleSetup(false)
      }

      setLoading(false)
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <ToastProvider>
      {children}
      <DailyLoginModal />
      {showHandleSetup && (
        <HandleSetupModal onDone={() => setShowHandleSetup(false)} />
      )}
    </ToastProvider>
  )
}
