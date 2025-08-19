// src/admin/pages/Socios.tsx
import React, { useEffect, useMemo, useState } from "react";
import SociosTable from "../components/SociosTable";

type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria";
type OrderDir = "asc" | "desc";

export default function SociosPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "Regularizado" | "Pendente" | "Parcial">("");
  const [orderBy, setOrderBy] = useState<OrderBy>("created_at");
  const [orderDir, setOrderDir] = useState<OrderDir>("desc");

  // debounce simples para a pesquisa
  const [q, setQ] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const key = useMemo(
    () => [q, status || "-", orderBy, orderDir].join("|"),
    [q, status, orderBy, orderDir]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Pesquisar</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Nome, email, telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Situação de tesouraria</label>
          <select
            className="rounded-xl border px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="">(todas)</option>
            <option value="Regularizado">Regularizado</option>
            <option value="Pendente">Pendente</option>
            <option value="Parcial">Parcial</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ordenar por</label>
          <div className="flex gap-2">
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={orderBy}
              onChange={(e) => setOrderBy(e.target.value as any)}
            >
              <option value="created_at">Data (criação)</option>
              <option value="nome_completo">Nome</option>
              <option value="email">Email</option>
              <option value="situacao_tesouraria">Tesouraria</option>
            </select>
            <select
              className="rounded-xl border px-3 py-2 text-sm"
              value={orderDir}
              onChange={(e) => setOrderDir(e.target.value as any)}
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>
      </div>

      {/* força remount quando filtros mudam (simplifica paginação) */}
      <SociosTable key={key} search={q} status={status} orderBy={orderBy} orderDir={orderDir} />
    </div>
  );
}
