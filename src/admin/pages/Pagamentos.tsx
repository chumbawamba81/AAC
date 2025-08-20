// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  listPagamentos,
  validarEAtualizar,
  recomputeTesourariaForUser,
  type AdminPagamento,
} from "../services/adminPagamentosService";

function Pill({ children, color }: { children: React.ReactNode; color: "green" | "yellow" | "gray" }) {
  const map = {
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
    gray: "bg-gray-100 text-gray-800",
  } as const;
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${map[color]}`}>{children}</span>;
}

export default function PagamentosPage() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"all" | "val" | "pend" | "sem">("all");
  const [order, setOrder] = useState<"recentes" | "antigos">("recentes");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const data = await listPagamentos({ search, estado, order });
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Falha a carregar pagamentos");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { const t = setTimeout(refresh, 250); return () => clearTimeout(t); /* eslint-disable-line */ }, [search, estado, order]);

  async function toggleValidado(r: AdminPagamento) {
    if (!r.id) return;
    setBusy(true);
    try {
      const { status } = await validarEAtualizar(r.id, !(r.validado === true));
      // atualiza localmente
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, validado: !(r.validado === true) } : x));
      // opcional: feedback
      alert(`Pagamento ${!(r.validado === true) ? "validado" : "anulado"}. Situação do titular: ${status}.`);
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar");
    } finally { setBusy(false); }
  }

  async function handleRecompute(userId: string | null) {
    if (!userId) return;
    setBusy(true);
    try {
      const status = await recomputeTesourariaForUser(userId);
      alert(`Situação de tesouraria atualizada para: ${status}`);
    } catch (e: any) {
      alert(e?.message || "Falha ao atualizar tesouraria");
    } finally { setBusy(false); }
  }

  const empty = rows.length === 0;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Tesouraria · Pagamentos</h2>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="border rounded-xl px-3 py-2 text-sm"
          placeholder="Pesquisar (titular, atleta, descrição)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border rounded-xl px-3 py-2 text-sm" value={estado} onChange={(e)=>setEstado(e.target.value as any)}>
          <option value="all">Todos</option>
          <option value="val">Validados</option>
          <option value="pend">Pendentes</option>
          <option value="sem">Sem estado</option>
        </select>
        <select className="border rounded-xl px-3 py-2 text-sm" value={order} onChange={(e)=>setOrder(e.target.value as any)}>
          <option value="recentes">Mais recentes primeiro</option>
          <option value="antigos">Mais antigos primeiro</option>
        </select>
        <button className="ml-auto border rounded-xl px-3 py-2 text-sm" onClick={refresh} disabled={busy}>
          {busy ? "Aguarde…" : "Atualizar"}
        </button>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="overflow-x-auto bg-white rounded-xl border">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-600">
              <th className="text-left p-2">Data</th>
              <th className="text-left p-2">Titular</th>
              <th className="text-left p-2">Atleta</th>
              <th className="text-left p-2">Descrição</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-left p-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-500">Sem resultados.</td></tr>
            ) : rows.map(r => {
              const d = r.created_at ? new Date(r.created_at) : null;
              const statePill = r.validado === true
                ? <Pill color="green">Validado</Pill>
                : (r.validado === false ? <Pill color="yellow">Pendente</Pill> : <Pill color="gray">—</Pill>);
              return (
                <tr key={r.id} className="border-t">
                  <td className="p-2 whitespace-nowrap">{d ? d.toLocaleString("pt-PT") : "—"}</td>
                  <td className="p-2 whitespace-nowrap">{r.titular_nome || "—"}</td>
                  <td className="p-2 whitespace-nowrap">{r.atleta_nome || "—"}</td>
                  <td className="p-2">{r.descricao}</td>
                  <td className="p-2">{statePill}</td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-2">
                      <a
                        className={`px-2 py-1 rounded-xl border ${r.signedUrl ? "hover:bg-gray-50" : "opacity-50 pointer-events-none"}`}
                        href={r.signedUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver
                      </a>
                      <button
                        className="px-2 py-1 rounded-xl border hover:bg-gray-50"
                        onClick={() => toggleValidado(r)}
                        disabled={busy}
                      >
                        {r.validado === true ? "Anular" : "Validar"}
                      </button>
                      <button
                        className="px-2 py-1 rounded-xl border hover:bg-gray-50"
                        onClick={() => handleRecompute(r.titular_user_id)}
                        disabled={busy || !r.titular_user_id}
                        title="Recalcular situação de tesouraria do titular"
                      >
                        Atualizar tesouraria
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
