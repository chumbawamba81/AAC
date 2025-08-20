// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nível do pagamento */
export type NivelPagamento = "socio" | "atleta";

/** Estados (derivados) */
export type StatusPagamento =
  | "Regularizado"
  | "Pendente de validação"
  | "Por regularizar"
  | "Em atraso";

/** Linha apresentada na Tesouraria/Admin */
export interface AdminPagamento {
  id: string;
  nivel: NivelPagamento;
  descricao: string;
  createdAt: string | null;
  status: StatusPagamento;    // ← derivado
  validado: boolean;

  titularUserId: string;
  titularName: string;

  atletaId: string | null;
  atletaNome: string | null;

  // novos campos do atleta (para as novas colunas)
  atletaEscalao: string | null;
  atletaGenero: string | null;
  atletaPlano: string | null;

  // comprovativo
  filePath: string | null;    // pode ser URL absoluto ou caminho de storage
  signedUrl: string | null;   // URL para abrir

  // extras para contexto/filtragem
  tipo?: string | null;
  devidoEm?: string | null;
  validadoEm?: string | null;
  validadoPor?: string | null;
}

type Filtro = "todos" | "inscricao" | "mensalidades";

/** Heurística: separa inscrição vs mensalidades */
function isInscricaoFromRow(r: any): boolean {
  if (r.atleta_id == null) return true; // sócio → inscrições/quotas
  const t = (r.tipo || "").toLowerCase();
  if (t.includes("inscri")) return true;
  return (r.descricao || "").toLowerCase().includes("inscri");
}

/** 10.º dia do mês de `devido_em` (23:59:59) */
function deadlineFromDevidoEm(devidoEm: string | null | undefined): Date | null {
  if (!devidoEm) return null;
  const d = new Date(devidoEm);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), 10, 23, 59, 59, 999);
}

/** Derivar estado segundo as regras indicadas */
function deriveStatus(params: {
  validado: boolean;
  comprovativoUrl: string | null;
  devidoEm: string | null;
  now?: Date;
}): StatusPagamento {
  const { validado, comprovativoUrl, devidoEm } = params;
  const now = params.now ?? new Date();

  if (validado) return "Regularizado";

  const hasComprovativo = !!(comprovativoUrl && `${comprovativoUrl}`.trim().length > 0);
  if (hasComprovativo) return "Pendente de validação";

  const dl = deadlineFromDevidoEm(devidoEm);
  if (!dl) return "Por regularizar"; // sem referência temporal, assume dentro do prazo

  return now <= dl ? "Por regularizar" : "Em atraso";
}

/** Resolver link abrível a partir de `comprovativo_url` */
async function resolveSignedUrl(comprovativo_url: string | null): Promise<{ filePath: string | null; signedUrl: string | null }> {
  if (!comprovativo_url) return { filePath: null, signedUrl: null };
  if (/^https?:\/\//i.test(comprovativo_url)) {
    return { filePath: comprovativo_url, signedUrl: comprovativo_url };
  }
  try {
    const { data } = await supabase.storage.from("pagamentos").createSignedUrl(comprovativo_url, 60 * 60);
    return { filePath: comprovativo_url, signedUrl: data?.signedUrl ?? null };
  } catch {
    return { filePath: comprovativo_url, signedUrl: null };
  }
}

