// Admin · src/components/admin/PaymentsTable.tsx
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { validarPagamentoESincronizar } from "../../services/tesourariaService";

type Row = {
  id: string;
  atleta_id: string;
  descricao: string;
  comprovativo_url: string | null;
  created_at: string | null;
  validado: boolean | null;
  atleta_nome?: string;
};

export default function PaymentsTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // 1) ler pagamentos
      const { data: pagos, error } = await supabase
        .from("pagamentos")
        .select("id, atleta_id, descricao, comprovativo_url, created_at, validado")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const base: Row[] = (pagos || []) as any[];

      // 2) mapear nomes dos atletas (opcional mas útil)
      const atletaIds = Array.from(new Set(base.map((r) => r.atleta_id).filter(Boolean)));
      if (atletaIds.length) {
        const { data: atletas, error: e2 } = await supabase
          .from("atletas")
          .select("id, nome")
          .in("id", atletaIds);

        if (e2) throw e2;

        const byId = new Map<string, string>(
          (atletas || []).map((a: any) => [a.id as string, a.nome as string])
        );
        base.forEach((r) => (r.atleta_nome = byId.get(r.atleta_id) || "—"));
      }

      setRows(base);
    } catch (e) {
      console.error("[PaymentsTable] fetchRows", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    // realtime opcional
    const ch = supabase
      .channel("rt-pagamentos-admin")
      .on({ event: "*", schema: "public", table: "pagamentos" }, fetchRows)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchRows]);

  async function toggleValidado(r: Row) {
    const novo = !r.validado;
    try {
      await validarPagamentoESincronizar(r.id, novo);
      await fetchRows();
      alert(novo ? "Pagamento validado." : "Validação removida.");
    } catch (e: any) {
      alert(e?.message || "Falha a atualizar validação.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pagamentos</h2>
        <button
          className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
          onClick={fetchRows}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Atleta</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Comprovativo</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.created_at?.slice(0, 10) || "—"}</td>
                <td className="px-3 py-2">{r.atleta_nome || "—"}</td>
                <td className="px-3 py-2">{r.descricao}</td>
                <td className="px-3 py-2">
                  {r.comprovativo_url ? (
                    <a
                      className="underline"
                      href={r.comprovativo_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Abrir
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.validado ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5">
                      Validado
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5">
                      Pendente
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    className="px-3 py-1.5 rounded-lg border bg-white hover:bg-gray-50"
                    onClick={() => toggleValidado(r)}
                    disabled={loading}
                  >
                    {r.validado ? "Invalidar" : "Validar"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={6}>
                  Sem pagamentos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && <div className="text-sm text-gray-500">A carregar…</div>}
    </div>
  );
}
