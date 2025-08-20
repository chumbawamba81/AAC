// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  type AdminPagamento,
} from "../services/adminPagamentosService";

type Filtro = "todos" | "inscricao" | "mensalidades";

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [search, setSearch] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const data = await listPagamentosAdmin(filtro);
      setRows(data);
    } catch (e: any) {
      console.error("[Admin Pagamentos] load", e);
      alert(e?.message || "Falha a carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [filtro]); // recarrega ao mudar filtro

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
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-lg font-semibold">Tesouraria · Pagamentos</div>
          <div className="text-xs text-gray-500">
            Validar comprovativos, ver detalhes e abrir ficheiros.
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
          >
            <option value="todos">Todos</option>
            <option value="inscricao">Só inscrições</option>
            <option value="mensalidades">Só mensalidades</option>
          </select>

          <input
            className="border rounded-lg px-3 py-2 text-sm"
            placeholder="Pesquisar titular/atleta/descrição…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className="border rounded-lg px-3 py-2 text-sm hover:bg-gray-50"
            onClick={() => refresh()}
          >
            Recarregar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">A carregar…</div>
      ) : (
        <PaymentsTable
          rows={filtered}
          onOpen={(row) => {
            // podes trocar para um Dialog com mais campos
            alert(
              [
                `Titular/EE: ${row.titularName}`,
                row.atletaNome ? `Atleta: ${row.atletaNome}` : "",
                `Descrição: ${row.descricao}`,
                `Estado: ${row.status}`,
                row.createdAt ? `Submetido em: ${new Date(row.createdAt).toLocaleString()}` : "",
              ].filter(Boolean).join("\n")
            );
          }}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
