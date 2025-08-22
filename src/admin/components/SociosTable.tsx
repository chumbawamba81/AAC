import React, { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  listSocios,
  type SocioRow,
  exportSociosAsCsv,
} from "../services/adminSociosService";
import { supabase } from "../../supabaseClient";
import MemberDetailsDialog from "./MemberDetailsDialog";

/* ================= Tipos ================= */

type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
type OrderDir = "asc" | "desc";
type Situacao = "Regularizado" | "Pendente" | "Parcial";

type SocioInsc = {
  status: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
  due?: string | null;
} | null;

/* ================ UI helpers ================ */

function Container({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-white">{children}</div>;
}
function Header({ children }: { children: React.ReactNode }) {
  return <div className="p-3 border-b flex items-center justify-between">{children}</div>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

/** Badge com o mesmo estilo usado na Tesouraria/Admin para inscrição */
function InscBadge({
  status,
}: {
  status: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
}) {
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

function deriveInscStatus(row: { validado?: boolean; comprovativo_url?: string | null; devido_em?: string | null }) {
  const validado = !!row.validado;
  const comprovativo = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;

  if (validado) return "Regularizado" as const;
  if (comprovativo) return "Pendente de validação" as const;
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso" as const;
  }
  return "Por regularizar" as const;
}

/* ================ Página principal ================ */

export default function SociosTable({
  search,
  status,
  tipoSocio,
  orderBy,
  orderDir,
  limit = 20,
}: {
  search: string;
  status: "" | Situacao;
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

  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function load() {
    setLoading(true);
    try {
      const statusFilter: Situacao | undefined = status === "" ? undefined : status;
      const { data, count } = await listSocios({
        search,
        status: statusFilter,
        tipoSocio,
        orderBy,
        orderDir,
        limit,
        page,
      });
      setRows(data);
      setTotal(count ?? 0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, tipoSocio, orderBy, orderDir, limit, page]);

  function exportCsv() {
    const statusFilter: Situacao | undefined = status === "" ? undefined : status;
    exportSociosAsCsv({ search, status: statusFilter, tipoSocio, orderBy, orderDir }).catch((e: any) =>
      alert(e?.message || "Falha ao exportar CSV")
    );
  }

  return (
    <Container>
      <Header>
        <div className="text-sm text-gray-600">{loading ? "A carregar…" : `${total} registo(s)`}</div>
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
            {rows.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Container>
  );
}

/* ================ Linha/Row ================ */

function Row({ row }: { row: SocioRow }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [insc, setInsc] = useState<SocioInsc>(null);

  const isSocio = !!row.tipo_socio && !/não\s*pretendo/i.test(row.tipo_socio);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSocio) {
        setInsc(null);
        return;
      }
      // último registo da INSCRIÇÃO DE SÓCIO (atleta_id nulo; tipo = 'inscricao')
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, comprovativo_url, validado, devido_em")
        .eq("user_id", row.user_id)
        .is("atleta_id", null)
        .eq("tipo", "inscricao")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!mounted) return;
      if (error) {
        console.error("[SociosTable] inscrição sócio:", error);
        setInsc(null);
        return;
      }
      const r = (data || [])[0];
      if (!r) {
        setInsc({ status: "Por regularizar", due: null });
        return;
      }
      setInsc({
        status: deriveInscStatus(r),
        due: r.devido_em ?? null,
      });
    })();
    return () => {
      mounted = false;
    };
  }, [row.user_id, isSocio]);

  const dueLabel =
    insc?.due ? new Date(insc.due + "T00:00:00").toLocaleDateString("pt-PT") : "—";

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2">{row.nome_completo}</td>
        <td className="px-3 py-2">{row.email}</td>
        <td className="px-3 py-2">{row.telefone || "—"}</td>
        <td className="px-3 py-2">{row.tipo_socio || "—"}</td>

        {/* Situação = estado da inscrição de sócio */}
        <td className="px-3 py-2">
          {isSocio ? (
            insc ? <InscBadge status={insc.status} /> : <span className="text-gray-500">—</span>
          ) : (
            <span className="text-gray-500">N/A</span>
          )}
        </td>

        {/* Data limite (inscrição de sócio) */}
        <td className="px-3 py-2">{isSocio ? dueLabel : "N/A"}</td>

        <td className="px-3 py-2 text-right">
          <Button
            variant="outline"
            onClick={() => setModalOpen(true)}
            aria-label="Ver detalhes"
            className="inline-flex h-9 w-9 items-center justify-center p-0"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </td>
      </tr>

      <MemberDetailsDialog open={modalOpen} onOpenChange={setModalOpen} member={row as any} />
    </>
  );
}
