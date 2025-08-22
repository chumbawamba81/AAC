// src/admin/components/SociosTable.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  listSocios,
  updateSituacaoTesouraria,
  fetchSocioDocs,
  fetchSocioFull,
  listAtletasByUser,
  type SocioRow,
  type DocRow,
  type SocioFullRow,
  type AtletaRow,
  exportSociosAsCsv,
} from "../services/adminSociosService";
import { supabase } from "../../supabaseClient";

/* ================= Helpers de apresentação ================= */

type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
type OrderDir = "asc" | "desc";

function Container({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border bg-white">{children}</div>;
}
function Header({ children }: { children: React.ReactNode }) {
  return <div className="p-3 border-b flex items-center justify-between">{children}</div>;
}
function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function Badge({ status }: { status: string }) {
  const cls =
    status === "Regularizado"
      ? "bg-green-100 text-green-700"
      : status === "Parcial"
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";
  return <span className={`inline-block rounded-full px-2 py-0.5 ${cls}`}>{status}</span>;
}

/** Badge com o mesmo estilo da Tesouraria/Admin */
function StatusBadgeTesouraria({
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

/* ================= Página principal ================= */

export default function SociosTable({
  search,
  status,
  tipoSocio,
  orderBy,
  orderDir,
  limit = 20,
}: {
  search: string;
  status: "" | "Regularizado" | "Pendente" | "Parcial";
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

  async function load() {
    setLoading(true);
    try {
      const { data, count } = await listSocios({
        search,
        status,
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
    exportSociosAsCsv({ search, status, tipoSocio, orderBy, orderDir }).catch((e: any) =>
      alert(e?.message || "Falha ao exportar CSV")
    );
  }

  return (
    <Container>
      <Header>
        <div className="text-sm text-gray-600">{loading ? "A carregar…" : `${total} registo(s)`}</div>
        <div className="flex items-center gap-2">
          <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={exportCsv}>
            Exportar CSV
          </button>
          <button
            className="rounded-lg border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ◀
          </button>
          <div className="text-sm">Página {page}</div>
          <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => setPage((p) => p + 1)}>
            ▶
          </button>
        </div>
      </Header>

      <TableWrap>
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-700">
              <th className="text-left px-3 py-2 font-medium">Nome</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Telefone</th>
              <th className="text-left px-3 py-2 font-medium">Tipo de sócio</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} row={r} onChanged={load} />
            ))}
          </tbody>
        </table>
      </TableWrap>
    </Container>
  );
}

/* ================= Linha/Row ================= */

type SocioInscricaoStatus = {
  status: "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";
  due?: string | null;
  valor?: number | null;
} | null;

type Situacao = "Regularizado" | "Pendente" | "Parcial";

/** Deriva o estado do pagamento usando a mesma lógica da Tesouraria/Admin */
function deriveStatusFromRow(row: { validado?: boolean; comprovativo_url?: string | null; devido_em?: string | null }) {
  const validado = !!row.validado;
  const comprovativo = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;

  if (validado) return "Regularizado" as const;
  if (comprovativo) return "Pendente de validação" as const;

  const today = new Date();
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (today.getTime() > dt.getTime()) return "Em atraso" as const;
  }
  return "Por regularizar" as const;
}

function Row({ row, onChanged }: { row: SocioRow; onChanged: () => void }) {
  const [up, setUp] = useState<Situacao | null>(null); // << corrigido
  const [modalOpen, setModalOpen] = useState(false);

  // NOVO: estado da inscrição de sócio (só quando aplicável)
  const [insc, setInsc] = useState<SocioInscricaoStatus>(null);
  const isSocio = !!row.tipo_socio && !/não\s*pretendo/i.test(row.tipo_socio);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSocio) {
        setInsc(null);
        return;
      }
      // último registo de inscrição do SÓCIO (atleta_id nulo, tipo = 'inscricao')
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, comprovativo_url, validado, devido_em, valor")
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
        setInsc({ status: "Por regularizar", due: null, valor: null });
        return;
      }
      setInsc({
        status: deriveStatusFromRow(r),
        due: r.devido_em ?? null,
        valor: (r as any).valor ?? null,
      });
    })();
    return () => {
      mounted = false;
    };
  }, [row.user_id, isSocio]);

  async function saveStatus() {
    if (!up) return; // garante tipagem
    await updateSituacaoTesouraria(row.user_id, up);
    await onChanged();
    setUp(null);
  }

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2">{row.nome_completo}</td>
        <td className="px-3 py-2">{row.email}</td>
        <td className="px-3 py-2">{row.telefone || "—"}</td>
        <td className="px-3 py-2">{row.tipo_socio || "—"}</td>

        {/* Situação: linha anterior + estado da Inscrição de Sócio (quando aplicável) */}
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <span>
              <Badge status={row.situacao_tesouraria || "Pendente"} />
            </span>

            {/* NOVO bloco de inscrição de sócio */}
            <div className="text-xs text-gray-700">
              <span className="mr-1 text-gray-600">Inscrição de sócio:</span>
              {isSocio ? (
                insc ? (
                  <StatusBadgeTesouraria status={insc.status} />
                ) : (
                  <span className="text-gray-500">—</span>
                )
              ) : (
                <span className="text-gray-500">N/A</span>
              )}
            </div>
          </div>
        </td>

        <td className="px-3 py-2 text-right">
          <div className="inline-flex items-center gap-2">
            <select
              value={up ?? ""} // << corrigido
              onChange={(e) => {
                const v = e.target.value as "" | Situacao;
                setUp(v === "" ? null : v);
              }}
              className="rounded-lg border px-2 py-1 text-sm"
            >
              <option value="">Atualizar Situação…</option>
              <option value="Regularizado">Regularizado</option>
              <option value="Pendente">Pendente</option>
              <option value="Parcial">Parcial</option>
            </select>
            <button
              onClick={saveStatus}
              disabled={!up}
              className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Guardar
            </button>
            <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setModalOpen(true)}>
              Detalhe
            </button>
          </div>
        </td>
      </tr>

      <MemberDetailsDialog open={modalOpen} onOpenChange={setModalOpen} member={{ ...row, user_id: row.user_id }} />
    </>
  );
}

