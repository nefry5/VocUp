'use client'

import { createContext, useContext } from 'react'

interface TabsContextValue {
  active: string
  onChange: (value: string) => void
}

const TabsCtx = createContext<TabsContextValue | null>(null)

interface TabsProps {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}

export function Tabs({ value, onChange, children, className = '' }: TabsProps) {
  return (
    <TabsCtx.Provider value={{ active: value, onChange }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  )
}

interface TabListProps {
  children: React.ReactNode
  className?: string
}

export function TabList({ children, className = '' }: TabListProps) {
  return (
    <div
      role="tablist"
      className={`flex bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 gap-1 ${className}`}
    >
      {children}
    </div>
  )
}

interface TabTriggerProps {
  value: string
  children: React.ReactNode
  disabled?: boolean
}

export function TabTrigger({ value, children, disabled }: TabTriggerProps) {
  const ctx = useContext(TabsCtx)
  if (!ctx) throw new Error('TabTrigger must be inside Tabs')
  const isActive = ctx.active === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => ctx.onChange(value)}
      className={[
        'flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-150',
        isActive
          ? 'bg-action text-bg shadow-sm'
          : 'text-[var(--text-muted)] hover:text-text hover:bg-[var(--surface-2)]',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

interface TabContentProps {
  value: string
  children: React.ReactNode
}

export function TabContent({ value, children }: TabContentProps) {
  const ctx = useContext(TabsCtx)
  if (!ctx) return null
  if (ctx.active !== value) return null
  return <div role="tabpanel">{children}</div>
}
