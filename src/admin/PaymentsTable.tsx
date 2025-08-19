import React, { useEffect, useMemo, useState } from "react";
import {
  listarPagamentosComUrl,
  marcarPagamentoValidado,
  atualizarSituacaoTesouraria,
  type AdminPagamento,
} from "../services/tesourariaService";

/**
 * Tabela mínima de Pagamentos (Admin)
 * - Lista pagamentos com link para o comprovativo
 * - Permite filtrar por nome do atleta/descrição
 * - Botão para Validar/Invalidar pagamento
 * - (Opcional) Atualiza situação de tesouraria do titular ao validar
 */
export default function PaymentsTable() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function refresh() {
    setBusy(true);
    try {
      const data = await listarPagamentosComUrl();
      setRows(data);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [
        r.atleta_nome ?? "",
        r.descricao ?? "",
        r.titular_email ?? "",
        r.titular_nome ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, q]);

  async function toggleValidacao(r: AdminPagamento) {
    setBusy(true);
    try {
      const novo = !r.validado;
      await marcarPagamentoValidado(r.id, novo);
      // (Opcional) sincronizar situação do titular
      if (r.titular_user_id) {
        await atualizarSituacaoTesouraria(
          r.titular_user_id,
          novo ? "Regularizado" : "Pendente"
        );
      }
      await refresh();
    } catch (e: any) {
      alert(e?.message || "Falha ao validar/invalidar pagamento");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          className="rounded-lg border px-3 py-2 text-sm w-full md:w-72"
          placeholder="Filtrar por atleta/descrição…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={refresh}
          disabled={busy}
        >
          {busy ? "A atualizar…" : "Atualizar"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Atleta</th>
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Comprovativo</th>
              <th className="py-2 pr-3">Validação</th>
              <th className="py-2 pr-3">Titular</th>
              <th className="py-2 pr-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-center text-gray-500">
                  Sem pagamentos.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-3">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString("pt-PT")
                      : "—"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.atleta_nome || r.atleta_id || "—"}
                  </td>
                  <td className="py-2 pr-3">{r.descricao || "—"}</td>
                  <td className="py-2 pr-3">
                    {r.comprovativo_url ? (
                      <a
                        href={r.comprovativo_url}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.validado ? (
                      <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">
                        Validado
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-yellow-100 text-yellow-800 px-2 py-0.5 text-xs">
                        Pendente
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.titular_nome || r.titular_email || "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="rounded-lg border px-3 py-1 text-sm"
                      onClick={() => toggleValidacao(r)}
                      disabled={busy}
                    >
                      {r.validado ? "Invalidar" : "Validar"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
