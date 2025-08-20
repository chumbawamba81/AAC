// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useState, useMemo } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listAdminPagamentos,
  openComprovativo,
  recomputeTesourariaSocio,
  type AdminPagamento,
  type NivelPagamento,
} from "../services/adminPagamentosService";

type Filtro = {
  nivel: "todos" | NivelPagamento;
  texto: string;
};

const STATUS = ["Regularizado", "Pendente", "Isento"] as const;
type StatusTesouraria = typeof STATUS[number];

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>({ nivel: "todos", texto: "" });
  const [statusAfter, setStatusAfter] = useState<StatusTesouraria>("Regularizado");
  const [targetUser, setTargetUser] = useState<string>("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await listAdminPagamentos();
      setRows(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const t = filtro.texto.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtro.nivel !== "todos" && r.nivel !== filtro.nivel) return false;
      if (!t) return true;
      const hay =
        (r.atletaNome || "").toLowerCase() +
        " " +
        (r.descricao || "").toLowerCase() +
        " " +
        (r.atletaId || "") +
        " " +
        (r.titularUserId || "");
      return hay.includes(t);
    });
  }, [rows, filtro]);

  async function aplicarStatus() {
    if (!targetUser) {
      alert("Indique o user_id do titular para atualizar a situação de tesouraria.");
      return;
    }
    try {
      await recomputeTesourariaSocio(targetUser, statusAfter);
      alert("Situação de tesouraria atualizada.");
      setTargetUser("");
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar a tesouraria.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Tesouraria · Pagamentos</div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <div className="text-xs text-gray-600">Nível</div>
          <select
            className="border rounded px-2 py-1"
            value={filtro.nivel}
            onChange={(e) => setFiltro((f) => ({ ...f, nivel: e.target.value as Filtro["nivel"] }))}
          >
            <option value="todos">Todos</option>
            <option value="socio">Sócio/EE</option>
            <option value="atleta">Atleta</option>
          </select>
        </div>

        <div className="space-y-1">
          <div className="text-xs text-gray-600">Pesquisar</div>
          <input
            className="border rounded px-2 py-1"
            placeholder="atleta / descrição / ids…"
            value={filtro.texto}
            onChange={(e) => setFiltro((f) => ({ ...f, texto: e.target.value }))}
          />
        </div>

        <button
          className="ml-auto px-3 py-1.5 rounded border hover:bg-gray-50"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "A atualizar…" : "Atualizar"}
        </button>
      </div>

      <PaymentsTable rows={filtered} onOpen={openComprovativo} />

      <div className="mt-6 border rounded-lg p-3 bg-white">
        <div className="font-medium mb-2">Atualizar situação de tesouraria do titular</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="space-y-1">
            <div className="text-xs text-gray-600">user_id do titular</div>
            <input
              className="border rounded px-2 py-1 w-full"
              placeholder="UUID do titular (dados_pessoais.user_id)"
              value={targetUser}
              onChange={(e) => setTargetUser(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-gray-600">Nova situação</div>
            <select
              className="border rounded px-2 py-1 w-full"
              value={statusAfter}
              onChange={(e) => setStatusAfter(e.target.value as StatusTesouraria)}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button className="px-3 py-2 rounded bg-black text-white" onClick={aplicarStatus}>
              Aplicar
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Dica: para pagamentos de atletas, o <code>user_id</code> é o do titular do atleta (coluna <code>atletas.user_id</code>).
        </p>
      </div>
    </div>
  );
}
