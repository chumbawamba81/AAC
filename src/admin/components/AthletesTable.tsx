import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Users, Eye } from "lucide-react";
import {
  listAtletasAdmin,
  getMissingCountsForAtletas,
  AtletaRow,
  TitularMinimal,
} from "../services/adminAtletasService";
import AthleteDetailsDialog from "./AthleteDetailsDialog";
import { supabase } from "../../supabaseClient";

type RowVM = {
  atleta: AtletaRow;
  titular?: TitularMinimal;
  missing?: number;
  insc?: { status: InscStatus; due?: string | null };
  quota?: { status: InscStatus; due?: string | null };
};

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

/* ---------- utilitários comuns ---------- */
function deriveStatus(row: {
  validado?: boolean | null;
  comprovativo_url?: string | null;
  devido_em?: string | null;
}): InscStatus {
  const ok = !!row.validado;
  const comp = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;
  if (ok) return "Regularizado";
  if (comp) return "Pendente de validação";
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}
const fmtDate = (d?: string | null) =>
  !d ? "" : new Date(d + "T00:00:00").toLocaleDateString("pt-PT");

function StatusBadge({ status }: { status: InscStatus }) {
  const map = {
    Regularizado: "bg-green-100 text-green-800",
    "Pendente de validação": "bg-yellow-100 text-yellow-800",
    "Por regularizar": "bg-gray-100 text-gray-800",
    "Em atraso": "bg-red-100 text-red-800",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

/** Escolhe o pagamento relevante por devido_em (mais próximo ≥ hoje; senão último < hoje; senão por created_at). */
function pickByDue<T extends { devido_em: string | null; created_at: string }>(list: T[] | undefined) {
  if (!list || list.length === 0) return undefined;
  const parse = (d: string | null) => (d ? new Date(d + "T00:00:00").getTime() : NaN);
  const today = new Date(); today.setHours(0,0,0,0);
  const tsToday = today.getTime();

  const withDue = list.filter(x => !!x.devido_em);
  if (withDue.length > 0) {
    const future = withDue.filter(x => parse(x.devido_em!) >= tsToday)
                          .sort((a,b) => parse(a.devido_em!) - parse(b.devido_em!));
    if (future.length > 0) return future[0];
    const past = withDue.filter(x => parse(x.devido_em!) < tsToday)
                        .sort((a,b) => parse(b.devido_em!) - parse(a.devido_em!));
    if (past.length > 0) return past[0];
  }
  return [...list].sort((a,b) => b.created_at.localeCompare(a.created_at))[0];
}

export default function AthletesTable() {
  const [rows, setRows] = useState<RowVM[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [escalao, setEscalao] = useState<string>("");
  const [tipoSocio, setTipoSocio] = useState<string>("");
  const [sort, setSort] = useState<"nome_asc" | "nome_desc" | "created_desc" | "created_asc">(
    "nome_asc"
  );

  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<RowVM | null>(null);

  // carregar listagem
  async function reload() {
    setLoading(true);
    try {
      const base = await listAtletasAdmin({ search, escalao, tipoSocio, sort });
      const vm: RowVM[] = base.map((x) => ({ atleta: x.atleta, titular: x.titular }));
      setRows(vm);

      // docs em falta, em lote
      const ids = vm.map((r) => r.atleta.id);
      const miss = await getMissingCountsForAtletas(ids);
      setRows((prev) => prev.map((r) => ({ ...r, missing: miss[r.atleta.id] ?? 0 })));

      // estados de pagamentos (INSCRIÇÃO & QUOTAS) em lote
      if (ids.length > 0) {
        type Pay = {
          atleta_id: string | null;
          tipo: string | null;
          validado: boolean | null;
          comprovativo_url: string | null;
          devido_em: string | null;
          created_at: string;
        };
        const { data: pays, error } = await supabase
          .from("pagamentos")
          .select("atleta_id, tipo, validado, comprovativo_url, devido_em, created_at")
          .in("atleta_id", ids)
          .order("created_at", { ascending: false });
        if (error) throw error;

        // agrupar por atleta e por "tipo lógico"
        const buckets: Record<string, { insc: Pay[]; quota: Pay[] }> = {};
        for (const p of (pays || []) as Pay[]) {
          if (!p.atleta_id) continue;
          const t = (p.tipo || "").toLowerCase();
          const kind: "insc" | "quota" = t.startsWith("inscri") ? "insc" : "quota";
          (buckets[p.atleta_id] ??= { insc: [], quota: [] })[kind].push(p);
        }

        setRows((prev) =>
          prev.map((r) => {
            const b = buckets[r.atleta.id] || { insc: [], quota: [] };
            const inscPay = pickByDue(b.insc);
            const quotaPay = pickByDue(b.quota);
            return {
              ...r,
              insc: inscPay
                ? { status: deriveStatus(inscPay), due: inscPay.devido_em ?? null }
                : { status: "Por regularizar", due: null },
              quota: quotaPay
                ? { status: deriveStatus(quotaPay), due: quotaPay.devido_em ?? null }
                : { status: "Por regularizar", due: null },
            };
          })
        );
      }
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
      "Escalão",
      "OpçãoPagamento",
      "Inscrição",
      "Quotas",
      "DocsEmFalta",
    ];
    const lines = [cols.join(";")];
    for (const r of rows) {
      const a = r.atleta;
      const line = [
        a.nome,
        a.escalao || "",
        a.opcao_pagamento || "",
        r.insc?.status || "",
        r.quota?.status || "",
        (r.missing ?? "").toString(),
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
              <Th>Inscrição</Th>
              <Th>Quotas</Th>
              <Th>Docs em falta</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.atleta.id} className="border-t">
              <Td>{r.atleta.nome}</Td>
              <Td>{r.atleta.escalao || "—"}</Td>
              <Td>{r.atleta.opcao_pagamento || "—"}</Td>

              <Td>
                {r.insc ? (
                  <div className="flex flex-col">
                    <StatusBadge status={r.insc.status} />
                    {r.insc.due && (
                      <span className="mt-1 text-[11px] leading-none text-gray-500">
                        Data limite: {fmtDate(r.insc.due)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </Td>

              <Td>
                {r.quota ? (
                  <div className="flex flex-col">
                    <StatusBadge status={r.quota.status} />
                    {r.quota.due && (
                      <span className="mt-1 text-[11px] leading-none text-gray-500">
                        Data limite: {fmtDate(r.quota.due)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </Td>

              <Td>{r.missing ?? "—"}</Td>
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
  return <td className="px-3 py-2 align-top">{children}</td>;
}
