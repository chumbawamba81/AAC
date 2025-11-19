// src/admin/AdminGate.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GateState =
  | { status: "checking" }
  | { status: "denied"; reason?: "not_authenticated" | "not_admin" | "error"; message?: string }
  | { status: "ok"; userId: string };

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "checking" });

  useEffect(() => {
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user;
        if (!user) {
          setState({ status: "denied", reason: "not_authenticated" });
          return;
        }
        const { data, error } = await supabase
          .from("admins")
          .select("user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          setState({ status: "denied", reason: "error", message: error.message });
          return;
        }
        if (!data) {
          setState({ status: "denied", reason: "not_admin" });
          return;
        }
        setState({ status: "ok", userId: user.id });
      } catch (e: any) {
        setState({ status: "denied", reason: "error", message: e?.message || "Erro inesperado" });
      }
    })();
  }, []);

  if (state.status === "checking") {
    return <div className="p-6 text-sm text-gray-600">A verificar acesso…</div>;
  }

  if (state.status === "ok") {
    return <>{children}</>;
  }

  // Estado "denied": mostra pequeno formulário de login inline (email+password)
  return <AdminLogin onLogged={() => window.location.reload()} state={state} />;
}

function AdminLogin({
  onLogged,
  state,
}: {
  onLogged: () => void;
  state: Extract<GateState, { status: "denied" }>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      const userId = data?.user?.id;
      if (!userId) throw new Error("Sessão inválida após login.");
      // confirmar que é admin
      const { data: row } = await supabase.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (!row) throw new Error("Utilizador autenticado não consta na lista de administradores.");
      onLogged();
    } catch (e: any) {
      setError(e?.message || "Falha no login");
    } finally {
      setBusy(false);
    }
  }

  const reasonMsg =
    state.reason === "not_authenticated"
      ? "Precisas de iniciar sessão para aceder à área de administração."
      : state.reason === "not_admin"
      ? "A tua conta não tem privilégios de administrador."
      : state.message
      ? state.message
      : null;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Admin · AAC-SB
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {reasonMsg && <p className="text-sm text-gray-600 mb-3">{reasonMsg}</p>}
            <form className="space-y-3" onSubmit={submit}>
              <div className="space-y-1">
                <label className="text-sm font-medium">Email</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Palavra-passe</label>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  className="rounded-xl px-3 py-2 text-sm font-semibold bg-black text-white disabled:opacity-60"
                  disabled={busy}
                >
                  {busy ? "A entrar…" : "Entrar"}
                </button>
                <a href="/" className="text-sm underline">
                  Ir para a página pública
                </a>
              </div>
            </form>
          </CardContent>
        </Card>


      
    </div>
  );
}
