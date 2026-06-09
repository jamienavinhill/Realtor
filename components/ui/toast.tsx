"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type ToastVariant = "success" | "info" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  description: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Defaults to 7000. Pass 0 to disable auto-dismiss. */
  duration?: number;
  action?: ToastAction;
}

interface ToastRecord extends ToastOptions {
  id: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 7000;
/** Visible at once; additional toasts wait in the queue until a slot frees up. */
const MAX_VISIBLE = 3;
/** `window` CustomEvent name for raising a toast from non-React code. detail = ToastOptions. */
export const TOAST_EVENT = "abode:toast";

const VARIANT_STYLES: Record<
  ToastVariant,
  { ring: string; icon: React.ReactNode; live: "polite" | "assertive"; role: "status" | "alert" }
> = {
  success: {
    ring: "border-emerald-500/40",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    live: "polite",
    role: "status",
  },
  info: {
    ring: "border-primary-500/40",
    icon: <Info className="text-primary-500 h-4 w-4" />,
    live: "polite",
    role: "status",
  },
  error: {
    ring: "border-amber-500/40",
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    live: "assertive",
    role: "alert",
  },
};

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  // Track remaining time so hovering can pause auto-dismiss without dropping it.
  const remainingRef = React.useRef(toast.duration);
  const deadlineRef = React.useRef(0);
  const timerRef = React.useRef<number | null>(null);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (toast.duration <= 0) return; // sticky toast
    if (paused) return;

    deadlineRef.current = Date.now() + remainingRef.current;
    timerRef.current = window.setTimeout(() => onDismiss(toast.id), remainingRef.current);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Preserve elapsed progress so an unpause resumes rather than restarts.
      remainingRef.current = Math.max(0, deadlineRef.current - Date.now());
    };
  }, [toast.id, toast.duration, onDismiss, paused]);

  const styles = VARIANT_STYLES[toast.variant];
  // `role="alert"`/`role="status"` already imply assertive/polite live regions,
  // so we don't add a redundant aria-live attribute here (and never on a wrapper).

  return (
    <div
      role={styles.role}
      onMouseEnter={toast.duration > 0 ? () => setPaused(true) : undefined}
      onMouseLeave={toast.duration > 0 ? () => setPaused(false) : undefined}
      onFocus={toast.duration > 0 ? () => setPaused(true) : undefined}
      onBlur={toast.duration > 0 ? () => setPaused(false) : undefined}
      className={`toast-enter pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3.5 shadow-lg dark:bg-stone-900 ${styles.ring} dark:border-stone-700`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{styles.icon}</span>
        <div className="min-w-0 flex-1">
          {toast.title ? (
            <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
              {toast.title}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed break-words text-stone-600 dark:text-stone-300">
            {toast.description}
          </p>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
              className="text-primary-600 dark:text-primary-400 mt-2 cursor-pointer text-xs font-semibold hover:underline"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className="-mt-1 -mr-1 shrink-0 cursor-pointer rounded p-1 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // Single source of truth for visible + queued toasts. The first MAX_VISIBLE
  // entries are rendered; the rest wait. Keeping everything in one array (rather
  // than a separate queue ref mutated inside a state updater) means `toast()`
  // stays a pure append, so React 18 Strict Mode's double-invoked updater can
  // never duplicate or drop a toast.
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ToastRecord = {
      id,
      title: options.title,
      description: options.description,
      variant: options.variant ?? "info",
      duration: options.duration ?? DEFAULT_DURATION,
      action: options.action,
    };
    // Pure append: de-dupe by id (Strict Mode safety) and let the slice below
    // decide what is visible vs queued.
    setToasts((current) =>
      current.some((item) => item.id === id) ? current : [...current, record],
    );
    return id;
  }, []);

  // Allow non-React code (e.g. global handlers) to raise a toast by dispatching
  // a `window` CustomEvent whose detail is a ToastOptions object.
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastOptions>).detail;
      if (detail && typeof detail.description === "string") {
        toast(detail);
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [toast]);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  // Only the first MAX_VISIBLE toasts mount + run their auto-dismiss timers;
  // dismissing a visible toast promotes the next queued one automatically on
  // the next render because the array shifts forward.
  const visible = toasts.slice(0, MAX_VISIBLE);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              role="region"
              aria-label="Notifications"
              className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
            >
              {visible.map((item) => (
                <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
