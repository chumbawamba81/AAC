// src/components/ui/toaster.tsx
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ToastVariant = "default" | "destructive";
type Toast = {
  id: number;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms
};

type ToastContextValue = {
  toast: (t: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // fallback no-op para SSR/testes
    return { toast: (_: Omit<Toast, "id">) => {} };
  }
  return ctx;
}

export function Toaster({ children }: { children?: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = idRef.current++;
    const item: Toast = {
      id,
      duration: 4000,
      variant: "default",
      ...t,
    };
    setItems((prev) => [...prev, item]);
    if (item.duration && item.duration > 0) {
      window.setTimeout(() => remove(id), item.duration);
    }
  }, [remove]);

  const value = useMemo(() => ({ toast }), [toast]);

  const body = (
    <ToastContext.Provider value={value}>
      {children}
      {/* container */}
      <div className="fixed z-[9999] top-4 right-4 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={[
              "w-80 rounded-xl border p-3 shadow-md bg-white text-gray-900",
              t.variant === "destructive" ? "border-red-300 bg-red-50 text-red-900" : "border-gray-200",
            ].join(" ")}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                {t.title && <div className="font-medium">{t.title}</div>}
                {t.description && <div className="text-sm opacity-80">{t.description}</div>}
              </div>
              <button
                className="opacity-60 hover:opacity-100 transition"
                onClick={() => remove(t.id)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );

  // Tenta portal → se falhar (SSR), render inline
  const root = typeof document !== "undefined" ? document.body : null;
  return root ? createPortal(body, root) : body;
}
