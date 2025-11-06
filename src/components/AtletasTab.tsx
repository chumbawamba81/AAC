import React, { useEffect, useState } from "react";

import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { supabase } from "../supabaseClient";
import { deleteAtleta as removeAtleta } from "../services/atletasService";
import type { Atleta } from "../types/Atleta";
import { AlertCircle, CheckCircle2, PencilLine, Plus, Trash2, Users } from "lucide-react";
import AtletaEdit from "./AtletaEdit";

type AtletasTabProps = {
  state: {
    atletas: Atleta[];
    docsAtleta: Record<string, any>;
    pagamentos: Record<string, Array<any | null>>;
  };
  setState: React.Dispatch<React.SetStateAction<any>>;
  onOpenForm: (a?: Atleta) => void;
  dadosPessoais?: {
    morada?: string;
    codigoPostal?: string;
    telefone?: string;
    email?: string;
  };
  tipoSocio?: string | null;
};

const DOCS_ATLETA = [
  "Ficha de sócio de atleta",
  "Ficha de jogador FPB",
  "Termo de responsabilidade",
  "Exame médico",
] as const;

function isAnuidadeObrigatoria(escalao?: string | null) {
  const s = (escalao || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isMasters = s.includes("masters");
  const isSub23 = /(sub|seniores)[^\d]*23/.test(s) || /sub[-\s]?23/.test(s);
  return isMasters || isSub23;
}

export default function AtletasTab({ state, setState, onOpenForm, dadosPessoais, tipoSocio }: AtletasTabProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [missingByAth, setMissingByAth] = useState<Record<string, number>>({});
  const [editingAtleta, setEditingAtleta] = useState<Atleta | null>(null);

  useEffect(() => {
    let mounted = true;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUserId(data?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function recomputeMissing(currentUserId: string) {
    const { data, error } = await supabase
      .from("documentos")
      .select("atleta_id, doc_tipo")
      .eq("user_id", currentUserId)
      .eq("doc_nivel", "atleta");

    if (error) {
      console.error("[AtletasTab] SELECT documentos:", error.message);
      return;
    }

    const byAth: Map<string, Set<string>> = new Map();
    for (const r of (data || []) as any[]) {
      if (!r.atleta_id) continue;
      const set = byAth.get(r.atleta_id) || new Set<string>();
      set.add(r.doc_tipo);
      byAth.set(r.atleta_id, set);
    }

    const out: Record<string, number> = {};
    for (const a of state.atletas) {
      const have = byAth.get(a.id) || new Set<string>();
      let miss = 0;
      for (const t of DOCS_ATLETA) if (!have.has(t)) miss++;
      out[a.id] = miss;
    }
    setMissingByAth(out);
  }

  useEffect(() => {
    if (!userId) return;
    recomputeMissing(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state.atletas.map((a) => a.id).join(",")]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("docs-atletas")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documentos",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          recomputeMissing(userId);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function remove(id: string) {
    if (!confirm("Remover o atleta?")) return;
    try {
      await removeAtleta(id);
      const next = {
        ...state,
        atletas: state.atletas.filter((x) => x.id !== id),
      } as any;
      delete (next as any).docsAtleta[id];
      delete (next as any).pagamentos[id];
      setState(next);
      // Parent persists state to localStorage via effect
    } catch (e: any) {
      alert(e.message || "Falha ao remover o atleta");
    }
  }

  function handleStartEdit(atleta: Atleta) {
    setEditingAtleta(atleta);
  }

  function handleCancelEdit() {
    setEditingAtleta(null);
  }

  async function handleSaveEdit(updatedAtleta: Atleta) {
    // Update state with the saved atleta (already saved to DB by AtletaEdit)
    const wasEditingId = editingAtleta?.id;
    const nextAtletas = wasEditingId
      ? state.atletas.map((x) => (x.id === wasEditingId ? updatedAtleta : x))
      : [updatedAtleta, ...state.atletas];
    
    setState((prev: any) => ({ ...prev, atletas: nextAtletas }));
    setEditingAtleta(null);
  }

  // Show edit form if editing
  if (editingAtleta) {
    return (
      <AtletaEdit
        atleta={editingAtleta}
        onSave={handleSaveEdit}
        onCancel={handleCancelEdit}
        dadosPessoais={dadosPessoais}
        tipoSocio={tipoSocio}
        agregadoAtletas={state.atletas}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Inscrição de Atletas
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-4">
          <Button variant='dark' onClick={() => onOpenForm(undefined)}>
            <Plus className="h-4 w-4 mr-1" /> Novo atleta
          </Button>
        </div>

        {state.atletas.length === 0 && (
          <p className="text-sm text-gray-500">Sem atletas. Clique em "Novo atleta".</p>
        )}
        <div className="p-1 bg-white"></div>

        <div>
          {state.atletas.map((a) => {
            const missing = missingByAth[a.id] ?? DOCS_ATLETA.length;
            return (
              <div key={a.id}>
                <div className="p-1 bg-white"></div>
                  <div className="bg-stone-200 p-4">
                    <div className="flex flex-col sm:flex-row">
                      <div className="flex-1 flex-col space-y-1 p-1">
                        <div data-slot="card-content">
                          <div className="font-medium flex items-center gap-2">
                            {a.nomeCompleto}
                            {missing > 0 ? (
                              <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-red-100 text-red-700">
                                <AlertCircle className="h-3 w-3" /> {missing} doc(s) em falta
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3" /> Documentação completa
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {a.genero} · Nasc.: {a.dataNascimento} · Escalão: {a.escalao} · Pagamento: {isAnuidadeObrigatoria(a.escalao)
                              ? "Sem quotas (apenas inscrição)"
                              : a.planoPagamento}
                          </div>
                        </div>
                      </div>
                      <div className="flex-none space-y-1 p-1">
                      <div data-slot="card-content" className="flex items-center gap-1 justify-end sm:justify-between">
                          <Button className="mr-4" variant="grey" onClick={() => handleStartEdit(a)}>
                            <PencilLine className="h-4 w-4 mr-1" /> Editar
                          </Button>
                          <Button  variant="destructive" onClick={() => remove(a.id)}>
                            <Trash2 className="h-4 w-4 mr-1" /> Remover
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}


