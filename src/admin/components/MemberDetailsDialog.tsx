// src/admin/components/MemberDetailsDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Link as LinkIcon, RefreshCw } from "lucide-react";

import {
  listDocs,// src/admin/components/MemberDetailsDialog.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import {
  fetchSocioFull,
  listAtletasByUser,
  fetchSocioDocs,
  type SocioRow,
  type SocioFullRow,
  type AtletaRow,
  type DocRow,
} from "../services/adminSociosService";

/* ================= Badges ================= */

function TesourariaBadge({
  status,
}: {
  status: "Regularizado" | "Pendente" | "Parcial" | string | null | undefined;
}) {
  const map: Record<string, string> = {
    Regularizado: "bg-green-100 text-green-800",
    Pendente: "bg-red-100 text-red-800",
    Parcial: "bg-amber-100 text-amber-800",
  };
  const s = (status || "Pendente") as string;
  const cls = map[s] ?? "bg-gray-100 text-gray-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
}

type InscStatus = "Regularizado" | "Pendente de validação" | "Por regularizar" | "Em atraso";

function InscricaoBadge({ status }: { status: InscStatus }) {
  const map = {
    Regularizado: "bg-green-100 text-green-800",
    "Pendente de validação": "bg-yellow-100 text-yellow-800",
    "Por regularizar": "bg-gray-100 text-gray-800",
    "Em atraso": "bg-red-100 text-red-800",
  } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status]}`}>
      {status}
    </span>
  );
}

/* =============== Utils =============== */

function deriveInscricaoStatus(row: {
  validado?: boolean | null;
  comprovativo_url?: string | null;
  devido_em?: string | null;
}): InscStatus {
  const validado = !!row.validado;
  const comprovativo = !!(row.comprovativo_url && `${row.comprovativo_url}`.trim().length > 0);
  const due = row.devido_em ?? null;

  if (validado) return "Regularizado";
  if (comprovativo) return "Pendente de validação";
  if (due) {
    const dt = new Date(due + "T23:59:59");
    if (Date.now() > dt.getTime()) return "Em atraso";
  }
  return "Por regularizar";
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-PT");
}

/* =============== Tipos =============== */

type MemberRow = SocioRow & { user_id: string };

/* =============== Component =============== */

export default function MemberDetailsDialog({
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

  // Inscrição de sócio (estado + due + comprovativo)
  const isSocio = !!member.tipo_socio && !/não\s*pretendo/i.test(member.tipo_socio);
  const [inscStatus, setInscStatus] = useState<InscStatus | null>(null);
  const [inscDue, setInscDue] = useState<string | null>(null);
  const [inscComprov, setInscComprov] = useState<string | null>(null);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSocio) {
        setInscStatus(null);
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      const { data, error } = await supabase
        .from("pagamentos")
        .select("id, validado, comprovativo_url, devido_em")
        .eq("user_id", userId)
        .is("atleta_id", null)
        .eq("tipo", "inscricao")
        .order("created_at", { ascending: false })
        .limit(1);

      if (!mounted) return;
      if (error) {
        console.error("[MemberDetailsDialog] inscrição sócio:", error);
        setInscStatus(null);
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      const r = (data || [])[0];
      if (!r) {
        setInscStatus("Por regularizar");
        setInscDue(null);
        setInscComprov(null);
        return;
      }
      setInscStatus(deriveInscricaoStatus(r));
      setInscDue(r.devido_em ?? null);
      setInscComprov(r.comprovativo_url ?? null);
    })();
    return () => {
      mounted = false;
    };
  }, [userId, isSocio]);

  return (
    <dialog open={open} className="modal" onClose={() => onOpenChange(false)}>
      <div className="modal-box max-w-4xl w-full rounded-xl border bg-white">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Detalhe do Sócio</h3>
          <button className="btn btn-sm" onClick={() => onOpenChange(false)}>
            Fechar
          </button>
        </div>

        {/* ====== Bloco compacto: estados ====== */}
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-500">Situação de tesouraria</div>
            <div className="mt-1">
              <TesourariaBadge status={member.situacao_tesouraria || "Pendente"} />
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-gray-500">Inscrição de sócio</div>
            <div className="mt-1 flex items-center gap-2">
              {isSocio && inscStatus ? (
                <InscricaoBadge status={inscStatus} />
              ) : (
                <span className="text-xs text-gray-500">N/A</span>
              )}
              {isSocio && inscStatus && inscDue && (
                <span className="text-xs text-gray-500">· Data limite: {fmtDate(inscDue)}</span>
              )}
              {isSocio && inscStatus && inscComprov && (
                <a
                  href={inscComprov}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs underline text-gray-700"
                >
                  Ver comprovativo
                </a>
              )}
            </div>
          </div>
        </div>

        {/* ====== Tabs ====== */}
        <div className="mt-4">
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
            {active === "dados" && (
              <>
                {loadingDados && <p className="text-sm text-gray-600">A carregar…</p>}
                {errDados && <p className="text-sm text-red-600">{errDados}</p>}
                {dados && (
                  <div className="grid md:grid-cols-2 gap-3">
                    <Field label="Nome">{dados.nome_completo || "—"}</Field>
                    <Field label="Email">{dados.email || "—"}</Field>
                    <Field label="Telefone">{dados.telefone || "—"}</Field>
                    <Field label="Tipo de sócio">{dados.tipo_socio || "—"}</Field>
                    <Field label="Criado em">
                      {dados.created_at?.slice(0, 19)?.replace("T", " ") || "—"}
                    </Field>
                  </div>
                )}
              </>
            )}

            {active === "atletas" && (
              <>
                {loadingAt && <p className="text-sm text-gray-600">A carregar…</p>}
                {errAt && <p className="text-sm text-red-600">{errAt}</p>}
                {atletas && atletas.length === 0 && (
                  <p className="text-sm text-gray-500">Sem atletas associados.</p>
                )}
                {atletas && atletas.length > 0 && (
                  <div className="space-y-3">
                    {atletas.map((a) => (
                      <div key={a.id} className="border rounded-xl p-3">
                        <div className="font-medium">{a.nome}</div>
                        <div className="text-xs text-gray-500">
                          Escalão: {a.escalao || "—"} · Género: {a.genero || "—"} · Plano:{" "}
                          {a.opcao_pagamento || "—"}
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
                {docs && docs.length === 0 && <p className="text-sm text-gray-500">Sem documentos.</p>}
                {docs && docs.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1">
                    {docs.map((d, i) => (
                      <li key={i} className="text-sm">
                        {d.doc_tipo} — {d.file_path || "—"}
                      </li>
                    ))}
                  </ul>
                )}
              </>
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
