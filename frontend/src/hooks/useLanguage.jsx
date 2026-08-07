import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import en from '../locales/en';
import vi from '../locales/vi';

const LanguageContext = createContext(null);

const LOCALES = { en, vi };
const LANG_NAMES = { en: 'English', vi: 'Tiếng Việt' };
const LANG_FLAGS = { en: 'EN', vi: 'VI' };

export { LANG_NAMES, LANG_FLAGS };

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('lang');
    return saved && LOCALES[saved] ? saved : 'en';
  });

  // Persist to localStorage and set html lang attribute
  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, params = {}) => {
    const keys = key.split('.');
    let value = LOCALES[lang];
    for (const k of keys) {
      if (value === undefined || value === null) break;
      value = value[k];
    }
    if (typeof value !== 'string') {
      // Fallback to English for missing keys
      let fb = LOCALES.en;
      for (const k of keys) {
        if (fb === undefined || fb === null) break;
        fb = fb[k];
      }
      if (typeof fb === 'string') {
        value = fb;
      } else {
        return key; // Return the key itself as last resort
      }
    }
    // Replace template parameters: {name}, {count}, etc.
    return value.replace(/\{(\w+)\}/g, (_, param) =>
      params[param] !== undefined ? params[param] : `{${param}}`
    );
  }, [lang]);

  const switchLang = useCallback((newLang) => {
    if (LOCALES[newLang]) {
      setLang(newLang);
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(prev => prev === 'en' ? 'vi' : 'en');
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, t, switchLang, toggleLang, langName: LANG_NAMES[lang], langFlag: LANG_FLAGS[lang] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}