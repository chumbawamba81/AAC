// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  type AdminPagamento,
} from "../services/adminPagamentosService";

type Filtro = "todos" | "inscricao" | "mensalidades";
type Tab = "inscricao" | "mensalidades";

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("inscricao"); // ← tab controlada no parent

  async function refresh() {
    setLoading(true);
    try {
      const data = await listPagamentosAdmin(filtro);
      setRows(data);
    } catch (e: any) {
      alert(e?.message || "Falha a carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [filtro]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      (r.titularName || "").toLowerCase().includes(q) ||
      (r.atletaNome || "").toLowerCase().includes(q) ||
      (r.descricao || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Pagamentos</h1>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
            title="Filtro de backend"
          >
            <option value="todos">Todos</option>
            <option value="inscricao">Inscrições</option>
            <option value="mensalidades">Mensalidades</option>
          </select>
          <input
            className="rounded-lg border px-3 py-1 text-sm"
            placeholder="Pesquisar titular, atleta ou descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-100"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "A carregar…" : "Atualizar"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">A carregar pagamentos…</div>
      ) : (
        <PaymentsTable
          rows={filtered}
          tab={tab}                         // ← passa a tab atual
          onTabChange={setTab}              // ← e o setter
          onOpen={(row) => {
            alert(
              [
                `Titular/EE: ${row.titularName}`,
                row.atletaNome ? `Atleta: ${row.atletaNome}` : "",
                `Descrição: ${row.descricao}`,
                `Estado: ${row.status}`,
                row.createdAt ? `Submetido em: ${new Date(row.createdAt).toLocaleString()}` : "",
              ]
                .filter(Boolean)
                .join("\n")
            );
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
