import { AuthProvider } from '@/components/game/AuthProvider'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[var(--bg)]">
        {children}
      </div>
    </AuthProvider>
  )
}
