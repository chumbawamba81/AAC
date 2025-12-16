import React, { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Users, Eye, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  listAtletasAdmin,
  getMissingCountsForAtletas,
  listEscaloes,
  AtletaRow,
  TitularMinimal,
  DOCS_ATLETA,              // ← total de docs esperados
} from "../services/adminAtletasService";
import AthleteDetailsDialog from "./AthleteDetailsDialog";
import AdminAtletaEdit from "./AdminAtletaEdit";
import { supabase } from "../../supabaseClient";
import { Button } from "@/components/ui/button";
import { showToast } from "@/components/MiniToast";

type RowVM = { atleta: AtletaRow; titular?: TitularMinimal; missing?: number; };

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
type StatusInfo = { status: InscStatus; due?: string | null };
type QuotasInfo = StatusInfo | "N/A";
type StatusMaps = { insc: Record<string, StatusInfo | undefined>; quotas: Record<string, QuotasInfo | undefined>; };

function isInscricaoLike(tipo?: string | null, desc?: string | null) {
  const t = (tipo ?? "").toLowerCase(); const d = (desc ?? "").toLowerCase();
  return t.includes("inscri") || d.includes("inscri");
}
function pickByDue<T extends { devido_em: string | null; created_at: string }>(list: T[] | undefined) {
  if (!list || list.length === 0) return undefined;
  const parse = (d: string | null) => (d ? new Date(d + "T00:00:00").getTime() : NaN);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tsToday = today.getTime();
  const withDue = list.filter((x) => !!x.devido_em);
  if (withDue.length > 0) {
    const future = withDue.filter((x) => parse(x.devido_em!) >= tsToday).sort((a,b)=>parse(a.devido_em!)-parse(b.devido_em!));
    if (future.length > 0) return future[0];
    const past = withDue.filter((x)=>parse(x.devido_em!)<tsToday).sort((a,b)=>parse(b.devido_em!)-parse(a.devido_em!));
    if (past.length > 0) return past[0];
  }
  return [...list].sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
}
function deriveStatus(row?: { validado?: boolean | null; comprovativo_url?: string | null; devido_em?: string | null }): InscStatus {
  if (!row) return "Por regularizar";
  if (row.validado) return "Regularizado";
  const temComp = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim());
  if (temComp) return "Pendente de validação";
  if (row.devido_em) {
    const dt = new Date(row.devido_em + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}
function quotasNaoAplicaveis(escalao?: string | null) {
  const e = (escalao || "").toLowerCase();
  return e.includes("master") || e.includes("sub 23") || e.includes("sub-23");
}
type SortableColumn = "nome" | "escalao" | "opcao_pagamento" | "inscricao" | "quotas" | "docs";
function Th({ 
  children, 
  sortable, 
  sortKey, 
  currentSort, 
  onSort 
}: { 
  children: React.ReactNode; 
  sortable?: boolean; 
  sortKey?: SortableColumn; 
  currentSort?: string; 
  onSort?: (key: SortableColumn) => void;
}) {
  const getSortIcon = () => {
    if (!sortable || !sortKey) return null;
    const isAsc = currentSort === `${sortKey}_asc`;
    const isDesc = currentSort === `${sortKey}_desc`;
    if (isAsc) return <ArrowUp className="h-3 w-3 ml-1 inline" />;
    if (isDesc) return <ArrowDown className="h-3 w-3 ml-1 inline" />;
    return <ArrowUpDown className="h-3 w-3 ml-1 inline text-gray-400" />;
  };
  
  const handleClick = () => {
    if (sortable && sortKey && onSort) {
      onSort(sortKey);
    }
  };
  
  return (
    <th 
      className={`text-left px-3 py-2 font-medium ${sortable ? "cursor-pointer hover:bg-neutral-600 select-none" : ""}`}
      onClick={handleClick}
    >
      {children}
      {getSortIcon()}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) { return <td className="px-3 py-2 align-top">{children}</td>; }
function StatusBadge({ status }: { status: InscStatus }) {
  const map: Record<InscStatus, string> = {
    "Regularizado":"bg-green-50 text-green-700 inset-ring-green-600/20",
    "Pendente de validação": "bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20",
    "Por regularizar": "bg-gray-50 text-gray-600 inset-ring-gray-500/10",
    "Em atraso": "bg-red-50 text-red-700 inset-ring-red-600/10",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring ${map[status]}`}>{status}</span>;
}

export default function AthletesTable() {
  const [rows, setRows] = useState<RowVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [search, setSearch] = useState("");
  const [escalao, setEscalao] = useState<string>("");
  const [filtroInsc, setFiltroInsc] = useState<"" | InscStatus>("");
  const [filtroQuotas, setFiltroQuotas] = useState<"" | InscStatus | "N/A">("");
  const [sort, setSort] = useState<"nome_asc" | "nome_desc" | "created_desc" | "created_asc" | "escalao_asc" | "escalao_desc" | "opcao_pagamento_asc" | "opcao_pagamento_desc" | "inscricao_asc" | "inscricao_desc" | "quotas_asc" | "quotas_desc" | "docs_asc" | "docs_desc">("nome_asc");

  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<RowVM | null>(null);
  const [editing, setEditing] = useState<RowVM | null>(null);

  const [maps, setMaps] = useState<StatusMaps>({ insc: {}, quotas: {} });
  const [escaloes, setEscaloes] = useState<string[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function reload() {
    setLoading(true);
    try {
      // Map client-side sorts to server-side sorts
      const serverSort = (sort === "inscricao_asc" || sort === "inscricao_desc" || 
                          sort === "quotas_asc" || sort === "quotas_desc" ||
                          sort === "docs_asc" || sort === "docs_desc")
        ? "nome_asc" // Default server-side sort for client-side sorted columns
        : sort as "nome_asc" | "nome_desc" | "created_desc" | "created_asc" | "escalao_asc" | "escalao_desc" | "opcao_pagamento_asc" | "opcao_pagamento_desc";
      const { data: base, count } = await listAtletasAdmin({ search, escalao, tipoSocio: "", sort: serverSort, page, limit });
      setTotal(count);
      const vm: RowVM[] = base.map((x) => ({ atleta: x.atleta, titular: x.titular }));
      setRows(vm);

      const ids = vm.map((r) => r.atleta.id);
      const miss = await getMissingCountsForAtletas(ids);
      setRows((prev) => prev.map((r) => ({ ...r, missing: miss[r.atleta.id] ?? 0 })));

      if (ids.length) {
        type Pg = { atleta_id: string | null; tipo: string | null; descricao: string | null; validado: boolean | null; comprovativo_url: string | null; devido_em: string | null; created_at: string; };
        const { data, error } = await supabase.from("pagamentos").select("atleta_id,tipo,descricao,validado,comprovativo_url,devido_em,created_at").in("atleta_id", ids);
        if (error) throw error;
        const pg = (data || []) as Pg[];

        const byAth: Record<string, Pg[]> = {};
        pg.forEach((p) => { const k = p.atleta_id || ""; (byAth[k] ??= []).push(p); });

        const insc: StatusMaps["insc"] = {};
        const quotas: StatusMaps["quotas"] = {};

        for (const r of vm) {
          const a = r.atleta;
          // Fields epoca, social, and desistiu are available in a but not displayed in the table
          const _epoca = a.epoca;
          const _social = a.social;
          const _desistiu = a.desistiu;
          const list = byAth[a.id] || [];
          const relInsc = pickByDue(list.filter((p) => isInscricaoLike(p.tipo, p.descricao)));
          insc[a.id] = { status: deriveStatus(relInsc), due: relInsc?.devido_em ?? null };

          if (quotasNaoAplicaveis(a.escalao)) {
            quotas[a.id] = "N/A";
          } else {
            const relQ = pickByDue(list.filter((p) => !isInscricaoLike(p.tipo, p.descricao)));
            quotas[a.id] = { status: deriveStatus(relQ), due: relQ?.devido_em ?? null };
          }
        }
        setMaps({ insc, quotas });
      } else {
        setMaps({ insc: {}, quotas: {} });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1); // Reset to first page when filters change
  }, [search, escalao, sort]);

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [search, escalao, sort, page]);

  useEffect(() => {
    async function loadEscaloes() {
      try {
        const allEscaloes = await listEscaloes();
        setEscaloes(allEscaloes);
      } catch (err) {
        console.error("Erro ao carregar escalões:", err);
      }
    }
    loadEscaloes();
  }, []);

  // CSV (UTF-16LE para acentos ok)
  const csvEscape = (v: any) => { const s = (v ?? "").toString(); return /[;\r\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toUTF16LE = (str: string) => { const buf = new ArrayBuffer(str.length * 2 + 2); const view = new DataView(buf); view.setUint8(0, 0xff); view.setUint8(1, 0xfe); for (let i=0;i<str.length;i++) view.setUint16(2+i*2, str.charCodeAt(i), true); return new Uint8Array(buf); };
  async function exportCSV() {
    const filtered = effectiveRows;
    const header = ["Nome","Escalão","Opção de pagamento","Inscrição","Data limite (inscrição)","Quotas","Data limite (quotas)","Docs (falta/total)"];
    const lines: string[] = [];
    for (const r of filtered) {
      const a = r.atleta;
      const sInsc = maps.insc[a.id];
      const sQuo = maps.quotas[a.id];

      const inscStatus = sInsc ? sInsc.status : "Por regularizar";
      const inscDue = sInsc?.due ? new Date(sInsc.due + "T00:00:00").toLocaleDateString("pt-PT") : "—";

      let quotasText = "N/A"; let quotasDue = "N/A";
      if (sQuo && sQuo !== "N/A") { quotasText = sQuo.status; quotasDue = sQuo.due ? new Date(sQuo.due + "T00:00:00").toLocaleDateString("pt-PT") : "—"; }

      const row = [
        a.nome, a.escalao || "", a.opcao_pagamento || "",
        inscStatus, inscDue, quotasText, quotasDue,
        `${r.missing ?? 0}/${DOCS_ATLETA.length}`,
      ].map(csvEscape);
      lines.push(row.join(";"));
    }
    const csvString = ["sep=;", header.join(";"), ...lines].join("\r\n");
    const bytes = toUTF16LE(csvString);
    const blob = new Blob([bytes], { type: "application/vnd.ms-excel;charset=utf-16le" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "atletas.csv"; a.click(); URL.revokeObjectURL(url);
  }

  const handleSort = (column: SortableColumn) => {
    type SortValue = typeof sort;
    if (column === "nome" || column === "escalao" || column === "opcao_pagamento") {
      // Server-side sorting
      const currentAsc = `${column}_asc` as SortValue;
      const currentDesc = `${column}_desc` as SortValue;
      if (sort === currentAsc) {
        setSort(currentDesc);
      } else {
        setSort(currentAsc);
      }
    } else {
      // Client-side sorting for derived columns
      // This will be handled in effectiveRows
      const currentAsc = `${column}_asc` as SortValue;
      const currentDesc = `${column}_desc` as SortValue;
      if (sort === currentAsc) {
        setSort(currentDesc);
      } else if (sort === currentDesc) {
        setSort("nome_asc"); // Reset to default
      } else {
        setSort(currentAsc);
      }
    }
  };

  const effectiveRows = useMemo(() => {
    let filtered = rows.filter((r) => {
      const a = r.atleta;
      const sInsc = maps.insc[a.id];
      const sQuo = maps.quotas[a.id];

      if (filtroInsc && (!sInsc || sInsc.status !== filtroInsc)) return false;
      if (filtroQuotas) {
        if (filtroQuotas === "N/A") { if (sQuo !== "N/A") return false; }
        else { if (!sQuo || sQuo === "N/A" || sQuo.status !== filtroQuotas) return false; }
      }
      return true;
    });

    // Client-side sorting for inscricao, quotas, and docs
    if (sort === "inscricao_asc" || sort === "inscricao_desc") {
      const statusRank = (status: InscStatus): number => {
        switch (status) {
          case "Regularizado": return 0;
          case "Pendente de validação": return 1;
          case "Por regularizar": return 2;
          case "Em atraso": return 3;
          default: return 4;
        }
      };
      filtered = [...filtered].sort((a, b) => {
        const aStatus = maps.insc[a.atleta.id]?.status || "Por regularizar";
        const bStatus = maps.insc[b.atleta.id]?.status || "Por regularizar";
        const diff = statusRank(aStatus) - statusRank(bStatus);
        return sort === "inscricao_asc" ? diff : -diff;
      });
    } else if (sort === "quotas_asc" || sort === "quotas_desc") {
      const statusRank = (q: QuotasInfo): number => {
        if (q === "N/A") return 4;
        switch (q.status) {
          case "Regularizado": return 0;
          case "Pendente de validação": return 1;
          case "Por regularizar": return 2;
          case "Em atraso": return 3;
          default: return 5;
        }
      };
      filtered = [...filtered].sort((a, b) => {
        const aQuotas: QuotasInfo = maps.quotas[a.atleta.id] || { status: "Por regularizar" };
        const bQuotas: QuotasInfo = maps.quotas[b.atleta.id] || { status: "Por regularizar" };
        const diff = statusRank(aQuotas) - statusRank(bQuotas);
        return sort === "quotas_asc" ? diff : -diff;
      });
    } else if (sort === "docs_asc" || sort === "docs_desc") {
      filtered = [...filtered].sort((a, b) => {
        const diff = (a.missing ?? 0) - (b.missing ?? 0);
        return sort === "docs_asc" ? diff : -diff;
      });
    }

    return filtered;
  }, [rows, maps, filtroInsc, filtroQuotas, sort]);

  const filteredCount = effectiveRows.length;

  // If editing, show only the edit form
  if (editing) {
    return (
      <div className="space-y-3">
        <AdminAtletaEdit
          atletaRow={editing.atleta}
          onSave={() => {
            setEditing(null);
            reload();
          }}
          onCancel={() => {
            setEditing(null);
            showToast('Edição cancelada', 'ok');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Atletas
        </h2>
      </div>

      {/* filtros */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="col-span-2 flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-500" />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="Pesquisar por nome…" value={search} onChange={(e)=>setSearch(e.target.value)} />
        </div>

        <select className="rounded-xl border px-3 py-2 text-sm" value={escalao} onChange={(e)=>setEscalao(e.target.value)}>
          <option value="">Escalão — todos</option>
          {escaloes.map((e)=><option key={e} value={e}>{e}</option>)}
        </select>

        <select className="rounded-xl border px-3 py-2 text-sm" value={filtroInsc} onChange={(e)=>setFiltroInsc(e.target.value as any)}>
          <option value="">Inscrição — todas</option>
          <option value="Regularizado">Regularizado</option>
          <option value="Pendente de validação">Pendente de validação</option>
          <option value="Por regularizar">Por regularizar</option>
          <option value="Em atraso">Em atraso</option>
        </select>

        <select className="rounded-xl border px-3 py-2 text-sm" value={filtroQuotas} onChange={(e)=>setFiltroQuotas(e.target.value as any)}>
          <option value="">Quotas — todas</option>
          <option value="Regularizado">Regularizado</option>
          <option value="Pendente de validação">Pendente de validação</option>
          <option value="Por regularizar">Por regularizar</option>
          <option value="Em atraso">Em atraso</option>
          <option value="N/A">N/A</option>
        </select>

        <select className="rounded-xl border px-3 py-2 text-sm" value={sort} onChange={(e)=>setSort(e.target.value as any)}>
          <option value="nome_asc">Ordenar: Nome ↑</option>
          <option value="nome_desc">Ordenar: Nome ↓</option>
          <option value="escalao_asc">Ordenar: Escalão ↑</option>
          <option value="escalao_desc">Ordenar: Escalão ↓</option>
          <option value="opcao_pagamento_asc">Ordenar: Pagamento ↑</option>
          <option value="opcao_pagamento_desc">Ordenar: Pagamento ↓</option>
          <option value="inscricao_asc">Ordenar: Inscrição ↑</option>
          <option value="inscricao_desc">Ordenar: Inscrição ↓</option>
          <option value="quotas_asc">Ordenar: Quotas ↑</option>
          <option value="quotas_desc">Ordenar: Quotas ↓</option>
          <option value="docs_asc">Ordenar: Docs ↑</option>
          <option value="docs_desc">Ordenar: Docs ↓</option>
          <option value="created_desc">Ordenar: Recentes</option>
          <option value="created_asc">Ordenar: Antigos</option>
        </select>
      </div>

      {/* barra topo da tabela */}
      <div className="border bg-white">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="text-xs/6 text-gray-600 font-semibold">{loading ? "A carregar…" : `${filteredCount} registo(s)`}</div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              onClick={exportCSV}
              aria-label="Exportar CSV"
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button
              variant="secondary"
              onClick={reload}
              aria-label="Atualizar"
            >
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
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

        {/* tabela */}
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead>
              <tr className="bg-neutral-700 text-white uppercase">
                <Th sortable sortKey="nome" currentSort={sort} onSort={handleSort}>Nome</Th>
                <Th sortable sortKey="escalao" currentSort={sort} onSort={handleSort}>Escalão</Th>
                <Th sortable sortKey="opcao_pagamento" currentSort={sort} onSort={handleSort}>Opção pagamento</Th>
                <Th sortable sortKey="inscricao" currentSort={sort} onSort={handleSort}>Inscrição</Th>
                <Th sortable sortKey="quotas" currentSort={sort} onSort={handleSort}>Quotas</Th>
                <Th sortable sortKey="docs" currentSort={sort} onSort={handleSort}>Docs <span className="text-xs">(falta/total)</span></Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {effectiveRows.map((r, index) => {
                const a = r.atleta;
                const insc = maps.insc[a.id];
                const quotas = maps.quotas[a.id];

                const inscDue = insc?.due ? new Date(insc.due + "T00:00:00").toLocaleDateString("pt-PT") : "—";

                let quotasNode: React.ReactNode = <span className="text-gray-500">—</span>;
                if (quotas === "N/A") quotasNode = <span className="text-gray-500">N/A</span>;
                else if (quotas) {
                  const qDue = quotas.due ? new Date(quotas.due + "T00:00:00").toLocaleDateString("pt-PT") : "—";
                  quotasNode = (
                    <div>
                      <StatusBadge status={quotas.status} />
                      <div className="text-xs text-gray-500 mt-1">Data limite: {qDue}</div>
                    </div>
                  );
                }

                return (
                  <tr
                    key={a.id}
                    className={`border-t  ${
                      a.desistiu ? "bg-red-200" : index % 2 === 0 ? "bg-neutral-100" : "bg-neutral-300"
                    } hover:bg-amber-400`}
                  >
                    <Td>{a.nome}</Td>
                    <Td>{a.escalao || "—"}</Td>
                    <Td>{a.opcao_pagamento || "—"}</Td>
                    <Td>
                      {insc ? (
                        <div>
                          <StatusBadge status={insc.status} />
                          <div className="text-xs text-gray-500 mt-1">Data limite: {inscDue}</div>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </Td>
                    <Td>{quotasNode}</Td>
                    <Td>{`${r.missing ?? 0}/${DOCS_ATLETA.length}`}</Td>
                    <Td>
                      <Button
                        variant="stone"
                        onClick={() => { setFocus(r); setOpen(true); }}
                        aria-label="Ver detalhes"
                        className="inline-flex h-9 w-9 items-center justify-center p-0 text-[0.7rem]"
                      >
                      <Eye className="h-4 w-4" />
                      </Button>
                    </Td>
                  </tr>
                );
              })}
              {effectiveRows.length === 0 && !loading && (
                <tr><td colSpan={7} className="text-center py-6 text-gray-500">Sem resultados.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={7} className="text-center py-6 text-gray-500">A carregar…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {focus && !editing && (
        <AthleteDetailsDialog
          open={open}
          onClose={() => setOpen(false)}
          atleta={focus.atleta}
          titular={focus.titular}
          onEdit={() => {
            setEditing(focus);
            setOpen(false);
            showToast('A editar atleta', 'ok');
          }}
        />
      )}
    </div>
  );
}
