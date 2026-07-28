"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface FeedbackValue {
  notify: (kind: ToastKind, message: string) => void;
  confirm: (request: ConfirmRequest) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}

const TOAST_MS = 4000;

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<
    (ConfirmRequest & { resolve: (ok: boolean) => void }) | null
  >(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      // Errors stay a little longer — they're the ones worth reading.
      setTimeout(() => dismiss(id), kind === "error" ? TOAST_MS * 2 : TOAST_MS);
    },
    [dismiss]
  );

  /**
   * An in-app replacement for window.confirm, which browsers silently answer
   * "false" once a page has been muted for dialogs.
   */
  const confirm = useCallback((request: ConfirmRequest) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...request, resolve });
    });
  }, []);

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        pending?.resolve(false);
        setPending(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-[var(--radius-lg)] border bg-[var(--surface-raised)] px-3.5 py-2.5 shadow-lg"
            style={{ borderColor: toneBorder(t.kind) }}
          >
            <ToastIcon kind={t.kind} />
            <p className="flex-1 text-[0.8125rem] leading-snug">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded p-0.5 text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
              aria-label="Dismiss"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 2.5l7 7m0-7l-7 7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => settle(false)}
        >
          <div
            className="w-full rounded-t-[var(--radius-lg)] border border-[var(--hairline)] bg-[var(--surface-raised)] p-5 shadow-xl sm:max-w-sm sm:rounded-[var(--radius-lg)]"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <h2 className="text-sm font-semibold tracking-tight">
              {pending.title}
            </h2>
            {pending.body && (
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-[var(--ink-secondary)]">
                {pending.body}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => settle(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => settle(true)}
                className="btn-primary"
                style={
                  pending.destructive
                    ? { background: "var(--danger)", borderColor: "var(--danger)" }
                    : undefined
                }
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

function toneBorder(kind: ToastKind) {
  if (kind === "success") return "color-mix(in srgb, #0ca30c 45%, transparent)";
  if (kind === "error") return "color-mix(in srgb, var(--danger) 45%, transparent)";
  return "var(--hairline)";
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "success") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0">
        <circle cx="8" cy="8" r="7" fill="#0ca30c" />
        <path
          d="M4.8 8.3l2.1 2.1 4.3-4.5"
          stroke="#fff"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (kind === "error") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0">
        <circle cx="8" cy="8" r="7" fill="var(--danger)" />
        <path
          d="M8 4.4v4.2M8 11.1v.5"
          stroke="#fff"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0">
      <circle cx="8" cy="8" r="7" fill="var(--accent)" />
      <path
        d="M8 7.2v4.3M8 4.6v.5"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
