// src/admin/components/SociosTable.tsx
import React, { useEffect, useMemo, useState } from "react";
import { listSocios, updateSituacaoTesouraria, fetchSocioDocs, type SocioRow, type DocRow } from "../services/adminSociosService";

type OrderBy = "created_at" | "nome_completo" | "email" | "situacao_tesouraria";
type OrderDir = "asc" | "desc";

export default function SociosTable({
  search,
  status,
  orderBy,
  orderDir,
}: {
  search: string;
  status: "" | "Regularizado" | "Pendente" | "Parcial";
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
  }, [search, status, orderBy, orderDir, limit, page]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil((total || 0) / limit)), [total, limit]);

  return (
    <div className="border rounded-xl bg-white">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {loading ? "A carregar…" : `${total} registo(s)`}
        </div>
        <div className="flex items-center gap-2">
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
              <th className="px-3 py-2">Cód. Postal</th>
              <th className="px-3 py-2">Tesouraria</th>
              <th className="px-3 py-2">Criado</th>
              <th className="px-3 py-2 w-56">Ações</th>
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
  const [openDocs, setOpenDocs] = useState(false);
  const [docs, setDocs] = useState<DocRow[] | null>(null);
  const [up, setUp] = useState<"Regularizado" | "Pendente" | "Parcial" | "">("");

  async function saveStatus() {
    if (!up) return;
    await updateSituacaoTesouraria(row.user_id, up);
    await onChanged();
    setUp("");
  }

  async function openDocsDialog() {
    setOpenDocs(true);
    if (docs === null) {
      const d = await fetchSocioDocs(row.user_id);
      setDocs(d);
    }
  }

  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2">{row.nome_completo}</td>
        <td className="px-3 py-2">{row.email}</td>
        <td className="px-3 py-2">{row.telefone || "—"}</td>
        <td className="px-3 py-2">{row.codigo_postal || "—"}</td>
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
            <button className="rounded-lg border px-2 py-1" onClick={openDocsDialog}>
              Ver docs
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

      {openDocs && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-3 py-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium mb-2">Documentos do Sócio</div>
                {docs === null && <div className="text-sm text-gray-600">A carregar…</div>}
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
              </div>
              <button className="rounded-lg border px-2 py-1 ml-3" onClick={() => setOpenDocs(false)}>
                Fechar
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
