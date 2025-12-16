// src/admin/components/SociosTable.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "../../components/ui/button";
import { listSocios, type SocioRow } from "../services/adminSociosService";
import { supabase } from "../../supabaseClient";
import MemberDetailsDialog from "./MemberDetailsDialog";

/* ================= Tipos ================= */
type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
type OrderDir = "asc" | "desc";

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
type SocioInsc = { status: InscStatus; due?: string | null } | null;

/* ==== Documentos obrigatórios do Sócio/EE (ajusta se precisares) ==== */
const SOCIO_REQUIRED_TYPES: string[] = ["Ficha de Sócio"];

/* ================= UI helpers ================= */
function Container({ children }: { children: React.ReactNode }) {
  return <div className="border bg-white">{children}</div>;
}
function Header({ children }: { children: React.ReactNode }) {
  return <div className="p-3 border-b flex items-center justify-between">{children}</div>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
function InscBadge({ status }: { status: InscStatus }) {
  const map = {
    Regularizado: "bg-green-50 text-green-700 inset-ring-green-600/20",
    "Pendente de validação": "bg-yellow-50 text-yellow-800 inset-ring-yellow-600/20",
    "Por regularizar": "bg-gray-50 text-gray-600 inset-ring-gray-500/10",
    "Em atraso": "bg-red-50 text-red-700 inset-ring-red-600/10",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium inset-ring ${map[status]}`}>
      {status}
    </span>
  );
}
function deriveInscStatus(row: { validado?: boolean; comprovativo_url?: string | null; devido_em?: string | null }): InscStatus {
  const validado = !!row.validado;
  const comp = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;
  if (validado) return "Regularizado";
  if (comp) return "Pendente de validação";
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}

/* ================= Normalização do filtro ================= */
function normalizeInscFilter(raw: string): { include: InscStatus[] | null; onlyNA: boolean } {
  const v = (raw || "").trim().toLowerCase();

  if (!v || v === "todos" || v === "todas") return { include: null, onlyNA: false };
  if (v === "n/a" || v === "na" || v === "nao aplicavel" || v === "não aplicável") {
    return { include: [], onlyNA: true };
  }
  if (v.startsWith("regular")) return { include: ["Regularizado"], onlyNA: false };
  if (v.startsWith("pendente de")) return { include: ["Pendente de validação"], onlyNA: false };
  if (v.startsWith("por reg") || v.includes("regularizar")) return { include: ["Por regularizar"], onlyNA: false };
  if (v.includes("atras") || v.includes("atraso")) return { include: ["Em atraso"], onlyNA: false };
  if (v.startsWith("pendente") || v.startsWith("parcial")) {
    return { include: ["Pendente de validação", "Por regularizar", "Em atraso"], onlyNA: false };
  }
  return { include: null, onlyNA: false };
}

/** Escolhe o pagamento relevante por devido_em (futuro mais próximo; senão passado mais recente; senão por created_at). */
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

/* ================= Página ================= */
export default function SociosTable({
  search,
  status, // string (novo/legado)
  tipoSocio,
  orderBy,
  orderDir,
  limit = 20,
}: {
  search: string;
  status: string;
  tipoSocio:
    | ""
    | "Sócio Pro"
    | "Sócio Família"
    | "Sócio Geral Renovação"
    | "Sócio Geral Novo"
    | "Não pretendo ser sócio";
  orderBy: OrderBy;
  orderDir: OrderDir;
  limit?: number;
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SocioRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inscMap, setInscMap] = useState<Record<string, SocioInsc>>({});
  const [docsMap, setDocsMap] = useState<Record<string, { missing: number; total: number } | "N/A">>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [recordsPerPage, setRecordsPerPage] = useState<string>(limit?.toString() || "25");

  // Calculate effective limit (use a large number for "all")
  const effectiveLimit = useMemo(() => {
    if (recordsPerPage === "all") return 10000;
    return parseInt(recordsPerPage, 10);
  }, [recordsPerPage]);

  const totalPages = Math.max(1, Math.ceil(total / effectiveLimit));

  // carregar linhas + inscrições + docs (todos em lote)
  async function load() {
    setLoading(true);
    try {
      const { data, count } = await listSocios({
        search,
        status: undefined, // derivamos no cliente
        tipoSocio,
        orderBy,
        orderDir,
        limit: effectiveLimit,
        page,
      });
      setRows(data);
      setTotal(count ?? 0);

      const userIds = data.map((r) => r.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setInscMap({});
        setDocsMap({});
        return;
      }

      // Pagamentos (inscrição de sócio — nível user, tipo=inscricao, atleta_id null)
      type Pay = {
        user_id: string;
        validado: boolean | null;
        comprovativo_url: string | null;
        devido_em: string | null;
        created_at: string;
      };
      const { data: pays, error } = await supabase
        .from("pagamentos")
        .select("user_id, validado, comprovativo_url, devido_em, created_at")
        .in("user_id", userIds)
        .is("atleta_id", null)
        .eq("tipo", "inscricao")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const buckets: Record<string, Pay[]> = {};
      for (const p of (pays || []) as Pay[]) (buckets[p.user_id] ??= []).push(p);

      const nextInsc: Record<string, SocioInsc> = {};
      for (const id of userIds) {
        const chosen = pickByDue(buckets[id]);
        nextInsc[id] = chosen
          ? { status: deriveInscStatus(chosen), due: chosen.devido_em ?? null }
          : { status: "Por regularizar", due: null };
      }
      setInscMap(nextInsc);

      // Documentos obrigatórios (nível "socio")
      const { data: docs, error: errDocs } = await supabase
        .from("documentos")
        .select("user_id, doc_tipo")
        .in("user_id", userIds)
        .eq("doc_nivel", "socio")
        .in("doc_tipo", SOCIO_REQUIRED_TYPES);
      if (errDocs) throw errDocs;

      const byUser: Record<string, Set<string>> = {};
      (docs || []).forEach((d: any) => {
        const k = d.user_id as string;
        (byUser[k] ??= new Set()).add(d.doc_tipo as string);
      });

      const nextDocs: Record<string, { missing: number; total: number } | "N/A"> = {};
      for (const r of data) {
        const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
        if (!isSocio) {
          nextDocs[r.user_id] = "N/A";
          continue;
        }
        const totalReq = SOCIO_REQUIRED_TYPES.length;
        const have = byUser[r.user_id]?.size ?? 0;
        const missing = Math.max(0, totalReq - have);
        nextDocs[r.user_id] = { missing, total: totalReq };
      }
      setDocsMap(nextDocs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, tipoSocio, orderBy, orderDir, effectiveLimit, page]);

  // Reset to page 1 when records per page changes
  useEffect(() => {
    setPage(1);
  }, [recordsPerPage]);

  // === Export CSV a partir da grelha ===
  function exportCsv() {
    // helpers para CSV com acentos correctos
    const csvEscape = (v: any) => {
      const s = (v ?? "").toString();
      return /[;\r\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toUTF16LE = (str: string) => {
      const buf = new ArrayBuffer(str.length * 2 + 2);
      const view = new DataView(buf);
      view.setUint8(0, 0xff); // BOM
      view.setUint8(1, 0xfe);
      for (let i = 0; i < str.length; i++) view.setUint16(2 + i * 2, str.charCodeAt(i), true);
      return new Uint8Array(buf);
    };

    const header = [
      "Nome",
      "Email",
      "Telefone",
      "Tipo de sócio",
      "Situação",
      "Data limite",
      "Docs (falta/total)",
    ];

    const lines: string[] = [];

    for (const r of effectiveRows) {
      const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
      const insc = inscMap[r.user_id] ?? null;

      const situacao = isSocio ? (insc ? insc.status : "—") : "N/A";
      const dueLabel =
        isSocio && insc?.due
          ? new Date(insc.due + "T00:00:00").toLocaleDateString("pt-PT")
          : isSocio
          ? "—"
          : "N/A";

      const dInfo = docsMap[r.user_id];
      let docsStr = "—";
      if (!isSocio) docsStr = "N/A";
      else if (dInfo && dInfo !== "N/A") docsStr = `${dInfo.missing}/${dInfo.total}`;

      const row = [
        r.nome_completo,
        r.email,
        r.telefone || "",
        r.tipo_socio || "",
        situacao,
        dueLabel,
        docsStr,
      ].map(csvEscape);

      lines.push(row.join(";"));
    }

    const csvString = ["sep=;", header.join(";"), ...lines].join("\r\n");
    const bytes = toUTF16LE(csvString);
    const blob = new Blob([bytes], { type: "application/vnd.ms-excel;charset=utf-16le" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "socios.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // filtro efetivo (inclui N/A quando não há filtro por estado)
  const effectiveRows = useMemo(() => {
    const { include, onlyNA } = normalizeInscFilter(status);

    return rows.filter((r) => {
      const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
      const insc = inscMap[r.user_id];

      if (!isSocio) {
        if (!include && !onlyNA) return true; // inclui por omissão
        if (onlyNA) return true;              // filtro "N/A"
        return false;                         // filtro por estados
      }

      if (!include) return true;
      if (!insc) return true;
      return include.includes(insc.status as InscStatus);
    });
  }, [rows, inscMap, status]);

  const filteredCount = effectiveRows.length;

  return (
    <Container>
      <Header>
        <div className="text-xs/6 text-gray-600 font-semibold">
          {loading ? "A carregar…" : `${filteredCount} registo(s)`}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600">Registos por página:</span>
            <select
              className="w-full rounded-xl border px-3 py-2 text-sm"
              value={recordsPerPage}
              onChange={(e) => setRecordsPerPage(e.target.value)}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <Button variant="dark" onClick={exportCsv} className="text-sm">
            Exportar CSV
          </Button>
          {recordsPerPage !== "all" && (
            <>
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-arrow-left-icon lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
              </Button>
              <div className="text-xs/6 text-gray-600 font-semibold">Página {page}/{totalPages}</div>
              <Button
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Página seguinte"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="lucide lucide-arrow-right-icon lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </Button>
            </>
          )}
        </div>
      </Header>
      <TableWrap>
        <table className="min-w-[1120px] w-full text-sm">
          <thead>
            <tr className="bg-neutral-700 text-white uppercase">
              <th className="text-left px-3 py-2 font-medium">Nome</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Telefone</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de sócio</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-left px-3 py-2 font-medium">Data limite</th>
              <th className="text-left px-3 py-2 font-medium">Docs <span className="text-xs">(falta/total)</span> </th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {effectiveRows.map((r, index) => {
              const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
              const insc = inscMap[r.user_id] ?? null;

              const dueLabel =
                isSocio && insc?.due
                  ? new Date(insc.due + "T00:00:00").toLocaleDateString("pt-PT")
                  : isSocio
                  ? "—"
                  : "N/A";

              const dInfo = docsMap[r.user_id];
              let docsLabel: React.ReactNode = <span className="text-gray-500">—</span>;
              if (!isSocio) {
                docsLabel = <span className="text-gray-500">N/A</span>;
              } else if (dInfo && dInfo !== "N/A") {
                docsLabel = <span>{dInfo.missing}/{dInfo.total}</span>;
              }
              return (
                <tr
                  key={r.id}
                  className={`border-t ${
                    index % 2 === 0 ? "bg-neutral-100" : "bg-neutral-300"
                  } hover:bg-amber-400`}
                >
                  <td className="px-3 py-2">{r.nome_completo}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.telefone || "—"}</td>
                  <td className="px-3 py-2 text-[0.7rem]">{r.tipo_socio || "—"}</td>
                  <td className="px-3 py-2 text-[0.7rem]">
                    {isSocio ? (
                      insc ? <InscBadge status={insc.status as InscStatus} /> : <span className="text-gray-500">—</span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[0.7rem]">{dueLabel}</td>
                  <td className="px-3 py-2 text-[0.7rem]">{docsLabel}</td>
                  <td className="px-3 py-2 text-right text-[0.7rem]">
                    <Button
                      variant="outline"
                      onClick={() => setOpenId(r.user_id)}
                      aria-label="Ver detalhes"
                      className="inline-flex h-9 w-9 items-center justify-center p-0 text-[0.7rem]"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <MemberDetailsDialog
                      open={openId === r.user_id}
                      onOpenChange={(v) => setOpenId(v ? r.user_id : null)}
                      member={r as any}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Container>
  );
}
