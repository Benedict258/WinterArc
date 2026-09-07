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
const SIDEBAR_FULL = 'w-64'
const SIDEBAR_COLLAPSED = 'w-16'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [pinnedExpanded, setPinnedExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(SIDEBAR_EXPANDED_KEY) === 'true'
  })

  const desktopExpanded = pinnedExpanded

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(pinnedExpanded))
  }, [pinnedExpanded])

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
      <aside
        className={cn(
          'fixed md:relative h-full bg-card border-r border-border z-40',
          'flex flex-col transition-[width] duration-200 ease-in-out',
          desktopExpanded ? SIDEBAR_FULL : SIDEBAR_COLLAPSED,
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
        aria-expanded={desktopExpanded}
      >
        <div className="flex flex-col h-full p-3 gap-4">
          <button
            onClick={() => setPinnedExpanded(prev => !prev)}
            className={cn(
              'flex items-center gap-2 px-2 py-2 w-full text-left rounded-lg hover:bg-secondary transition-colors cursor-pointer',
              desktopExpanded ? 'justify-start' : 'justify-center'
            )}
            aria-label="Toggle sidebar"
          >
            <img src="/logo.png" alt="WinterArc Logo" className="w-12 h-12 shrink-0 rounded object-contain" />
            {desktopExpanded && (
              <div className="flex flex-col leading-tight">
                <h1 className="font-bold text-lg whitespace-nowrap overflow-hidden">WinterArc</h1>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap overflow-hidden">workspace</span>
              </div>
            )}
          </button>

          <nav className="flex flex-col gap-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg transition-colors font-medium cursor-pointer',
                    desktopExpanded
                      ? 'px-4 py-2 justify-start'
                      : 'px-0 py-2 justify-center',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-secondary text-foreground'
                  )}
                  title={item.label}
                >
                  <Icon size={20} className="shrink-0" />
                  {desktopExpanded && (
                    <span className="whitespace-nowrap overflow-hidden">
                      {item.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          <button
            onClick={() => setQuickAddOpen(true)}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm',
              desktopExpanded
                ? 'px-4 py-3 justify-center'
                : 'p-3 justify-center'
            )}
            title="Quick Add"
            aria-label="Quick Add"
          >
            <Plus size={18} />
            {desktopExpanded && <span>Quick Add</span>}
          </button>

          <button
            onClick={() => logout()}
            className={cn(
              'flex items-center gap-2 rounded-lg transition-colors border border-transparent hover:border-border',
              'text-muted-foreground hover:text-foreground hover:bg-secondary text-xs',
              desktopExpanded
                ? 'px-3 py-2 justify-start'
                : 'p-2 justify-center'
            )}
            title="Lock workspace"
            aria-label="Lock workspace"
          >
            <Lock size={14} />
            {desktopExpanded && <span>Lock Workspace</span>}
          </button>

          <button
            onClick={() => setPinnedExpanded((prev) => !prev)}
            className={cn(
              'flex items-center gap-2 rounded-lg transition-colors',
              'text-muted-foreground hover:text-foreground hover:bg-secondary text-xs',
              desktopExpanded
                ? 'px-3 py-2 justify-start'
                : 'p-2 justify-center'
            )}
            title={pinnedExpanded ? 'Collapse sidebar' : 'Pin sidebar open'}
            aria-label={pinnedExpanded ? 'Collapse sidebar' : 'Pin sidebar open'}
          >
            {pinnedExpanded ? (
              <PanelLeftClose size={14} />
            ) : (
              <PanelLeftOpen size={14} />
            )}
            {desktopExpanded && (
              <span>{pinnedExpanded ? 'Collapse' : 'Pin open'}</span>
            )}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0">
        <main className="flex-1 overflow-auto p-6">{children}</main>

        {/* Floating top-right controls */}
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2.5 bg-card border border-border rounded-xl shadow-sm hover:bg-secondary transition-colors"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <button
            onClick={logout}
            className="p-2.5 bg-card border border-border rounded-xl shadow-sm hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Lock workspace"
            title="Lock workspace"
          >
            <Lock size={18} />
          </button>
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden fixed top-4 left-4 z-50 p-2.5 bg-card border border-border rounded-xl shadow-sm"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      <QuickAddModal
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
      />
    </div>
  )
}
