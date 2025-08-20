// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { RefreshCw, CheckCircle2, XCircle, Link as LinkIcon, AlertCircle } from "lucide-react";

import {
  listPagamentosAdmin,
  markPagamentoValidado,
  recomputeTesourariaSocio,
  recomputeTesourariaAtleta,
  listComprovativosInscricaoAtleta,
  listComprovativosSocio, // continua disponível na outra página se quiseres manter
  setTesourariaSocio,
  computeEstadoByAtleta,
  type AdminPagamento,
  type AdminDoc,
} from "../services/adminPagamentosService";

type View = "mensalidades" | "inscricaoAtleta";

export default function PagamentosAdminPage() {
  const [view, setView] = useState<View>("mensalidades");

  // Mensalidades (tabela pagamentos)
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inscrição (ATLETA) — documentos
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [qd, setQd] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      if (view === "mensalidades") {
        const data = await listPagamentosAdmin();
        setRows(data);
      } else {
        const data = await listComprovativosInscricaoAtleta();
        setDocs(data);
      }
    } catch (e) {
      console.error("[Admin/Pagamentos] refresh", e);
      alert("Falha a carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [view]);

  const filteredRows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows
      .filter(r => {
        if (!text) return true;
        const hay = [
          r.titularEmail || "",
          r.descricao || "",
          r.atletaNome || "",
          r.comprovativoUrl || "",
          r.escalao || "",
          r.plano || "",
        ].join(" ").toLowerCase();
        return hay.includes(text);
      })
      .sort((a,b)=> new Date(b.created_at||0).getTime() - new Date(a.created_at||0).getTime());
  }, [rows, q]);

  // Estado por atleta (mensalidades)
  const estadoMap = useMemo(() => computeEstadoByAtleta(rows), [rows]);

  const filteredDocs = useMemo(() => {
    const text = qd.trim().toLowerCase();
    return docs
      .filter(d => {
        if (!text) return true;
        const hay = [d.titularEmail || "", d.atletaNome || "", d.docTipo || ""].join(" ").toLowerCase();
        return hay.includes(text);
      })
      .sort((a,b)=> new Date(b.uploaded_at||0).getTime() - new Date(a.uploaded_at||0).getTime());
  }, [docs, qd]);

  /* --------------------------- ações (mensalidades) -------------------------- */

  async function validarPagamento(row: AdminPagamento) {
    if (!confirm("Validar este pagamento?")) return;
    setBusyId(row.id);
    try {
      await markPagamentoValidado(row.id, true);
      if (row.nivel === "socio" && row.titularUserId) {
        await recomputeTesourariaSocio(row.titularUserId);
      } else if (row.nivel === "atleta" && row.atletaId) {
        await recomputeTesourariaAtleta(row.atletaId);
      }
      await refresh();
    } catch (e:any) {
      console.error("[Admin/Pagamentos] validarPagamento", e);
      alert(e?.message || "Falha a validar.");
    } finally { setBusyId(null); }
  }

  async function anularPagamento(row: AdminPagamento) {
    if (!confirm("Anular validação deste pagamento?")) return;
    setBusyId(row.id);
    try {
      await markPagamentoValidado(row.id, false);
      if (row.nivel === "socio" && row.titularUserId) {
        await recomputeTesourariaSocio(row.titularUserId);
      } else if (row.nivel === "atleta" && row.atletaId) {
        await recomputeTesourariaAtleta(row.atletaId);
      }
      await refresh();
    } catch (e:any) {
      console.error("[Admin/Pagamentos] anularPagamento", e);
      alert(e?.message || "Falha a anular.");
    } finally { setBusyId(null); }
  }

  /* --------------------- ações (inscrição do ATLETA — docs) -------------------- */

  async function validarInscricao(userId: string | null) {
    if (!userId) { alert("Sem titular associado."); return; }
    if (!confirm("Validar a inscrição (marcar titular como Regularizado)?")) return;
    try {
      await setTesourariaSocio(userId, "Regularizado");
      await refresh();
    } catch (e:any) {
      console.error("[Admin/Pagamentos] validarInscricao", e);
      alert(e?.message || "Falha a validar inscrição.");
    }
  }

  async function marcarPendente(userId: string | null) {
    if (!userId) { alert("Sem titular associado."); return; }
    if (!confirm("Marcar a inscrição como pendente?")) return;
    try {
      await setTesourariaSocio(userId, "Pendente");
      await refresh();
    } catch (e:any) {
      console.error("[Admin/Pagamentos] marcarPendente", e);
      alert(e?.message || "Falha a atualizar situação.");
    }
  }

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant={view==="mensalidades"?"secondary":"outline"} onClick={()=>setView("mensalidades")}>
          Mensalidades
        </Button>
        <Button variant={view==="inscricaoAtleta"?"secondary":"outline"} onClick={()=>setView("inscricaoAtleta")}>
          Inscrição (Atleta)
        </Button>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {view === "mensalidades" ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Tesouraria — Mensalidades (época atual)
              {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <div className="text-xs text-gray-600 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>
                  Mensal: set–jun (10) · Trimestral: set/jan/abr (3) · Anual: set (1). Estado considera parcelas vencidas até hoje.
                </span>
              </div>
              <div className="w-full md:w-80">
                <Input
                  placeholder="Pesquisar (email, atleta, descrição, escalão, plano)…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
            </div>

            <div className="overflow-auto border rounded-xl">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Titular (email)</th>
                    <th className="px-3 py-2">Atleta</th>
                    <th className="px-3 py-2">Escalão</th>
                    <th className="px-3 py-2">Plano</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">Comprovativo</th>
                    <th className="px-3 py-2">Validação</th>
                    <th className="px-3 py-2">Estado (até hoje)</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                        Sem registos.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => {
                      const est = r.atletaId ? estadoMap.get(r.atletaId) : undefined;
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2">
                            {r.created_at ? new Date(r.created_at).toLocaleString("pt-PT") : "—"}
                          </td>
                          <td className="px-3 py-2">{r.titularEmail || "—"}</td>
                          <td className="px-3 py-2">{r.atletaNome || "—"}</td>
                          <td className="px-3 py-2">{r.escalao || "—"}</td>
                          <td className="px-3 py-2">{r.plano || "—"}</td>
                          <td className="px-3 py-2">{r.descricao || "—"}</td>
                          <td className="px-3 py-2">
                            {r.signedUrl ? (
                              <a href={r.signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                                <LinkIcon className="h-4 w-4" /> Abrir
                              </a>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {r.validado ? (
                              <span className="inline-flex items-center gap-1 text-green-700">
                                <CheckCircle2 className="h-4 w-4" /> Validado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-gray-600">
                                <XCircle className="h-4 w-4" /> Pendente
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {est ? (
                              <span
                                title={est.detail}
                                className={
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full " +
                                  (est.estado === "Regularizado"
                                    ? "bg-green-100 text-green-700"
                                    : est.estado === "Pendente de validação"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : est.estado === "Em atraso"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-gray-100 text-gray-700")
                                }
                              >
                                {est.estado}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {!r.validado ? (
                                <Button onClick={() => validarPagamento(r)} disabled={busyId === r.id}>
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Validar
                                </Button>
                              ) : (
                                <Button variant="outline" onClick={() => anularPagamento(r)} disabled={busyId === r.id}>
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Anular
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500">{filteredRows.length} registo(s) mostrado(s).</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Inscrição (Atleta) — Comprovativos (documentos)
              {loading && <RefreshCw className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="w-full md:w-80">
                <Input
                  placeholder="Pesquisar por email, atleta…"
                  value={qd}
                  onChange={(e) => setQd(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Atualizar
              </Button>
            </div>

            <div className="overflow-auto border rounded-xl">
              <table className="min-w-[900px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Titular (email)</th>
                    <th className="px-3 py-2">Atleta</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Página</th>
                    <th className="px-3 py-2">Ficheiro</th>
                    <th className="px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-500">Sem comprovativos.</td>
                    </tr>
                  ) : (
                    filteredDocs.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-3 py-2">
                          {d.uploaded_at ? new Date(d.uploaded_at).toLocaleString("pt-PT") : "—"}
                        </td>
                        <td className="px-3 py-2">{d.titularEmail || "—"}</td>
                        <td className="px-3 py-2">{d.atletaNome || "—"}</td>
                        <td className="px-3 py-2">{d.docTipo}</td>
                        <td className="px-3 py-2">{d.page ?? "—"}</td>
                        <td className="px-3 py-2">
                          {d.signedUrl ? (
                            <a href={d.signedUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                              <LinkIcon className="h-4 w-4" /> Abrir
                            </a>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Button onClick={() => validarInscricao(d.userId)}>
                              <CheckCircle2 className="h-4 w-4 mr-1" /> Validar inscrição
                            </Button>
                            <Button variant="outline" onClick={() => marcarPendente(d.userId)}>
                              <XCircle className="h-4 w-4 mr-1" /> Marcar pendente
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500">{filteredDocs.length} comprovativo(s) mostrado(s).</div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
