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
  React.useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  const styles = VARIANT_STYLES[toast.variant];

  return (
    <div
      role={styles.role}
      aria-live={styles.live}
      className={`pointer-events-auto w-80 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3.5 shadow-lg dark:bg-stone-900 ${styles.ring} dark:border-stone-700`}
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
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);
  const queueRef = React.useRef<ToastRecord[]>([]);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const flush = React.useCallback(() => {
    setToasts((current) => {
      if (current.length >= MAX_VISIBLE || queueRef.current.length === 0) return current;
      const slots = MAX_VISIBLE - current.length;
      const next = queueRef.current.splice(0, slots);
      return [...current, ...next];
    });
  }, []);

  const dismiss = React.useCallback(
    (id: string) => {
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
      setToasts((current) => current.filter((item) => item.id !== id));
      // A visible slot may have freed up; promote any queued toast.
      window.setTimeout(flush, 0);
    },
    [flush],
  );

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
    setToasts((current) => {
      if (current.length < MAX_VISIBLE) {
        return [...current, record];
      }
      queueRef.current.push(record);
      return current;
    });
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

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div
              aria-live="polite"
              className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
            >
              {toasts.map((item) => (
                <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}
