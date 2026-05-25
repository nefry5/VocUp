'use client'

import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase/types'

interface AuthStore {
  user: User | null
  profile: Profile | null
  isGuest: boolean
  isLoading: boolean

  setUser: (user: User | null) => void
  setProfile: (profile: Profile | null) => void
  setGuest: (val: boolean) => void
  setLoading: (val: boolean) => void
  clear: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  profile: null,
  isGuest: false,
  isLoading: true,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setGuest: (val) => set({ isGuest: val }),
  setLoading: (val) => set({ isLoading: val }),
  clear: () => set({ user: null, profile: null, isGuest: false }),
}))
