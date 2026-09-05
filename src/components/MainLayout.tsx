import { Link, useLocation } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Plus, Menu, Sun, Moon, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import QuickAddModal from '@/components/QuickAddModal'
import { useAuth } from '@/context/AuthContext'

interface NavItem {
  label: string
  path: string
}

const navItems: NavItem[] = [
  { label: 'Today', path: '/' },
  { label: 'Week', path: '/week' },
  { label: 'Threads', path: '/threads' },
  { label: 'Backlog', path: '/backlog' },
  { label: 'Wishlist', path: '/wishlist' },
  { label: 'Goals', path: '/goals' },
  { label: 'Settings', path: '/settings' },
]

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // Keyboard shortcut: press 'q' to open Quick Add when not typing in an input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return
      }
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        setQuickAddOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className={cn(
        'fixed md:relative w-64 h-full bg-card border-r border-border p-6 z-40 transition-transform',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}>
        <div className="flex flex-col h-full gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center font-bold text-primary-foreground">
              W
            </div>
            <h1 className="font-bold text-lg">Workspace</h1>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-2 flex-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  'px-4 py-2 rounded-lg transition-colors font-medium',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-secondary text-foreground'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Quick Add */}
          <button 
            onClick={() => setQuickAddOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
          >
            <Plus size={18} />
            Quick Add
          </button>

          {/* Lock Workspace */}
          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors border border-transparent hover:border-border"
            title="Lock workspace"
          >
            <Lock size={14} />
            <span>Lock Workspace</span>
          </button>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card p-4 md:p-6 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 hover:bg-secondary rounded-lg"
          >
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Lock Button */}
            <button
              onClick={logout}
              className="p-2 hover:bg-secondary rounded-lg transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Lock workspace"
              title="Lock workspace"
            >
              <Lock size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>

      {/* Global Quick Add Dialog */}
      <QuickAddModal 
        isOpen={quickAddOpen} 
        onClose={() => setQuickAddOpen(false)} 
      />
    </div>
  )
}
