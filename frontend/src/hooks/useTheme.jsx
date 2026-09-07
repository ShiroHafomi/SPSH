import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { resolveInitialTheme } from './theme';

const ThemeContext = createContext(null);

export { resolveInitialTheme } from './theme';

function readInitialTheme() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  const systemPrefersDark = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return resolveInitialTheme(savedTheme, systemPrefersDark);
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // The active theme still applies when persistence is unavailable.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
