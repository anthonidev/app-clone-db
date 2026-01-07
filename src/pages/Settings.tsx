import { ArrowLeft, Monitor, Moon, Sun, Palette } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useTheme, Theme } from '@/hooks/use-theme'
import { useColorTheme } from '@/hooks/use-color-theme'
import { cn } from '@/lib/utils'

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function Settings() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const { colorTheme, setColorTheme, colorThemes } = useColorTheme()

  // Determinar si estamos en modo oscuro
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Manage your application preferences
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme Mode Selector */}
          <div className="space-y-2">
            <Label>Theme Mode</Label>
            <p className="text-sm text-muted-foreground">
              Select your preferred color scheme
            </p>
            <div className="grid grid-cols-3 gap-4 pt-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all hover:bg-accent',
                    theme === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border'
                  )}
                >
                  <Icon className={cn(
                    'h-6 w-6',
                    theme === value ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'text-sm font-medium',
                    theme === value ? 'text-primary' : 'text-muted-foreground'
                  )}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Color Theme Selector */}
          <div className="space-y-2 pt-4 border-t">
            <Label className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Accent Color
            </Label>
            <p className="text-sm text-muted-foreground">
              Choose your preferred accent color
            </p>
            <div className="flex flex-wrap gap-4 pt-3">
              {colorThemes.map(({ value, label, color, darkColor }) => (
                <button
                  key={value}
                  onClick={() => setColorTheme(value)}
                  className={cn(
                    'flex flex-col items-center gap-2 group transition-transform hover:scale-110',
                    colorTheme === value && 'scale-110'
                  )}
                  title={label}
                >
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full transition-all border-4',
                      colorTheme === value
                        ? 'border-foreground shadow-lg'
                        : 'border-transparent hover:border-muted-foreground/30'
                    )}
                    style={{
                      backgroundColor: isDark ? darkColor : color,
                    }}
                  />
                  <span className={cn(
                    'text-xs font-medium transition-colors',
                    colorTheme === value ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                  )}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