/** Lista pagamentos para a Tesouraria (admin) */
export async function listPagamentosAdmin(filtro: Filtro = "todos"): Promise<AdminPagamento[]> {
  const { data: pays, error } = await supabase
    .from("pagamentos")
    .select(`
      id,
      created_at,
      descricao,
      tipo,
      devido_em,
      user_id,
      atleta_id,
      comprovativo_url,
      validado,
      validado_em,
      validado_por
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const filtered = (pays ?? []).filter((r) => {
    if (filtro === "todos") return true;
    const insc = isInscricaoFromRow(r);
    return filtro === "inscricao" ? insc : !insc;
  });

  // titulares
  const userIds = Array.from(new Set(filtered.map((r) => r.user_id).filter(Boolean)));
  const titularByUser: Record<string, string> = {};
  if (userIds.length) {
    const { data: titulares } = await supabase
      .from("dados_pessoais")
      .select("user_id, nome_completo")
      .in("user_id", userIds);
    for (const t of (titulares ?? [])) {
      titularByUser[(t as any).user_id] = (t as any).nome_completo ?? "—";
    }
  }

  // atletas (nome, escalao, genero, plano)
  const atletaIds = Array.from(new Set(filtered.map((r) => r.atleta_id).filter(Boolean)));
  const atletaById: Record<string, { nome: string | null; escalao: string | null; genero: string | null; plano: string | null }> = {};
  if (atletaIds.length) {
    const { data: atletas } = await supabase
      .from("atletas")
      .select("id, nome, escalao, genero, opcao_pagamento")
      .in("id", atletaIds);
    for (const a of (atletas ?? [])) {
      atletaById[(a as any).id] = {
        nome: (a as any).nome ?? "—",
        escalao: (a as any).escalao ?? null,
        genero: (a as any).genero ?? null,
        plano: (a as any).opcao_pagamento ?? null,
      };
    }
  }

  const out: AdminPagamento[] = await Promise.all(
    filtered.map(async (r: any) => {
      const status = deriveStatus({
        validado: !!r.validado,
        comprovativoUrl: r.comprovativo_url ?? null,
        devidoEm: r.devido_em ?? null,
      });

      const { filePath, signedUrl } = await resolveSignedUrl(r.comprovativo_url ?? null);

      const at = r.atleta_id ? (atletaById[r.atleta_id] ?? { nome: "—", escalao: null, genero: null, plano: null }) : null;

      return {
        id: r.id,
        nivel: r.atleta_id ? "atleta" : "socio",
        descricao: r.descricao ?? "",
        createdAt: r.created_at ?? null,
        status,
        validado: !!r.validado,
        titularUserId: r.user_id,
        titularName: titularByUser[r.user_id] ?? "—",
        atletaId: r.atleta_id ?? null,
        atletaNome: r.atleta_id ? (at?.nome ?? "—") : null,
        atletaEscalao: at?.escalao ?? null,
        atletaGenero: at?.genero ?? null,
        atletaPlano: at?.plano ?? null,
        filePath,
        signedUrl,
        tipo: r.tipo ?? null,
        devidoEm: r.devido_em ?? null,
        validadoEm: r.validado_em ?? null,
        validadoPor: r.validado_por ?? null,
      };
    })
  );

  return out;
}

/** Alterna validação (true/false) e devolve a linha atualizada */
export async function marcarPagamentoValidado(pagamentoId: string, next: boolean): Promise<AdminPagamento | null> {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth?.user?.id ?? null;

  const patch: any = {
    validado: next,
    validado_em: next ? new Date().toISOString() : null,
    validado_por: next ? adminId : null,
  };

  const { data, error } = await supabase
    .from("pagamentos")
    .update(patch)
    .eq("id", pagamentoId)
    .select(`
      id,
      created_at,
      descricao,
      tipo,
      devido_em,
      user_id,
      atleta_id,
      comprovativo_url,
      validado,
      validado_em,
      validado_por
    `)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const status = deriveStatus({
    validado: !!data.validado,
    comprovativoUrl: data.comprovativo_url ?? null,
    devidoEm: data.devido_em ?? null,
  });
  const { filePath, signedUrl } = await resolveSignedUrl(data.comprovativo_url ?? null);

  // NOTA: para devolver também escalao/genero/plano nesta resposta sem novo round-trip,
  // o parent faz sempre refresh via listPagamentosAdmin(). Aqui devolvemos placeholders.
  return {
    id: data.id,
    nivel: data.atleta_id ? "atleta" : "socio",
    descricao: data.descricao ?? "",
    createdAt: data.created_at ?? null,
    status,
    validado: !!data.validado,
    titularUserId: data.user_id,
    titularName: "—",
    atletaId: data.atleta_id ?? null,
    atletaNome: data.atleta_id ? "—" : null,
    atletaEscalao: null,
    atletaGenero: null,
    atletaPlano: null,
    filePath,
    signedUrl,
    tipo: data.tipo ?? null,
    devidoEm: data.devido_em ?? null,
    validadoEm: data.validado_em ?? null,
    validadoPor: data.validado_por ?? null,
  };
}
