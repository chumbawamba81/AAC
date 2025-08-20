// src/admin/components/PaymentsTable.tsx
import React, { useEffect, useMemo, useState } from "react";
import { listPagamentos, validarEAtualizar, type AdminPagamento } from "../services/adminPagamentosService";

type Estado = "all" | "val" | "pend" | "sem";
type Nivel = "all" | "socio" | "atleta";

export default function PaymentsTable() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<Estado>("all");
  const [nivel, setNivel] = useState<Nivel>("all");
  const [order, setOrder] = useState<"recentes" | "antigos">("recentes");
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setBusy(true);
    try {
      const data = await listPagamentos({ search, estado, nivel, order });
      setRows(data);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [estado, nivel, order]);
  // usa Enter no search
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") refresh(); };

  async function toggleValidado(r: AdminPagamento) {
    const novo = !(r.validado === true);
    setBusy(true);
    try {
      const res = await validarEAtualizar(r.id, novo);
      // Refresca tabela
      await refresh();
      alert(`Pagamento marcado como ${novo ? "VALIDADO" : "NÃO VALIDADO"}.\nSituação (${res.nivel}) atualizada: ${res.statusAfter}.`);
    } catch (e: any) {
      alert(e.message || "Falha ao validar/anular pagamento");
    } finally { setBusy(false); }
  }

  const csv = useMemo(() => {
    const header = ["id","nivel","titular_nome","atleta_nome","descricao","validado","created_at"].join(";");
    const lines = rows.map(r => [
      r.id,
      r.nivel,
      (r.titular_nome || ""),
      (r.atleta_nome || ""),
      (r.descricao || "").replaceAll(";", ","),
      r.validado === true ? "1" : r.validado === false ? "0" : "",
      r.created_at || ""
    ].join(";"));
    return [header, ...lines].join("\n");
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pagamentos_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <div className="text-xs font-medium">Pesquisar</div>
          <input className="border rounded px-2 py-1" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={onKey} placeholder="titular, atleta, descrição…" />
        </div>
        <div>
          <div className="text-xs font-medium">Estado</div>
          <select className="border rounded px-2 py-1" value={estado} onChange={e=>setEstado(e.target.value as Estado)}>
            <option value="all">Todos</option>
            <option value="val">Validados</option>
            <option value="pend">Pendentes</option>
            <option value="sem">Sem marcação</option>
          </select>
        </div>
        <div>
          <div className="text-xs font-medium">Nível</div>
          <select className="border rounded px-2 py-1" value={nivel} onChange={e=>setNivel(e.target.value as Nivel)}>
            <option value="all">Todos</option>
            <option value="socio">Sócio/EE</option>
            <option value="atleta">Atleta</option>
          </select>
        </div>
        <div>
          <div className="text-xs font-medium">Ordenação</div>
          <select className="border rounded px-2 py-1" value={order} onChange={e=>setOrder(e.target.value as "recentes"|"antigos")}>
            <option value="recentes">Mais recentes</option>
            <option value="antigos">Mais antigos</option>
          </select>
        </div>
        <button className="border rounded px-3 py-1" onClick={refresh} disabled={busy}>{busy ? "Aguarde…" : "Atualizar"}</button>
        <button className="border rounded px-3 py-1" onClick={downloadCsv}>Exportar CSV</button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-3">Nível</th>
              <th className="py-2 pr-3">Titular</th>
              <th className="py-2 pr-3">Atleta</th>
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Comprovativo</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">Data</th>
              <th className="py-2 pr-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b">
                <td className="py-2 pr-3">{r.nivel === "socio" ? "Sócio/EE" : "Atleta"}</td>
                <td className="py-2 pr-3">{r.titular_nome || "—"}</td>
                <td className="py-2 pr-3">{r.atleta_nome || "—"}</td>
                <td className="py-2 pr-3">{r.descricao}</td>
                <td className="py-2 pr-3">
                  {r.signedUrl
                    ? <a className="underline" href={r.signedUrl} target="_blank" rel="noreferrer">Abrir</a>
                    : <span className="text-gray-500">—</span>}
                </td>
                <td className="py-2 pr-3">
                  {r.validado === true ? "Validado" : r.validado === false ? "Pendente" : "—"}
                </td>
                <td className="py-2 pr-3">{r.created_at?.replace("T"," ").slice(0,16) || "—"}</td>
                <td className="py-2 pr-3">
                  <button className="border rounded px-2 py-1"
                          onClick={()=>toggleValidado(r)}>
                    {r.validado === true ? "Anular" : "Validar"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="py-6 text-center text-gray-500">Sem resultados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
