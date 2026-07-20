import React, { createContext, useContext, useState, useEffect } from "react";
import { type Lang } from "@/lib/i18n";
import { useLangPref } from "@/lib/health-store";

interface LanguageContextType {
  language: Lang;
  setLanguage: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [langPref, setLangPref] = useLangPref();
  const [language, setLanguageState] = useState<Lang>(langPref || "en");

  useEffect(() => {
    if (langPref && langPref !== language) {
      setLanguageState(langPref);
    }
  }, [langPref]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (newLang: Lang) => {
    setLangPref(newLang);
    setLanguageState(newLang);
    document.documentElement.lang = newLang;
    window.dispatchEvent(new CustomEvent("hg:language-change"));
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguageContext = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguageContext must be used within a LanguageProvider");
  }
  return context;
};
