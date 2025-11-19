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
                <a href="/" className="inline-flex items-center justify-center p-5 text-base font-medium border border-default hover:border-default-medium text-body rounded-base bg-neutral-secondary-soft hover:text-heading hover:bg-neutral-tertiary">
                    <svg aria-hidden="true" className="w-5 h-5 me-3" viewBox="0 0 22 31" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_4151_63004)"><path d="M5.50085 30.1242C8.53625 30.1242 10.9998 27.8749 10.9998 25.1035V20.0828H5.50085C2.46546 20.0828 0.00195312 22.332 0.00195312 25.1035C0.00195312 27.8749 2.46546 30.1242 5.50085 30.1242Z" fill="#0ACF83"/><path d="M0.00195312 15.062C0.00195312 12.2905 2.46546 10.0413 5.50085 10.0413H10.9998V20.0827H5.50085C2.46546 20.0827 0.00195312 17.8334 0.00195312 15.062Z" fill="#A259FF"/><path d="M0.00195312 5.02048C0.00195312 2.24904 2.46546 -0.000244141 5.50085 -0.000244141H10.9998V10.0412H5.50085C2.46546 10.0412 0.00195312 7.79193 0.00195312 5.02048Z" fill="#F24E1E"/><path d="M11 -0.000244141H16.4989C19.5343 -0.000244141 21.9978 2.24904 21.9978 5.02048C21.9978 7.79193 19.5343 10.0412 16.4989 10.0412H11V-0.000244141Z" fill="#FF7262"/><path d="M21.9978 15.062C21.9978 17.8334 19.5343 20.0827 16.4989 20.0827C13.4635 20.0827 11 17.8334 11 15.062C11 12.2905 13.4635 10.0413 16.4989 10.0413C19.5343 10.0413 21.9978 12.2905 21.9978 15.062Z" fill="#1ABCFE"/></g><defs><clipPath id="clip0_4151_63004"><rect width="22" height="30.1244" fill="white" transform="translate(0 -0.000244141)"/></clipPath></defs></svg>                                              
                    <span className="w-full">Ir para a página pública</span>
                    <svg className="w-6 h-6 ms-1 rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 12H5m14 0-4 4m4-4-4-4"/></svg>
                </a> 
              </div>
            </form>
          </CardContent>
        </Card>


      
    </div>
  );
}
