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

type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria" | "tipo_socio";
type OrderDir = "asc" | "desc";

export default function SociosTable({
  search,
  status,
  tipoSocio,
  orderBy,
  orderDir,
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
}) {
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [rows, setRows] = useState<SocioRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data, count } = await listSocios({
        search,
        status: status || undefined,
        tipoSocio: tipoSocio || undefined,
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / limit)), [total, limit]);

  // Exportação CSV da listagem atual (tudo, ignorando paginação)
  async function exportCsv() {
    try {
      await exportSociosAsCsv({
        search,
        status: status || undefined,
        tipoSocio: tipoSocio || undefined,
        orderBy,
        orderDir,
      });
    } catch (e: any) {
      alert(e?.message || "Falha na exportação");
    }
  }

  return (
    <div className="border rounded-xl bg-white">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? "A carregar…" : `${total} registo(s)`}
        </div>
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
          <span className="text-sm">Pág. {page} / {totalPages}</span>
          <button
            className="rounded-lg border px-2 py-1 text-sm disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            ▶
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Tipo de sócio</th>
              <th className="px-3 py-2">Tesouraria</th>
              <th className="px-3 py-2">Criado</th>
              <th className="px-3 py-2 w-64">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-500">
                  Sem resultados.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Row key={r.id} row={r} onChanged={load} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row, onChanged }: { row: SocioRow; onChanged: () => void }) {
  const [up, setUp] = useState<"Regularizado" | "Pendente" | "Parcial" | "">("");
  const [modalOpen, setModalOpen] = useState(false);

  async function saveStatus() {
    if (!up) return;
    await updateSituacaoTesouraria(row.user_id, up);
    await onChanged();
    setUp("");
  }

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2">{row.nome_completo}</td>
        <td className="px-3 py-2">{row.email}</td>
        <td className="px-3 py-2">{row.telefone || "—"}</td>
        <td className="px-3 py-2">{row.tipo_socio || "—"}</td>
        <td className="px-3 py-2">
          <span
            className={
              "inline-block rounded-full px-2 py-0.5 " +
              (row.situacao_tesouraria === "Regularizado"
                ? "bg-green-100 text-green-700"
                : row.situacao_tesouraria === "Parcial"
                ? "bg-amber-100 text-amber-700"
                : "bg-red-100 text-red-700")
            }
          >
            {row.situacao_tesouraria}
          </span>
        </td>
        <td className="px-3 py-2">{row.created_at?.slice(0, 10) || "—"}</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <button className="rounded-lg border px-2 py-1" onClick={() => setModalOpen(true)}>
              Detalhes
            </button>
            <select
              className="rounded-lg border px-2 py-1"
              value={up}
              onChange={(e) => setUp(e.target.value as any)}
            >
              <option value="">Atualizar tesouraria…</option>
              <option value="Regularizado">Regularizado</option>
              <option value="Parcial">Parcial</option>
              <option value="Pendente">Pendente</option>
            </select>
            <button
              className="rounded-lg border px-2 py-1 disabled:opacity-50"
              onClick={saveStatus}
              disabled={!up}
            >
              Guardar
            </button>
          </div>
        </td>
      </tr>

      {modalOpen && (
        <SocioModal userId={row.user_id} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}

/* ---------------- Modal com tabs: Dados | Atletas | Documentos ---------------- */

function SocioModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [active, setActive] = useState<"dados" | "atletas" | "docs">("dados");

  // dados pessoais
  const [dados, setDados] = useState<SocioFullRow | null>(null);
  const [loadingDados, setLoadingDados] = useState(true);
  const [errDados, setErrDados] = useState<string | null>(null);

  // atletas
  const [atletas, setAtletas] = useState<AtletaRow[] | null>(null);
  const [loadingAt, setLoadingAt] = useState(false);
  const [errAt, setErrAt] = useState<string | null>(null);

  // documentos
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-[min(900px,96vw)] max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="font-semibold">Detalhes do Sócio / EE</div>
          <button className="rounded-lg border px-2 py-1" onClick={onClose}>Fechar</button>
        </div>

        <div className="px-4 pt-3">
          <div className="inline-flex items-center gap-2 rounded-lg border p-1 text-sm bg-gray-50">
            <TabButton active={active === "dados"} onClick={() => setActive("dados")}>Dados</TabButton>
            <TabButton active={active === "atletas"} onClick={() => setActive("atletas")}>Atletas</TabButton>
            <TabButton active={active === "docs"} onClick={() => setActive("docs")}>Documentos</TabButton>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {active === "dados" && (
            <>
              {loadingDados && <p className="text-sm text-gray-600">A carregar…</p>}
              {errDados && <p className="text-sm text-red-600">{errDados}</p>}
              {dados && (
                <div className="grid md:grid-cols-2 gap-3 text-sm">
                  <Field label="Nome">{dados.nome_completo}</Field>
                  <Field label="Email">{dados.email}</Field>
                  <Field label="Telefone">{dados.telefone || "—"}</Field>
                  <Field label="Tipo de sócio">{dados.tipo_socio || "—"}</Field>
                  <Field label="Data de nascimento">{dados.data_nascimento || "—"}</Field>
                  <Field label="Género">{dados.genero || "—"}</Field>
                  <Field label="NIF">{dados.nif || "—"}</Field>
                  <Field label="Profissão">{dados.profissao || "—"}</Field>
                  <Field label="Morada" className="md:col-span-2">
                    {dados.morada || "—"}
                  </Field>
                  <Field label="Código postal">{dados.codigo_postal || "—"}</Field>
                  <Field label="Documento">
                    {dados.tipo_documento || "—"} {dados.numero_documento ? `— ${dados.numero_documento}` : ""}
                    {dados.data_validade_documento ? ` (Validade: ${dados.data_validade_documento})` : ""}
                  </Field>
                  <Field label="Tesouraria">
                    <Badge status={dados.situacao_tesouraria} />
                  </Field>
                  <Field label="Criado em">{dados.created_at?.slice(0, 19)?.replace("T", " ") || "—"}</Field>
                </div>
              )}
            </>
          )}

          {active === "atletas" && (
            <>
              {loadingAt && <p className="text-sm text-gray-600">A carregar…</p>}
              {errAt && <p className="text-sm text-red-600">{errAt}</p>}
              {atletas && atletas.length === 0 && <p className="text-sm text-gray-500">Sem atletas.</p>}
              {atletas && atletas.length > 0 && (
                <div className="space-y-3">
                  {atletas.map((a) => (
                    <div key={a.id} className="border rounded-lg p-3">
                      <div className="font-medium">{a.nome}</div>
                      <div className="text-xs text-gray-500 mb-2">
                        {a.genero || "—"} · Nasc.: {a.data_nascimento || "—"} · Escalão: {a.escalao || "—"} · Pag.: {a.opcao_pagamento || "—"}
                      </div>
                      <div className="grid md:grid-cols-2 gap-2 text-sm">
                        <Field label="Alergias">{a.alergias || "—"}</Field>
                        <Field label="Contactos urgência">{a.contactos_urgencia || "—"}</Field>
                        <Field label="Emails preferenciais">{a.emails_preferenciais || "—"}</Field>
                        <Field label="Morada" className="md:col-span-2">{a.morada || "—"}</Field>
                        <Field label="Código postal">{a.codigo_postal || "—"}</Field>
                        {a.observacoes ? <Field label="Observações" className="md:col-span-2">{a.observacoes}</Field> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {active === "docs" && (
            <>
              {loadingDocs && <p className="text-sm text-gray-600">A carregar…</p>}
              {errDocs && <p className="text-sm text-red-600">{errDocs}</p>}
              {docs && docs.length === 0 && (
                <div className="text-sm text-gray-500">Sem documentos carregados.</div>
              )}
              {docs && docs.length > 0 && (
                <ul className="text-sm list-disc pl-6 space-y-1">
                  {docs.map((d) => (
                    <li key={d.id}>
                      <a className="underline" href={d.signedUrl} target="_blank" rel="noreferrer">
                        {d.doc_tipo} — {d.file_name || d.file_path}
                      </a>
                      {typeof d.page === "number" ? <span> (ficheiro {d.page})</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={
        "px-3 py-1 rounded-md " + (active ? "bg-white shadow border" : "hover:bg-white/60")
      }
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div>{children}</div>
    </div>
  );
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
