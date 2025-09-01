import React from "react";

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
