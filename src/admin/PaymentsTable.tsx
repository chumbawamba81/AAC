import React, { useEffect, useMemo, useState } from "react";
import type { AdminPagamento } from "./services/adminPagamentosService";
import { marcarPagamentoValidado } from "./services/adminPagamentosService";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "inscricao" | "mensalidades";

type Props = {
  rows: AdminPagamento[];
  tab: Tab;
  onTabChange: (t: Tab) => void;
  onOpen: (row: AdminPagamento) => void; // compat
  onChanged?: () => void;
  // NOVO: contagens para mostrar nas tabs (aplicam pesquisa + filtro de estado)
  inscricoesCount?: number;
  mensalidadesCount?: number;
  limit?: number;
};

function StatusBadge({ status }: { status: AdminPagamento["status"] }) {
  const map: Record<AdminPagamento["status"], string> = {
    "Regularizado": "bg-green-50 text-green-700 inset-ring-green-600/20",
    "Pendente de validação": "bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20",
    "Por regularizar": "bg-gray-50 text-gray-600 inset-ring-gray-500/10",
    "Em atraso": "bg-red-50 text-red-700 inset-ring-red-600/10",
  };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring ${map[status]}`}>
      {status}
    </span>
  );
}

function fmtDate(d: string | null | undefined, withTime = true) {
  if (!d) return "—";
  const date = new Date(d);
  try {
    return withTime ? date.toLocaleString() : date.toLocaleDateString();
  } catch {
    return withTime ? date.toISOString() : date.toISOString().slice(0, 10);
  }
}

/** Heurística local para separar inscrição vs mensalidades (para fallback de contagens, se necessário) */
function isInscricao(row: AdminPagamento): boolean {
  if (row.nivel === "socio") return true;
  const t = (row.tipo ?? "").toLowerCase();
  if (t.includes("inscri")) return true;
  return (row.descricao ?? "").toLowerCase().includes("inscri");
}

/** Plano inativo para sócio ou sénior sub-23 / masters */
function isPlanoInativo(nivel: AdminPagamento["nivel"], escalao?: string | null) {
  if (nivel === "socio") return true;
  const e = (escalao || "").toLowerCase();
  return (
    e.includes("master") ||
    e.includes("masters") ||
    e.includes("sub 23") ||
    e.includes("sub-23") ||
    e.includes("seniores sub 23") ||
    e.includes("seniores sub-23")
  );
}

function TableView({
  rows,
  onChanged,
}: {
  rows: AdminPagamento[];
  onChanged?: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(row: AdminPagamento, next: boolean) {
    try {
      setBusyId(row.id);
      await marcarPagamentoValidado(row.id, next);
      onChanged?.();
    } catch (e: any) {
      alert(e?.message || "Não foi possível alterar a validação.");
    } finally {
      setBusyId(null);
    }
  }

  if (!rows || rows.length === 0) {
    return <div className="text-sm text-gray-500">Sem pagamentos nesta categoria.</div>;
  }

  return (
    <div className="overflow-x-auto border">
      <table className="min-w-[1120px] w-full text-sm">
          <thead>
            <tr className="bg-neutral-700 text-white uppercase">
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Titular/EE</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de sócio</th>
              <th className="text-left px-3 py-2 font-medium">Atleta</th>
              <th className="text-left px-3 py-2 font-medium">Escalão</th>
              <th className="text-left px-3 py-2 font-medium">Plano de Pagamento</th>
              <th className="text-left px-3 py-2 font-medium">Descrição</th>
              <th className="text-left px-3 py-2 font-medium">Estado</th>
              <th className="text-left px-3 py-2 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r, index) => {
            const planoInativo = isPlanoInativo(r.nivel, r.atletaEscalao);
            const planoLabel = r.atletaPlano || "—";
            return (
              <tr key={r.id} className={`border-t ${
                index % 2 === 0 ? "bg-neutral-100" : "bg-neutral-300"
              } hover:bg-amber-400`}>
                <td className="px-3 py-2 whitespace-nowrap text-[0.7rem]">
                  {fmtDate(r.createdAt).split(", ").map((part, i) => (
                    <div key={i}>{part}</div>
                  ))}
                </td>
                <td className="px-3 py-2">{r.titularName || "—"}</td>
                <td className="px-3 py-2 text-[0.7rem]">{r.titularTipoSocio || "—"}</td>
                <td className="px-3 py-2">{r.atletaNome ?? "—"}</td>
                <td className="px-3 py-2 text-[0.7rem]">{r.atletaEscalao || "—"}</td>
                <td className={`px-3 py-2 text-[0.8rem] ${planoInativo ? "text-gray-400 italic" : ""}`}>
                  {planoInativo ? "—" : planoLabel}
                </td>
                <td className="px-3 py-2 text-[0.7rem]">{r.descricao}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    {r.signedUrl ? (
                      <Button variant="stone" onClick={() => {
                        window.open(r.signedUrl, "_blank");
                      }}>
                        <Download className="h-4 w-4 mr-1" />
                      </Button>
                    ) : null}

                    <button
                      disabled={busyId === r.id}
                      className={`inline-flex items-center justify-center gap-1.5 transition active:scale-[.98] cursor-pointer text-sm h-8 px-3 rounded-md ${
                        r.validado
                          ? "bg-red-600 text-white hover:bg-red-700"
                          : "bg-green-600 text-white hover:bg-green-700"
                      }`}
                      onClick={() => toggle(r, !r.validado)}
                    >
                      {r.validado ? "Anular" : "Validar"}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PaymentsTable({
  rows,
  tab,
  onTabChange,
  onOpen: _onOpen,
  onChanged,
  inscricoesCount,
  mensalidadesCount,
  limit = 20,
}: Props) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when search or tab changes
  useEffect(() => {
    setPage(1);
  }, [q, tab]);

  const filteredRows = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      const titular = (r.titularName || "").toLowerCase();
      const atleta = (r.atletaNome || "").toLowerCase();
      return titular.includes(q) || atleta.includes(q);
    });
  }, [rows, q]);

  // fallback para contagens se não vierem do parent (divide localmente o subset)
  const { inscricoes, mensalidades } = useMemo(() => {
    const insc: AdminPagamento[] = [];
    const mens: AdminPagamento[] = [];
    for (const r of filteredRows ?? []) {
      (isInscricao(r) ? insc : mens).push(r);
    }
    return { inscricoes: insc, mensalidades: mens };
  }, [filteredRows]);

  const countInsc = typeof inscricoesCount === "number" ? inscricoesCount : inscricoes.length;
  const countMens = typeof mensalidadesCount === "number" ? mensalidadesCount : mensalidades.length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / limit));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="sm:max-w-xs">
          <label className="block text-sm font-medium mb-1">Pesquisar</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="Titular ou atleta…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs controladas pelo parent com contagens globais (pós-filtro/pesquisa) */}
        <div className="inline-flex rounded-xl border overflow-hidden">
          <button
            onClick={() => onTabChange("inscricao")}
            className={`px-4 py-2 text-sm ${tab === "inscricao" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
          >
            Inscrições ({countInsc})
          </button>
          <button
            onClick={() => onTabChange("mensalidades")}
            className={`px-4 py-2 text-sm ${tab === "mensalidades" ? "bg-gray-900 text-white" : "bg-white hover:bg-gray-100"}`}
          >
            Mensalidades ({countMens})
          </button>
        </div>
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between">
        <div className="text-xs/6 text-gray-600 font-semibold">
          {filteredRows.length} registo(s)
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Página anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          </Button>
          <div className="text-xs/6 text-gray-600 font-semibold">Página {page}/{totalPages}</div>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Página seguinte"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-right-icon lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </Button>
        </div>
      </div>

      <TableView rows={paginatedRows} onChanged={onChanged} />
    </div>
  );
}
