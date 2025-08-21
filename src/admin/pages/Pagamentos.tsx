import React, { useEffect, useMemo, useState } from "react";
import PaymentsTable from "../PaymentsTable";
import {
  listPagamentosAdmin,
  type AdminPagamento,
  // (opcional) se tiveres um endpoint para listar estados, poderás expor aqui:
  // listEstadosPagamentos,
} from "../services/adminPagamentosService";

type Filtro = "todos" | "socios" | "atletas";
type Tab = "inscricao" | "mensalidades";

// Estado: mantém "todos" + valores vindos dos dados
type Estado = "todos" | string;

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("inscricao"); // mantém tab atual
  const [estado, setEstado] = useState<Estado>("todos");
  const [estadosDisponiveis, setEstadosDisponiveis] = useState<string[]>([]);

  async function refresh() {
    setLoading(true);
    try {
      // passa os filtros ao service (ver alteração no service abaixo)
      const data = await listPagamentosAdmin({ scope: filtro, estado: estado === "todos" ? undefined : estado });
      setRows(data);

      // se não vier uma lista de estados do backend, derivamos dos dados
      const uniq = Array.from(
        new Set(
          (data || [])
            .map((r) => (r.status ?? "").toString().trim())
            .filter((s) => s.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, "pt"));
      setEstadosDisponiveis(uniq);
    } catch (e: any) {
      alert(e?.message || "Falha a carregar pagamentos");
    } finally {
      setLoading(false);
    }
  }

  // recarrega quando muda qualquer filtro
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, estado]);

  // pesquisa local
  const filtered = useMemo(() => {
    const base = rows;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      (r.titularName || "").toLowerCase().includes(q) ||
      (r.atletaNome || "").toLowerCase().includes(q) ||
      (r.descricao || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Pagamentos</h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de âmbito (backend) */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
            title="Âmbito (Todos | Sócios | Atletas)"
          >
            <option value="todos">Todos</option>
            <option value="socios">Sócios</option>
            <option value="atletas">Atletas</option>
          </select>

          {/* Filtro de Estado */}
          <select
            className="rounded-lg border px-2 py-1 text-sm"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Estado)}
            title="Estado do pagamento"
          >
            <option value="todos">Todos os estados</option>
            {estadosDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Pesquisa local */}
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
          tab={tab}
          onTabChange={setTab}
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
