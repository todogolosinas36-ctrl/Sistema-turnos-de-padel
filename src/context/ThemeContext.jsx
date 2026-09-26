import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const ThemeContext = createContext();

const VALID_THEMES = ['pro', 'cyan', 'rose'];

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('puntoexe-theme');
    return VALID_THEMES.includes(saved) ? saved : 'pro';
  });

  const changeTheme = (newTheme) => {
    const themeToSave = VALID_THEMES.includes(newTheme) ? newTheme : 'pro';
    setTheme(themeToSave);
    localStorage.setItem('puntoexe-theme', themeToSave);
  };

  useEffect(() => {
    const saved = localStorage.getItem('puntoexe-theme');
    setTheme(VALID_THEMES.includes(saved) ? saved : 'pro');
  }, []);

  const value = useMemo(() => ({ theme, changeTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
