// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  marcarPagamentoValidado,
  recomputeSlotsMensalidades,
  type TipoPagamento,
  type AdminPagamento,
} from "../services/adminPagamentosService";

export default function PagamentosPage() {
  const [tipo, setTipo] = useState<TipoPagamento>("mensalidade"); // Alterna entre 'mensalidade' e 'inscricao'
  const [validado, setValidado] = useState<"qualquer" | "sim" | "nao">("qualquer");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPagamentosAdmin({ tipo, validado, search: search.trim() || undefined });
      setRows(data);
    } finally {
      setLoading(false);
    }
  }, [tipo, validado, search]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onValidate(row: AdminPagamento, next: boolean) {
    await marcarPagamentoValidado(row.id, next);
    await refresh();
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.validado).length;
    const pend = total - ok;
    return { total, ok, pend };
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Tesouraria · {tipo === "mensalidade" ? "Mensalidades" : "Inscrição"}</span>
            {loading && <span className="text-xs text-gray-500">A carregar…</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="inline-flex rounded-lg overflow-hidden border">
              <button
                className={`px-3 py-1 text-sm ${tipo === "mensalidade" ? "bg-gray-900 text-white" : "bg-white"}`}
                onClick={() => setTipo("mensalidade")}
              >
                Mensalidades
              </button>
              <button
                className={`px-3 py-1 text-sm ${tipo === "inscricao" ? "bg-gray-900 text-white" : "bg-white"}`}
                onClick={() => setTipo("inscricao")}
              >
                Inscrição
              </button>
            </div>

            <select
              className="border rounded-lg px-2 py-1 text-sm"
              value={validado}
              onChange={(e) => setValidado(e.target.value as any)}
            >
              <option value="qualquer">Todos</option>
              <option value="sim">Validados</option>
              <option value="nao">Pendentes</option>
            </select>

            <input
              className="border rounded-lg px-2 py-1 text-sm"
              placeholder="Procurar descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button variant="secondary" onClick={refresh}>Atualizar</Button>
          </div>

          <div className="text-xs text-gray-600">
            {stats.total} registo(s) — {stats.ok} validado(s), {stats.pend} pendente(s).
          </div>

          <PaymentsTable rows={rows} onValidate={onValidate} />

          {tipo === "mensalidade" && (
            <div className="rounded-lg bg-amber-50 border p-3 text-sm">
              <strong>Nota:</strong> ao mudar o plano de pagamento do atleta (Mensal ⇄ Trimestral ⇄ Anual),
              as “slots” de <em>mensalidades</em> são recriadas automaticamente. Os comprovativos ligados às
              slots antigas deixam de estar associados e deverão ser <em>resubmetidos</em>.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
