import { Link, useLocation } from 'react-router-dom'
import { useTheme } from 'next-themes'
import {
  Plus,
  Menu,
  Sun,
  Moon,
  Lock,
  CalendarDays,
  Sun as TodayIcon,
  GitBranch,
  Inbox,
  Heart,
  Target,
  Settings as SettingsIcon,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'
import QuickAddModal from '@/components/QuickAddModal'
import { useAuth } from '@/context/AuthContext'

interface NavItem {
  label: string
  path: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { label: 'Today', path: '/', icon: TodayIcon },
  { label: 'Week', path: '/week', icon: CalendarDays },
  { label: 'Threads', path: '/threads', icon: GitBranch },
  { label: 'Backlog', path: '/backlog', icon: Inbox },
  { label: 'Wishlist', path: '/wishlist', icon: Heart },
  { label: 'Goals', path: '/goals', icon: Target },
  { label: 'Drop', path: '/drop', icon: Upload },
  { label: 'Settings', path: '/settings', icon: SettingsIcon },
]

const SIDEBAR_EXPANDED_KEY = 'workspace-sidebar-expanded'

function isActive(itemPath: string, pathname: string) {
  if (itemPath === '/') return pathname === '/'
  // /threads/:id keeps "Threads" highlighted
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [pinnedExpanded, setPinnedExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === 'true'
    } catch {
      return false
    }
  })

  // The mobile drawer always shows labels; on desktop it's the pinned state
  const expanded = pinnedExpanded || mobileOpen
  const isDark = theme === 'dark'
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark')

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(pinnedExpanded))
    } catch {
      // storage unavailable (private mode) — preference just isn't remembered
    }
  }, [pinnedExpanded])

  // Close the drawer when navigating
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        return
      }
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return
      if ((e.key === 'q' || e.key === 'Q') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuickAddOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const rowClass = cn(
    'flex items-center h-10 rounded-lg text-sm font-medium transition-colors',
    expanded ? 'w-full gap-3 px-3' : 'justify-center w-10 mx-auto'
  )

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 md:relative z-40 h-full shrink-0',
          'flex flex-col bg-card border-r border-border',
          'transition-[width,transform] duration-200 ease-in-out',
          expanded ? 'w-64' : 'w-16',
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'
        )}
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className={cn('flex items-center h-16 shrink-0 px-3', expanded ? 'justify-between' : 'justify-center')}>
          {expanded ? (
            <>
              <Link to="/" className="flex items-center gap-2.5 min-w-0">
                <img src="/logo.png" alt="" className="w-9 h-9 shrink-0 rounded-md object-contain" />
                <span className="font-bold text-lg tracking-tight truncate">WinterArc</span>
              </Link>
              {/* Desktop: collapse. Mobile: close the drawer. */}
              <button
                onClick={() => setPinnedExpanded(false)}
                className="hidden md:inline-flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={18} />
              </button>
              <button
                onClick={() => setMobileOpen(false)}
                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <button
              onClick={() => setPinnedExpanded(true)}
              className="group relative p-1 rounded-lg hover:bg-secondary transition-colors"
              title="Expand sidebar"
              aria-label="Pin sidebar open"
            >
              <img src="/logo.png" alt="" className="w-9 h-9 rounded-md object-contain group-hover:opacity-0 transition-opacity" />
              <PanelLeftOpen size={18} className="absolute inset-0 m-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path, location.pathname)
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? 'page' : undefined}
                title={expanded ? undefined : item.label}
                className={cn(
                  rowClass,
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <Icon size={18} className="shrink-0" />
                {expanded && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 px-3 pt-3 pb-4 space-y-1 border-t border-border">
          <button
            onClick={() => setQuickAddOpen(true)}
            className={cn(
              rowClass,
              'mb-2 bg-primary text-primary-foreground font-semibold shadow-sm hover:opacity-90',
              expanded && 'justify-center'
            )}
            title="Quick Add (Q)"
            aria-label="Quick Add"
          >
            <Plus size={18} className="shrink-0" />
            {expanded && (
              <>
                <span>Quick Add</span>
                <kbd className="ml-1 hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary-foreground/15">Q</kbd>
              </>
            )}
          </button>

          <button
            onClick={toggleTheme}
            className={cn(rowClass, 'w-full text-muted-foreground hover:text-foreground hover:bg-secondary')}
            title={expanded ? undefined : isDark ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} className="shrink-0" /> : <Moon size={18} className="shrink-0" />}
            {expanded && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          <button
            onClick={() => logout()}
            className={cn(rowClass, 'w-full text-muted-foreground hover:text-foreground hover:bg-secondary')}
            title={expanded ? undefined : 'Lock workspace'}
            aria-label="Lock workspace"
          >
            <Lock size={18} className="shrink-0" />
            {expanded && <span>Lock workspace</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="flex-1 min-w-0 h-full overflow-y-auto">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-20 flex items-center gap-2 h-14 px-3 bg-background/90 backdrop-blur border-b border-border">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          <Link to="/" className="flex items-center gap-2 min-w-0 flex-1">
            <img src="/logo.png" alt="" className="w-7 h-7 rounded object-contain" />
            <span className="font-bold tracking-tight truncate">WinterArc</span>
          </Link>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={() => logout()}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Lock workspace"
          >
            <Lock size={18} />
          </button>
        </header>

        <main className="p-4 sm:p-6">{children}</main>
      </div>

      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  )
}
