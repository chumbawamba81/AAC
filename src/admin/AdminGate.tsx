// src/admin/AdminGate.tsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import AdminLogin from "./AdminLogin";
import { checkIsAdmin, type AdminState } from "../services/adminService";
import { Button } from "../components/ui/button";

type GateState =
  | { v: "checking" }
  | { v: "need-login" }
  | { v: "not-admin" }
  | { v: "ok" };

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<GateState>({ v: "checking" });

  const evaluate = useCallback(async () => {
    // 1) há sessão?
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setSt({ v: "need-login" }); return; }

    // 2) é admin?
    const r: AdminState = await checkIsAdmin();
    if (!r.ok) {
      if (r.reason === "no-session") setSt({ v: "need-login" });
      else setSt({ v: "not-admin" });
      return;
    }
    setSt({ v: "ok" });
  }, []);

  useEffect(() => {
    evaluate();
    const sub = supabase.auth.onAuthStateChange((_e, _s) => evaluate());
    return () => { sub.data.subscription.unsubscribe(); };
  }, [evaluate]);

  if (st.v === "checking") {
    return <div className="p-6 text-sm text-gray-600">A verificar permissões…</div>;
  }

  if (st.v === "need-login") {
    return <AdminLogin onLogged={evaluate} />;
  }

  if (st.v === "not-admin") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-full max-w-md border rounded-xl p-4 bg-white space-y-3 text-center">
          <h2 className="text-lg font-semibold">Sem permissões</h2>
          <p className="text-sm text-gray-600">
            A tua conta não está autorizada a aceder à área de administração.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="secondary" onClick={()=>window.location.assign("/")}>Ir para público</Button>
            <Button variant="destructive" onClick={()=>supabase.auth.signOut()}>Terminar sessão</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