/* ================= Modal de detalhe (inalterado) ================= */

type MemberRow = SocioRow & { user_id: string };

function MemberDetailsDialog({
  open,
  onOpenChange,
  member,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberRow;
}) {
  const userId = member.user_id;

  const [active, setActive] = useState<"dados" | "atletas" | "docs">("dados");

  const [dados, setDados] = useState<SocioFullRow | null>(null);
  const [loadingDados, setLoadingDados] = useState(false);
  const [errDados, setErrDados] = useState<string | null>(null);

  const [atletas, setAtletas] = useState<AtletaRow[] | null>(null);
  const [loadingAt, setLoadingAt] = useState(false);
  const [errAt, setErrAt] = useState<string | null>(null);

  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [errDocs, setErrDocs] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingDados(true);
      setErrDados(null);
      try {
        const d = await fetchSocioFull(userId);
        if (!mounted) return;
        setDados(d);
      } catch (e: any) {
        if (!mounted) return;
        setErrDados(e?.message || "Falha a carregar dados do sócio.");
      } finally {
        if (mounted) setLoadingDados(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  useEffect(() => {
    if (active === "atletas" && atletas === null) {
      setLoadingAt(true);
      setErrAt(null);
      listAtletasByUser(userId)
        .then((arr) => setAtletas(arr))
        .catch((e: any) => setErrAt(e?.message || "Falha a carregar atletas."))
        .finally(() => setLoadingAt(false));
    }
    if (active === "docs" && docs === null) {
      setLoadingDocs(true);
      setErrDocs(null);
      fetchSocioDocs(userId)
        .then((arr) => setDocs(arr))
        .catch((e: any) => setErrDocs(e?.message || "Falha a carregar documentos."))
        .finally(() => setLoadingDocs(false));
    }
  }, [active, atletas, docs, userId]);

  return (
    <dialog open={open} className="modal" onClose={() => onOpenChange(false)}>
      <div className="modal-box max-w-4xl w-full rounded-xl border bg-white">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Detalhe do Sócio</h3>
          <button className="btn btn-sm" onClick={() => onOpenChange(false)}>
            Fechar
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-3 border-b pb-2 text-sm">
            <button
              className={`px-2 py-1 rounded ${active === "dados" ? "bg-black text-white" : "border"}`}
              onClick={() => setActive("dados")}
            >
              Dados
            </button>
            <button
              className={`px-2 py-1 rounded ${active === "atletas" ? "bg-black text-white" : "border"}`}
              onClick={() => setActive("atletas")}
            >
              Atletas
            </button>
            <button
              className={`px-2 py-1 rounded ${active === "docs" ? "bg-black text-white" : "border"}`}
              onClick={() => setActive("docs")}
            >
              Documentos
            </button>
          </div>

          <div className="mt-3">
            {loadingDados && <p className="text-sm text-gray-600">A carregar…</p>}
            {errDados && <p className="text-sm text-red-600">{errDados}</p>}
            {dados && (
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Nome">{dados.nome_completo || "—"}</Field>
                <Field label="Email">{dados.email || "—"}</Field>
                <Field label="Telefone">{dados.telefone || "—"}</Field>
                <Field label="Tipo de sócio">{dados.tipo_socio || "—"}</Field>
                <Field label="Situação de tesouraria">{dados.situacao_tesouraria || "—"}</Field>
                <Field label="Criado em">{dados.created_at?.slice(0, 19)?.replace("T", " ") || "—"}</Field>
              </div>
            )}
          </div>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button onClick={() => onOpenChange(false)}>close</button>
      </form>
    </dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div>{children}</div>
    </div>
  );
}
