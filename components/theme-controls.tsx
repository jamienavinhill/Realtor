"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun, Palette } from "lucide-react";
import { useTheme } from "next-themes";

const accents = [
  { id: "rose", color: "#f43f5e" },
  { id: "blue", color: "#3b82f6" },
  { id: "emerald", color: "#10b981" },
  { id: "amber", color: "#f59e0b" },
  { id: "violet", color: "#8b5cf6" },
];

export function ThemeControls() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Load saved accent
    const savedAccent = localStorage.getItem("app-accent") || "rose";
    document.documentElement.setAttribute("data-accent", savedAccent);
  }, []);

  const changeAccent = (id: string) => {
    document.documentElement.setAttribute("data-accent", id);
    localStorage.setItem("app-accent", id);
    setPickerOpen(false);
  };

  if (!mounted) return null;

  return (
    <div className="flex items-center space-x-2">
      <div className="relative">
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          title="Accent Color"
        >
          <Palette className="w-4 h-4" />
        </button>
        
        {pickerOpen && (
          <div className="absolute right-0 top-full mt-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl flex gap-2 p-3 z-50">
            {accents.map((acc) => (
              <button
                key={acc.id}
                onClick={() => changeAccent(acc.id)}
                className="w-6 h-6 rounded-full border-2 border-transparent hover:scale-110 transition-transform focus:outline-none"
                style={{ backgroundColor: acc.color, borderColor: document.documentElement.getAttribute("data-accent") === acc.id ? "white" : "transparent" }}
              />
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
        title="Toggle Theme"
      >
        {resolvedTheme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </div>
  );
}
