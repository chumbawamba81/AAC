import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { isAdmin, listSociosEE, listAtletasAdmin, listPagamentosAdmin,
         signedUrlForStorage, marcarPagamentoValidado, atualizarSituacaoTesouraria }
  from "../services/adminService";
// … importar componentes UI reutilizados do projecto

export default function AdminApp() {
  const [authState, setAuthState] = useState<"checking" | "in" | "out">("checking");
  const [adminOk, setAdminOk] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? "in" : "out");
      if (data.session) { isAdmin().then(setAdminOk); }
    });
  }, []);
  if (authState === "checking") return <p>A verificar sessão…</p>;
  if (authState === "out")   return <p>Área restrita. Faça login.</p>;
  if (!adminOk)              return <p>Acesso negado. Conta sem privilégios.</p>;
  // …renderizar tabs com tabelas e acções
  return (
    <div>
      {/* tabs: sócios, atletas, tesouraria */}
    </div>
  );
}
