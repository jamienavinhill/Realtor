"use client";

import React, { useEffect, useRef, useState } from "react";
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

function mix(color: string, targetColor: string, amount: number) {
  const rgb = hexToRgb(color);
  const targetRgb = hexToRgb(targetColor);
  const next = {
    r: Math.round(rgb.r + (targetRgb.r - rgb.r) * amount),
    g: Math.round(rgb.g + (targetRgb.g - rgb.g) * amount),
    b: Math.round(rgb.b + (targetRgb.b - rgb.b) * amount),
  };

  return `#${toHex(next.r)}${toHex(next.g)}${toHex(next.b)}`;
}

function applyAccent(color: string) {
  const root = document.documentElement;

  root.style.setProperty("--primary-50", mix(color, "#ffffff", 0.95));
  root.style.setProperty("--primary-100", mix(color, "#ffffff", 0.88));
  root.style.setProperty("--primary-200", mix(color, "#ffffff", 0.76));
  root.style.setProperty("--primary-300", mix(color, "#ffffff", 0.58));
  root.style.setProperty("--primary-400", mix(color, "#ffffff", 0.32));
  root.style.setProperty("--primary-500", color);
  root.style.setProperty("--primary-600", mix(color, "#000000", 0.12));
  root.style.setProperty("--primary-700", mix(color, "#000000", 0.24));
  root.style.setProperty("--primary-800", mix(color, "#000000", 0.38));
  root.style.setProperty("--primary-900", mix(color, "#000000", 0.52));
  root.style.setProperty("--primary-950", mix(color, "#000000", 0.72));

  // Rich categorical palette for charts (distinct pink / purple / orange tones that work beautifully
  // on the dark UI and harmonize with whatever accent the user picked). --chart-1 stays tied to the
  // live accent for primary series; the others are warm distinct hues for variety in bars/pies.
  root.style.setProperty("--chart-1", color);
  root.style.setProperty("--chart-2", "#f472b6"); // pink/rose
  root.style.setProperty("--chart-3", "#a78bfa"); // purple/violet
  root.style.setProperty("--chart-4", "#fb923c"); // orange/amber
  root.style.setProperty("--chart-5", mix(color, "#0ea5e9", 0.35)); // subtle cool accent complement
}

export function ThemeControls() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const colorInputRef = useRef<HTMLInputElement>(null);

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
      <button
        type="button"
        onClick={() => colorInputRef.current?.click()}
        className="relative cursor-pointer rounded-lg p-2 transition hover:bg-stone-100 dark:hover:bg-stone-800"
        title="Accent color"
        aria-label="Choose accent color"
      >
        <Palette className="h-4 w-4" style={{ color: accentColor }} />
        <input
          ref={colorInputRef}
          type="color"
          value={accentColor}
          onChange={(event) => changeAccent(event.target.value)}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-0 w-0 opacity-0"
        />
      </button>

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
