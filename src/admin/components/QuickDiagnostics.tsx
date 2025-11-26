// src/admin/components/QuickDiagnostics.tsx
import React, { useState } from "react";
import { supabase } from "../../supabaseClient";

// Se o admin partilha os mesmos UI components do site principal:
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";

// Se no teu projeto os UI do admin vivem em src/admin/components/ui,
// troca as duas linhas acima por:
// import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
// import { Button } from "../ui/button";

export default function QuickDiagnostics() {
  const [busy, setBusy] = useState<"none" | "storage" | "table">("none");
  const [msg, setMsg] = useState<string>("");

  async function testStorage() {
    setBusy("storage"); setMsg("");
    try {
      const { data, error } = await supabase.storage.from("pagamentos").list("", { limit: 1 });
      if (error) throw error;
      setMsg(`Storage OK (${data?.length ?? 0} item(ns) visíveis)`);
    } catch (e: any) {
      setMsg(`Storage ERRO: ${e?.message || e}`);
    } finally { setBusy("none"); }
  }

  async function testTable() {
    setBusy("table"); setMsg("");
    try {
      const { error } = await supabase.from("pagamentos").select("id", { count: "exact", head: true }).limit(1);
      if (error) throw error;
      setMsg("Tabela OK");
    } catch (e: any) {
      setMsg(`Tabela ERRO: ${e?.message || e}`);
    } finally { setBusy("none"); }
  }

  return (
    <Card className="bg-slate-50">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Diagnóstico rápido</CardTitle>
        <div className="flex gap-3">
          <Button variant="dark" onClick={testStorage} disabled={busy !== "none"}>
            Testar Storage
          </Button>
          <Button variant="dark" onClick={testTable} disabled={busy !== "none"}>
            Testar Tabela
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {msg ? <p className="text-sm">{msg}</p> : <p className="text-sm text-gray-500">Sem mensagens.</p>}
      </CardContent>
    </Card>
  );
}
