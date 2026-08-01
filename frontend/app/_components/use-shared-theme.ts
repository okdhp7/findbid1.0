"use client";

import { useCallback, useEffect, useState } from "react";

export type ColorTheme = "dark" | "light";

const THEME_STORAGE_KEY = "findbid.color-theme.v1";

function isColorTheme(value: string | null): value is ColorTheme {
  return value === "dark" || value === "light";
}

function applyThemeToDocument(theme: ColorTheme) {
  document.documentElement.dataset.findbidTheme = theme;
}

export function useSharedTheme() {
  const [theme, setTheme] = useState<ColorTheme>("light");

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isColorTheme(storedTheme)) {
        applyThemeToDocument(storedTheme);
        setTheme(storedTheme);
      } else {
        applyThemeToDocument("light");
      }
    } catch {
      // Keep the default theme when browser storage is unavailable.
    }

    const syncTheme = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isColorTheme(event.newValue)) {
        applyThemeToDocument(event.newValue);
        setTheme(event.newValue);
      }
    };

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme: ColorTheme = currentTheme === "dark" ? "light" : "dark";
      applyThemeToDocument(nextTheme);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // The current page still switches theme when storage is unavailable.
      }
      return nextTheme;
    });
  }, []);

  return { theme, toggleTheme };
}
