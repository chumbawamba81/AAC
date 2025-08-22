import React, { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "../../components/ui/button";
import { listSocios, type SocioRow, exportSociosAsCsv } from "../services/adminSociosService";
import { supabase } from "../../supabaseClient";
import MemberDetailsDialog from "./MemberDetailsDialog";

/* ================= Tipos ================= */
type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
type OrderDir = "asc" | "desc";

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

type SocioInsc = { status: InscStatus; due?: string | null } | null;

/* ================= UI helpers ================= */
function Container({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-white">{children}</div>;
}
function Header({ children }: { children: React.ReactNode }) {
  return <div className="p-3 border-b flex items-center justify-between">{children}</div>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}
function InscBadge({ status }: { status: InscStatus }) {
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
// Aceita qualquer string vinda do seletor (novo ou legado) e devolve o conjunto a manter.
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

  // legado: "Pendente" e "Parcial" = tudo o que não é Regularizado
  if (v.startsWith("pendente") || v.startsWith("parcial")) {
    return { include: ["Pendente de validação", "Por regularizar", "Em atraso"], onlyNA: false };
  }

  // Valor desconhecido -> não filtra
  return { include: null, onlyNA: false };
}

/* ================= Página ================= */
export default function SociosTable({
  search,
  status, // string do seletor vindo de cima (pode ser "Regularizado", "Pendente", "Parcial", "N/A", "Por regularizar", etc.)
  tipoSocio,
  orderBy,
  orderDir,
  limit = 20,
}: {
  search: string;
  status: string; // aceitar valores novos/antigos
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
  const [openId, setOpenId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // carregar linhas + inscrições em lote
  async function load() {
    setLoading(true);
    try {
      const { data, count } = await listSocios({
        search,
        // já não filtramos por situacao_tesouraria no servidor — é derivada da inscrição
        status: undefined,
        tipoSocio,
        orderBy,
        orderDir,
        limit,
        page,
      });
      setRows(data);
      setTotal(count ?? 0);

      // buscar INSCRIÇÃO DE SÓCIO em lote
      const userIds = data.map((r) => r.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setInscMap({});
      } else {
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

        const latest: Record<string, Pay> = {};
        for (const p of (pays || []) as Pay[]) {
          if (!latest[p.user_id]) latest[p.user_id] = p; // já vem ordenado desc
        }
        const next: Record<string, SocioInsc> = {};
        for (const id of userIds) {
          const r = latest[id];
          if (!r) next[id] = { status: "Por regularizar", due: null };
          else next[id] = { status: deriveInscStatus(r), due: r.devido_em ?? null };
        }
        setInscMap(next);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, tipoSocio, orderBy, orderDir, limit, page]);

  function exportCsv() {
    exportSociosAsCsv({ search, status: undefined, tipoSocio, orderBy, orderDir }).catch((e: any) =>
      alert(e?.message || "Falha ao exportar CSV")
    );
  }

  // filtro efetivo (suporta novo e legado)
  const effectiveRows = useMemo(() => {
    const { include, onlyNA } = normalizeInscFilter(status);
    return rows.filter((r) => {
      const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
      const insc = inscMap[r.user_id];
      if (!isSocio) return onlyNA; // só mostra N/A quando pedido
      if (!include) return true;   // sem filtro específico → mostra tudo de sócios
      if (!insc) return true;      // ainda a carregar estado → não filtra fora
      return include.includes(insc.status);
    });
  }, [rows, inscMap, status]);

  const filteredCount = effectiveRows.length;

  return (
    <Container>
      <Header>
        <div className="text-sm text-gray-600">
          {loading ? "A carregar…" : `${filteredCount} registo(s)`}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} className="text-sm">
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="Página anterior"
          >
            ◀
          </Button>
          <div className="text-sm">Página {page}</div>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="Página seguinte"
          >
            ▶
          </Button>
        </div>
      </Header>

      <TableWrap>
        <table className="min-w-[980px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700">
              <th className="text-left px-3 py-2 font-medium">Nome</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Telefone</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de sócio</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-left px-3 py-2 font-medium">Data limite</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {effectiveRows.map((r) => {
              const isSocio = !!r.tipo_socio && !/não\s*pretendo/i.test(r.tipo_socio);
              const insc = inscMap[r.user_id] ?? null;
              const dueLabel =
                isSocio && insc?.due
                  ? new Date(insc.due + "T00:00:00").toLocaleDateString("pt-PT")
                  : isSocio
                  ? "—"
                  : "N/A";
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.nome_completo}</td>
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.telefone || "—"}</td>
                  <td className="px-3 py-2">{r.tipo_socio || "—"}</td>
                  <td className="px-3 py-2">
                    {isSocio ? (
                      insc ? <InscBadge status={insc.status} /> : <span className="text-gray-500">—</span>
                    ) : (
                      <span className="text-gray-500">N/A</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{dueLabel}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="outline"
                      onClick={() => setOpenId(r.user_id)}
                      aria-label="Ver detalhes"
                      className="inline-flex h-9 w-9 items-center justify-center p-0"
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
