"use client";

import React, { useEffect, useState } from "react";
import { Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";

const DEFAULT_ACCENT = "#f43f5e";

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function toHex(value: number) {
  return value.toString(16).padStart(2, "0");
}

function mix(color: string, target: "white" | "black", amount: number) {
  const rgb = hexToRgb(color);
  const targetValue = target === "white" ? 255 : 0;
  const next = {
    r: Math.round(rgb.r + (targetValue - rgb.r) * amount),
    g: Math.round(rgb.g + (targetValue - rgb.g) * amount),
    b: Math.round(rgb.b + (targetValue - rgb.b) * amount),
  };

  return `#${toHex(next.r)}${toHex(next.g)}${toHex(next.b)}`;
}

function applyAccent(color: string) {
  const root = document.documentElement;

  root.style.setProperty("--primary-50", mix(color, "white", 0.95));
  root.style.setProperty("--primary-100", mix(color, "white", 0.88));
  root.style.setProperty("--primary-200", mix(color, "white", 0.76));
  root.style.setProperty("--primary-300", mix(color, "white", 0.58));
  root.style.setProperty("--primary-400", mix(color, "white", 0.32));
  root.style.setProperty("--primary-500", color);
  root.style.setProperty("--primary-600", mix(color, "black", 0.12));
  root.style.setProperty("--primary-700", mix(color, "black", 0.24));
  root.style.setProperty("--primary-800", mix(color, "black", 0.38));
  root.style.setProperty("--primary-900", mix(color, "black", 0.52));
  root.style.setProperty("--primary-950", mix(color, "black", 0.72));
}

export function ThemeControls() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);

  useEffect(() => {
    const savedAccent = localStorage.getItem("app-accent-color") || DEFAULT_ACCENT;
    setAccentColor(savedAccent);
    applyAccent(savedAccent);
    setMounted(true);
  }, []);

  const changeAccent = (color: string) => {
    setAccentColor(color);
    applyAccent(color);
    localStorage.setItem("app-accent-color", color);
  };

  if (!mounted) return null;

  return (
    <div className="flex items-center space-x-2">
      <label
        className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        title="Accent color"
      >
        <Palette className="h-4 w-4" />
        <span className="sr-only">Choose accent color</span>
        <input
          type="color"
          value={accentColor}
          onChange={(event) => changeAccent(event.target.value)}
          className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
          aria-label="Accent color"
        />
      </label>

      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
        title="Toggle theme"
      >
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
