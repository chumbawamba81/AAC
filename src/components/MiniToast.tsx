import React from "react";

/** ------------------------------------------------------------------
 * Mini Toast local (hook) + Portal Global (showToast) para uso em todo o app
 * ------------------------------------------------------------------ */

/** Hook de mini-toast local, sem dependências externas */
export function useMiniToast() {
  const [msg, setMsg] = React.useState<string | null>(null);
  const [type, setType] = React.useState<"ok" | "err">("ok");

  const show = React.useCallback((text: string, t: "ok" | "err" = "ok") => {
    setType(t);
    setMsg(text);
    window.setTimeout(() => setMsg(null), 3000);
  }, []);

  const Toast = React.useCallback(() => {
    if (!msg) return null;
    return (
      <div
        className={`fixed bottom-4 right-4 z-50 rounded-lg px-3 py-2 text-sm shadow-md ${
          type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}
        role="status"
        aria-live="polite"
      >
        {msg}
      </div>
    );
  }, [msg, type]);

  return { show, Toast };
}

/** ---------------- Portal global ----------------
 *  Permite disparar toasts a partir de QUALQUER ficheiro com showToast()
 *  Sem providers nem props a circular.
 */
type MiniToastEvent = { text: string; type: "ok" | "err" };

const EVT = "mini-toast";
export function showToast(text: string, type: "ok" | "err" = "ok") {
  const detail: MiniToastEvent = { text, type };
  window.dispatchEvent(new CustomEvent(EVT, { detail }));
}

/** Componente que escuta eventos globais e mostra o toast */
export function MiniToastPortal() {
  const [visible, setVisible] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  const [type, setType] = React.useState<"ok" | "err">("ok");

  React.useEffect(() => {
    let hideTimer: number | undefined;
    function onEvt(e: Event) {
      const ce = e as CustomEvent<MiniToastEvent>;
      setMsg(ce.detail.text);
      setType(ce.detail.type);
      setVisible(true);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setVisible(false), 3000);
    }
    window.addEventListener(EVT, onEvt as EventListener);
    return () => {
      window.removeEventListener(EVT, onEvt as EventListener);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 rounded-lg px-3 py-2 text-sm shadow-md ${
        type === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
      }`}
      role="status"
      aria-live="polite"
    >
      {msg}
    </div>
  );
}

/** Tenta inferir um nome de ficheiro legível a partir de signedUrl/comprovativo_url */
export function inferFileName(row?: { signedUrl?: string | null; comprovativo_url?: string | null } | null) {
  const src = row?.signedUrl || row?.comprovativo_url || "";
  if (!src) return null;
  try {
    const base = src.split("?")[0];
    const raw = base.split("/").pop() || "";
    const decoded = decodeURIComponent(raw);
    return decoded || null;
  } catch {
    return null;
  }
}
