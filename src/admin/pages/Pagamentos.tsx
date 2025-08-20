// src/admin/pages/Pagamentos.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import {
  listPagamentosAdmin,
  computeEstadoByAtleta,
  markPagamentoValidado,
  listComprovativosSocio,
  listComprovativosInscricaoAtleta,
  setTesourariaSocio,
  type AdminPagamento,
  type AdminDoc,
  type EstadoMensalidades,
} from "../services/adminPagamentosService";

/* -------------------------- UI helpers (pílulas) -------------------------- */

function Pill({
  tone,
  children,
}: {
  tone: "gray" | "yellow" | "green" | "red" | "blue";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-800",
    yellow: "bg-yellow-100 text-yellow-800",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

function EstadoBadge({ estado }: { estado: EstadoMensalidades | "Pendente de validação" | "—" }) {
  if (estado === "Regularizado") return <Pill tone="green">Regularizado</Pill>;
  if (estado === "Pendente de validação") return <Pill tone="yellow">Pendente de validação</Pill>;
  if (estado === "Em atraso") return <Pill tone="red">Em atraso</Pill>;
  if (estado === "—") return <Pill tone="gray">—</Pill>;
  return <Pill tone="gray">{estado}</Pill>;
}

/* ----------------------------- Mensalidades ----------------------------- */

function MensalidadesTable() {
  const [rows, setRows] = useState<AdminPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const data = await listPagamentosAdmin();
      if (live) setRows(data.filter(r => r.nivel === "atleta"));
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  const estadoByAth = useMemo(() => computeEstadoByAtleta(rows), [rows]);

  async function toggleValid(r: AdminPagamento) {
    await markPagamentoValidado(r.id, !r.validado);
    // refetch rápido
    const data = await listPagamentosAdmin();
    setRows(data.filter(x => x.nivel === "atleta"));
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Mensalidades</h3>
      {loading ? (
        <p className="text-sm text-gray-500">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sem registos de pagamentos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left">
              <tr className="border-b">
                <th className="py-2 pr-3">Atleta</th>
                <th className="py-2 pr-3">Descrição</th>
                <th className="py-2 pr-3">Validação</th>
                <th className="py-2 pr-3">Estado (até hoje)</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const estat = r.atletaId ? estadoByAth.get(r.atletaId) : undefined;
                return (
                  <tr key={r.id} className="border-b align-middle">
                    <td className="py-2 pr-3">{r.atletaNome ?? "—"}</td>
                    <td className="py-2 pr-3">{r.descricao ?? "—"}</td>
                    <td className="py-2 pr-3">
                      {r.validado ? (
                        <Pill tone="green">Validado</Pill>
                      ) : (
                        <Pill tone="gray">Pendente</Pill>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <EstadoBadge estado={estat?.estado ?? "—"} />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {r.signedUrl && (
                          <a
                            className="underline text-sm"
                            href={r.signedUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir
                          </a>
                        )}
                        <Button onClick={() => toggleValid(r)}>
                          {r.validado ? "Reverter" : "Validar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* --------------------------- Inscrição — Sócio --------------------------- */

function InscricaoSocioTable() {
  const [rows, setRows] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const data = await listComprovativosSocio();
      if (live) setRows(data);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  async function validar(userId: string | null) {
    if (!userId) return;
    await setTesourariaSocio(userId, "Regularizado");
    const data = await listComprovativosSocio();
    setRows(data);
  }
  async function reverter(userId: string | null) {
    if (!userId) return;
    await setTesourariaSocio(userId, "Pendente");
    const data = await listComprovativosSocio();
    setRows(data);
  }

  // agrupar por titular (cada titular pode ter 1..n páginas/ficheiros)
  const byUser = useMemo(() => {
    const m = new Map<string, AdminDoc[]>();
    for (const d of rows) {
      const key = d.userId ?? `sem-user-${d.id}`;
      m.set(key, [...(m.get(key) || []), d]);
    }
    return m;
  }, [rows]);

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Inscrição Sócio</h3>
      {loading ? (
        <p className="text-sm text-gray-500">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sem comprovativos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left">
              <tr className="border-b">
                <th className="py-2 pr-3">Titular (email)</th>
                <th className="py-2 pr-3">Validação</th>
                <th className="py-2 pr-3">Estado (até hoje)</th>
                <th className="py-2 pr-3">Comprovativo</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(byUser.entries()).map(([key, docs]) => {
                // heurística de estado: se há doc => "Pendente de validação"
                // (a confirmação real é a situação de tesouraria, que validas com o botão)
                const any = docs[0];
                const estado: "Pendente de validação" | "—" =
                  docs.length > 0 ? "Pendente de validação" : "—";
                const userId = any.userId ?? null;
                const email = any.titularEmail ?? "—";
                const firstUrl = docs.find(d => !!d.signedUrl)?.signedUrl ?? null;

                return (
                  <tr key={key} className="border-b align-middle">
                    <td className="py-2 pr-3">{email}</td>
                    <td className="py-2 pr-3">
                      <Pill tone="gray">Pendente</Pill>
                    </td>
                    <td className="py-2 pr-3">
                      <EstadoBadge estado={estado} />
                    </td>
                    <td className="py-2 pr-3">
                      {firstUrl ? (
                        <a className="underline" href={firstUrl} target="_blank" rel="noreferrer">
                          Abrir
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <Button onClick={() => validar(userId)}>Validar</Button>
                        <Button variant="secondary" onClick={() => reverter(userId)}>
                          Reverter
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        A validação marca a situação de tesouraria do titular como <strong>Regularizado</strong>.
        “Reverter” volta para <strong>Pendente</strong>.
      </p>
    </Card>
  );
}

/* ---------------------------- Inscrição (Atleta) --------------------------- */

function InscricaoAtletaTable() {
  const [rows, setRows] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      const data = await listComprovativosInscricaoAtleta();
      if (live) setRows(data);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, []);

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Inscrição</h3>
      {loading ? (
        <p className="text-sm text-gray-500">A carregar…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">Sem comprovativos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left">
              <tr className="border-b">
                <th className="py-2 pr-3">Atleta</th>
                <th className="py-2 pr-3">Titular (email)</th>
                <th className="py-2 pr-3">Comprovativo</th>
                <th className="py-2 pr-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b align-middle">
                  <td className="py-2 pr-3">{d.atletaNome ?? "—"}</td>
                  <td className="py-2 pr-3">{d.titularEmail ?? "—"}</td>
                  <td className="py-2 pr-3">
                    {d.signedUrl ? (
                      <a className="underline" href={d.signedUrl} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {/* Sem “validado” persistente para atleta; apenas indicativo */}
                    <Pill tone="yellow">Recebido</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Este separador lista os comprovativos de inscrição dos atletas. Não existe (ainda) um estado
        de “validado” persistente para atleta — se quiseres guardá-lo, criamos um campo específico.
      </p>
    </Card>
  );
}

/* ---------------------------------- Page ---------------------------------- */

export default function PagamentosPage() {
  const [tab, setTab] = useState<"mensal" | "socio" | "atl">("mensal");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "mensal" ? "bg-black text-white" : "bg-gray-100"
          }`}
          onClick={() => setTab("mensal")}
        >
          Mensalidades
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "socio" ? "bg-black text-white" : "bg-gray-100"
          }`}
          onClick={() => setTab("socio")}
        >
          Inscrição Sócio
        </button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm ${
            tab === "atl" ? "bg-black text-white" : "bg-gray-100"
          }`}
          onClick={() => setTab("atl")}
        >
          Inscrição
        </button>
      </div>

      {tab === "mensal" && <MensalidadesTable />}
      {tab === "socio" && <InscricaoSocioTable />}
      {tab === "atl" && <InscricaoAtletaTable />}
    </div>
  );
}
