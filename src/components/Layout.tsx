import { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Database, History, Plus, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

const navItems = [
  { href: '/', icon: Home, label: 'Home' },
  { href: '/clone', icon: Database, label: 'Clone' },
  { href: '/history', icon: History, label: 'History' },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card">
        <div className="p-6">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            DB Clone
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            PostgreSQL Cloning Tool
          </p>
        </div>

        <nav className="px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 mt-6">
          <Link
            to="/connection/new"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Connection
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="container py-6 max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  )
}
