import { useState, useEffect } from 'react'

export type ColorTheme = 'blue' | 'emerald' | 'rose' | 'violet' | 'orange' | 'cyan'

const COLOR_THEME_KEY = 'db-clone-color-theme'

export const colorThemes = [
  {
    value: 'blue' as ColorTheme,
    label: 'Blue',
    color: 'hsl(221, 83%, 53%)',
    darkColor: 'hsl(217, 91%, 60%)',
  },
  {
    value: 'emerald' as ColorTheme,
    label: 'Emerald',
    color: 'hsl(160, 84%, 39%)',
    darkColor: 'hsl(158, 64%, 52%)',
  },
  {
    value: 'rose' as ColorTheme,
    label: 'Rose',
    color: 'hsl(346, 77%, 50%)',
    darkColor: 'hsl(351, 95%, 71%)',
  },
  {
    value: 'violet' as ColorTheme,
    label: 'Violet',
    color: 'hsl(262, 83%, 58%)',
    darkColor: 'hsl(263, 70%, 70%)',
  },
  {
    value: 'orange' as ColorTheme,
    label: 'Orange',
    color: 'hsl(24, 95%, 53%)',
    darkColor: 'hsl(31, 97%, 72%)',
  },
  {
    value: 'cyan' as ColorTheme,
    label: 'Cyan',
    color: 'hsl(189, 94%, 43%)',
    darkColor: 'hsl(188, 86%, 53%)',
  },
]

function applyColorTheme(colorTheme: ColorTheme) {
  const root = document.documentElement
  
  // Remove all color theme classes
  colorThemes.forEach(({ value }) => {
    root.removeAttribute(`data-color-theme`)
  })
  
  // Apply the selected color theme
  if (colorTheme !== 'blue') {
    root.setAttribute('data-color-theme', colorTheme)
  }
}

export function useColorTheme() {
  const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(COLOR_THEME_KEY) as ColorTheme | null
      return stored || 'blue'
    }
    return 'blue'
  })

  useEffect(() => {
    applyColorTheme(colorTheme)
  }, [colorTheme])

  const setColorTheme = (newColorTheme: ColorTheme) => {
    localStorage.setItem(COLOR_THEME_KEY, newColorTheme)
    setColorThemeState(newColorTheme)
  }

  return { colorTheme, setColorTheme, colorThemes }
}
