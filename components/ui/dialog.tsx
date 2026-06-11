"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { motion } from "motion/react";

/**
 * Compact, centered, focus-trapped modal dialog shell (WS12). Shared so WS13 (CMA)
 * can reuse the exact same chrome for its row-detail dialog. Styling stays uniform
 * with `components/ui/toast.tsx` (rounded, bordered, stone palette).
 *
 * Behavior: renders into a portal on `document.body`, closes on Escape and on
 * backdrop click, traps Tab focus within the panel, restores focus to the element
 * that opened it, and carries `role="dialog"` + `aria-modal` + a labelled title.
 * The body scrolls independently so the dialog never becomes a full-page takeover.
 */

const SIZE_CLASS: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-xl",
  xl: "max-w-3xl",
  "2xl": "max-w-4xl",
  "3xl": "max-w-5xl",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Optional small text under the title (e.g. address). */
  subtitle?: React.ReactNode;
  /** Sticky footer region (e.g. action bar). */
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  children: React.ReactNode;
  /** Accessible label when `title` is not plain text. */
  ariaLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  footer,
  size = "lg",
  children,
  ariaLabel,
}: DialogProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);
  const titleId = React.useId();

  // Keep the latest onClose in a ref so the open-lifecycle effect depends only on
  // `open`. Callers pass inline arrow functions (unstable identity) for onClose;
  // depending on it directly would tear down and re-run the trap/scroll-lock on
  // every unrelated parent re-render, stealing focus back into the panel mid-edit.
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // Move focus into the panel once it mounts.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    // Lock body scroll while open so the page behind the modal does not scroll,
    // and compensate for the removed scrollbar so the layout does not shift.
    const body = document.body;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      const currentPaddingRight = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0 bg-stone-900/70 backdrop-blur-sm"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        tabIndex={-1}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className={`relative z-10 flex max-h-[88vh] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl outline-none dark:border-stone-700 dark:bg-stone-900`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="truncate text-base font-semibold text-stone-900 dark:text-stone-100"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mt-1 -mr-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="border-t border-stone-200 bg-stone-50/80 px-5 py-3 dark:border-stone-800 dark:bg-stone-950/40">
            {footer}
          </div>
        ) : null}
      </motion.div>
    </div>,
    document.body,
  );
}
