// src/admin/components/AthletesTable.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Users, Eye } from "lucide-react";
import {
  listAtletasAdmin,
  getMissingCountsForAtletas,
  AtletaRow,
  TitularMinimal,
} from "../services/adminAtletasService";
import AthleteDetailsDialog from "./AthleteDetailsDialog";

type RowVM = {
  atleta: AtletaRow;
  titular?: TitularMinimal;
  missing?: number;
};

export default function AthletesTable() {
  const [rows, setRows] = useState<RowVM[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [escalao, setEscalao] = useState<string>("");
  const [tipoSocio, setTipoSocio] = useState<string>("");
  const [sort, setSort] = useState<"nome_asc" | "nome_desc" | "created_desc" | "created_asc">("nome_asc");

  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<RowVM | null>(null);

  // carregar listagem
  async function reload() {
    setLoading(true);
    try {
      const base = await listAtletasAdmin({ search, escalao, tipoSocio, sort });
      const vm: RowVM[] = base.map((x) => ({ atleta: x.atleta, titular: x.titular }));
      setRows(vm);

      // missing em lote
      const ids = vm.map((r) => r.atleta.id);
      const miss = await getMissingCountsForAtletas(ids);
      setRows((prev) => prev.map((r) => ({ ...r, missing: miss[r.atleta.id] ?? 0 })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, escalao, tipoSocio, sort]);

  const escaloes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.atleta.escalao && s.add(r.atleta.escalao));
    return Array.from(s).sort();
  }, [rows]);

  function exportCSV() {
    const cols = [
      "Nome",
      "DataNascimento",
      "Escalão",
      "OpçãoPagamento",
      "Titular",
      "TipoSócio",
      "EmailTitular",
      "TelefoneTitular",
      "DocsEmFalta",
      "Tesouraria",
    ];
    const lines = [cols.join(";")];
    for (const r of rows) {
      const a = r.atleta;
      const t = r.titular;
      const line = [
        a.nome,
        a.data_nascimento,
        a.escalao || "",
        a.opcao_pagamento || "",
        t?.nome_completo || "",
        t?.tipo_socio || "",
        t?.email || "",
        t?.telefone || "",
        (r.missing ?? "").toString(),
        t?.situacao_tesouraria || "",
      ]
        .map((v) => (v ?? "").toString().replace(/;/g, ","))
        .join(";");
      lines.push(line);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const aEl = document.createElement("a");
    aEl.href = url;
    aEl.download = "atletas.csv";
    aEl.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Atletas
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm inline-flex items-center gap-2"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </button>
          <button
            onClick={reload}
            className="px-3 py-2 rounded bg-gray-100 hover:bg-gray-200 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <div className="col-span-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-500" />
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="rounded-xl border px-3 py-2 text-sm"
          value={escalao}
          onChange={(e) => setEscalao(e.target.value)}
        >
          <option value="">Escalão — todos</option>
          {escaloes.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>

        <select
          className="rounded-xl border px-3 py-2 text-sm"
          value={tipoSocio}
          onChange={(e) => setTipoSocio(e.target.value)}
        >
          <option value="">Tipo de sócio — todos</option>
          <option value="Sócio Pro">Sócio Pro</option>
          <option value="Sócio Família">Sócio Família</option>
          <option value="Sócio Geral Renovação">Sócio Geral Renovação</option>
          <option value="Sócio Geral Novo">Sócio Geral Novo</option>
          <option value="Não pretendo ser sócio">Não pretendo ser sócio</option>
        </select>

        <select
          className="rounded-xl border px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
        >
          <option value="nome_asc">Ordenar: Nome ↑</option>
          <option value="nome_desc">Ordenar: Nome ↓</option>
          <option value="created_desc">Ordenar: Recentes</option>
          <option value="created_asc">Ordenar: Antigos</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <Th>Nome</Th>
              <Th>Escalão</Th>
              <Th>Opção pagamento</Th>
              <Th>Tipo de sócio</Th>
              <Th>Docs em falta</Th>
              <Th>Tesouraria</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.atleta.id} className="border-t">
                <Td>{r.atleta.nome}</Td>
                <Td>{r.atleta.escalao || "—"}</Td>
                <Td>{r.atleta.opcao_pagamento || "—"}</Td>
                <Td>{r.titular?.tipo_socio || "—"}</Td>
                <Td>{r.missing ?? "—"}</Td>
                <Td>{r.titular?.situacao_tesouraria || "—"}</Td>
                <Td>
                  <button
                    className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 inline-flex items-center gap-1"
                    onClick={() => {
                      setFocus(r);
                      setOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4" /> Detalhes
                  </button>
                </Td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">
                  Sem resultados.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="text-center py-6 text-gray-500">
                  A carregar…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {focus && (
        <AthleteDetailsDialog
          open={open}
          onClose={() => setOpen(false)}
          atleta={focus.atleta}
          titular={focus.titular}
        />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2">{children}</td>;
}
