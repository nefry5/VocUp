'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-action" />,
  error: <XCircle size={18} className="text-score-red" />,
  info: <Info size={18} className="text-score-blue" />,
  warning: <AlertTriangle size={18} className="text-score-yellow" />,
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info', duration = 3500) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
    if (duration > 0) setTimeout(() => remove(id), duration)
  }, [remove])

  const success = useCallback((m: string) => toast(m, 'success'), [toast])
  const error = useCallback((m: string) => toast(m, 'error'), [toast])
  const info = useCallback((m: string) => toast(m, 'info'), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          <AnimatePresence>
            {toasts.map(t => (
              <motion.div
                key={t.id}
                className="pointer-events-auto flex items-center gap-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs"
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 80, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              >
                {icons[t.type]}
                <span className="flex-1 text-text">{t.message}</span>
                <button onClick={() => remove(t.id)} className="text-[var(--text-muted)] hover:text-text">
                  <X size={14} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
