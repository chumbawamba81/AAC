// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nível do pagamento: inscrição/quotas de sócio vs atleta (mensalidades/inscrição atleta) */
export type NivelPagamento = "socio" | "atleta";

/** Estado (derivado de `validado`) */
export type StatusPagamento = "pendente" | "validado";

/** Linha apresentada na Tesouraria/Admin */
export interface AdminPagamento {
  id: string;
  nivel: NivelPagamento;
  descricao: string;
  createdAt: string | null;
  status: StatusPagamento;    // ← derivado de `validado`
  validado: boolean;

  titularUserId: string;      // user_id do titular
  titularName: string;        // nome em dados_pessoais (ou "—")

  atletaId: string | null;
  atletaNome: string | null;

  filePath: string | null;    // mantemos para compat: será o valor bruto de comprovativo_url (se for path)
  signedUrl: string | null;   // link para abrir o comprovativo (assinada ou directa)

  // extra úteis (presentes no schema)
  tipo?: string | null;       // campo `tipo` da tabela (se quiseres mostrar/filtrar)
  devidoEm?: string | null;   // ISO de `devido_em`
  validadoEm?: string | null; // timestamp de validação
  validadoPor?: string | null;// uuid do admin que validou
}

type Filtro = "todos" | "inscricao" | "mensalidades";

/** Heurística: a partir de atleta_id decide nivel */
function nivelFromRow(atleta_id: string | null | undefined): NivelPagamento {
  return atleta_id ? "atleta" : "socio";
}

/** Derivar status a partir de `validado` */
function statusFromValidado(validado: any): StatusPagamento {
  return !!validado ? "validado" : "pendente";
}

/** Tentar gerar um link abrível a partir de `comprovativo_url` */
async function resolveSignedUrl(comprovativo_url: string | null): Promise<{ filePath: string | null; signedUrl: string | null }> {
  if (!comprovativo_url) return { filePath: null, signedUrl: null };

  // Se já for um URL http(s), usa directamente
  if (/^https?:\/\//i.test(comprovativo_url)) {
    return { filePath: comprovativo_url, signedUrl: comprovativo_url };
  }

  // Caso contrário, assumimos que é um caminho de Storage no bucket "pagamentos"
  try {
    const { data, error } = await supabase
      .storage
      .from("pagamentos")
      .createSignedUrl(comprovativo_url, 60 * 60);
    if (error) return { filePath: comprovativo_url, signedUrl: null };
    return { filePath: comprovativo_url, signedUrl: data?.signedUrl ?? null };
  } catch {
    return { filePath: comprovativo_url, signedUrl: null };
  }
}

/**
 * Lista pagamentos para a Tesouraria (admin).
 * NOTA: Não selecciona 'status' na BD (não existe); é derivado de 'validado'.
 * Usa `comprovativo_url` em vez de `file_path`.
 */
export async function listPagamentosAdmin(filtro: Filtro = "todos"): Promise<AdminPagamento[]> {
  // 1) Ler pagamentos crus (campos existentes no teu schema)
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

  // 2) Filtrar por 'inscricao' vs 'mensalidades'
  const filtered = (pays ?? []).filter((r: any) => {
    if (filtro === "todos") return true;

    // Preferir o campo `tipo` se estiver preenchido; caso contrário, usar heurística na descrição
    const tipo: string = (r.tipo || "").toLowerCase();
    if (tipo) {
      const isInscricao = tipo.includes("inscri") || tipo.includes("insc");
      return filtro === "inscricao" ? isInscricao : !isInscricao;
    }
    const isInscricaoDesc = (r.descricao || "").toLowerCase().includes("inscri");
    return filtro === "inscricao" ? isInscricaoDesc : !isInscricaoDesc;
  });

  // 3) Mapear titulares (dados_pessoais) e atletas
  const userIds = Array.from(new Set(filtered.map((r: any) => r.user_id).filter(Boolean)));
  const atletaIds = Array.from(new Set(filtered.map((r: any) => r.atleta_id).filter(Boolean)));

  const titularByUser: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: titulares } = await supabase
      .from("dados_pessoais")
      .select("user_id, nome_completo")
      .in("user_id", userIds);
    for (const t of (titulares ?? [])) {
      titularByUser[(t as any).user_id] = (t as any).nome_completo ?? "—";
    }
  }

  const atletaById: Record<string, string> = {};
  if (atletaIds.length > 0) {
    const { data: atletas } = await supabase
      .from("atletas")
      .select("id, nome")
      .in("id", atletaIds);
    for (const a of (atletas ?? [])) {
      atletaById[(a as any).id] = (a as any).nome ?? "—";
    }
  }

  // 4) Montar saída + assinar URLs em paralelo
  const out: AdminPagamento[] = await Promise.all(
    filtered.map(async (r: any) => {
      const nivel = nivelFromRow(r.atleta_id);
      const status = statusFromValidado(r.validado);

      const { filePath, signedUrl } = await resolveSignedUrl(r.comprovativo_url ?? null);

      return {
        id: r.id,
        nivel,
        descricao: r.descricao ?? "",
        createdAt: r.created_at ?? null,
        status,
        validado: !!r.validado,
        titularUserId: r.user_id,
        titularName: titularByUser[r.user_id] ?? "—",
        atletaId: r.atleta_id ?? null,
        atletaNome: r.atleta_id ? (atletaById[r.atleta_id] ?? "—") : null,
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

/**
 * Alterna validação (true/false) e devolve a linha atualizada.
 * Escreve também `validado_em` e `validado_por`.
 * NOTA: continua a não escrever 'status' (inexistente); o status é derivado.
 */
export async function marcarPagamentoValidado(pagamentoId: string, next: boolean): Promise<AdminPagamento | null> {
  // identificar o admin autenticado para preencher `validado_por`
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

  const status = statusFromValidado(data.validado);
  const { filePath, signedUrl } = await resolveSignedUrl(data.comprovativo_url ?? null);

  return {
    id: data.id,
    nivel: nivelFromRow(data.atleta_id),
    descricao: data.descricao ?? "",
    createdAt: data.created_at ?? null,
    status,
    validado: !!data.validado,
    titularUserId: data.user_id,
    titularName: "—",         // será reidratado num refresh da listagem
    atletaId: data.atleta_id ?? null,
    atletaNome: data.atleta_id ? "—" : null,
    filePath,
    signedUrl,
    tipo: data.tipo ?? null,
    devidoEm: data.devido_em ?? null,
    validadoEm: data.validado_em ?? null,
    validadoPor: data.validado_por ?? null,
  };
}
