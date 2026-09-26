import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const VALID_THEMES = ['pro', 'cyan', 'rose'];

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
    if (saved && VALID_THEMES.includes(saved)) {
      setTheme(saved);
    } else {
      setTheme('pro');
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, changeTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
