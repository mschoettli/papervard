"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "papervard-theme";

type Theme = "light" | "dark";

function activeTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(activeTheme());
  }, []);

  function applyTheme(nextTheme: Theme) {
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className="inline-flex rounded-xl bg-muted p-1" role="group" aria-label="Darstellung">
      <button
        type="button"
        aria-pressed={theme === "light"}
        onClick={() => applyTheme("light")}
        className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
          theme === "light" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Sun aria-hidden="true" size={17} />
        Hell
      </button>
      <button
        type="button"
        aria-pressed={theme === "dark"}
        onClick={() => applyTheme("dark")}
        className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
          theme === "dark" ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Moon aria-hidden="true" size={17} />
        Dunkel
      </button>
    </div>
  );
}
