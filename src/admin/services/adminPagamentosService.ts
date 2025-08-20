// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Modelo usado no Admin */
export interface AdminPagamento {
  id: string;
  descricao: string | null;
  createdAt: string | null;
  comprovativoUrl: string | null;
  signedUrl: string | null;

  // ligações (se existirem)
  atletaId: string | null;
  atletaNome: string | null;

  titularUserId: string | null;   // se a tabela tiver user_id
  titularEmail: string | null;    // resolvido via dados_pessoais

  validado: boolean | null;       // se a tabela tiver esta coluna
}

/** Util: converte qualquer unknown para string|null bonitinho */
function asStr(v: any): string | null {
  return typeof v === "string" ? v : v == null ? null : String(v);
}
function asBool(v: any): boolean | null {
  return typeof v === "boolean" ? v : v == null ? null : Boolean(v);
}

/**
 * Lista todos os pagamentos visíveis para o admin.
 * - 1ª query: public.pagamentos (*)
 * - 2ª query: nomes dos atletas (se houver atleta_id)
 * - 3ª query: emails dos titulares (se houver user_id)
 * - cria signedUrl a partir de comprovativo_url (bucket 'pagamentos')
 */
export async function listPagamentosAdmin(): Promise<AdminPagamento[]> {
  // 1) Pagamentos (pega em tudo para não falhar por colunas opcionais)
  const { data, error } = await supabase
    .from("pagamentos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }
  const rows = Array.isArray(data) ? data : [];

  // Coleta ids
  const atletaIds: string[] = [];
  const titularIds: string[] = [];

  for (const r of rows as any[]) {
    if (r?.atleta_id && !atletaIds.includes(r.atleta_id)) atletaIds.push(r.atleta_id);
    if ("user_id" in r && r.user_id && !titularIds.includes(r.user_id)) titularIds.push(r.user_id);
  }

  // 2) Atletas -> mapa id->nome
  const atletasById = new Map<string, { nome: string }>();
  if (atletaIds.length > 0) {
    const { data: at, error: aerr } = await supabase
      .from("atletas")
      .select("id,nome")
      .in("id", atletaIds);
    if (aerr) throw aerr;
    for (const a of at || []) {
      atletasById.set((a as any).id, { nome: asStr((a as any).nome) || "" });
    }
  }

  // 3) dados_pessoais -> mapa user_id->email
  const emailByUser = new Map<string, string>();
  if (titularIds.length > 0) {
    const { data: dp, error: derr } = await supabase
      .from("dados_pessoais")
      .select("user_id,email")
      .in("user_id", titularIds);
    if (derr) throw derr;
    for (const d of dp || []) {
      const uid = asStr((d as any).user_id);
      if (uid) emailByUser.set(uid, asStr((d as any).email) || "");
    }
  }

  // 4) signed URLs para comprovativos
  const out: AdminPagamento[] = [];
  for (const r of rows as any[]) {
    const id = asStr(r.id)!;
    const atletaId = asStr(r.atleta_id);
    const titularUserId = "user_id" in r ? asStr(r.user_id) : null;

    // cria signed URL se houver caminho
    let signedUrl: string | null = null;
    const path = asStr(r.comprovativo_url);
    if (path) {
      const { data: signed, error: signErr } = await supabase
        .storage
        .from("pagamentos")
        .createSignedUrl(path, 60 * 60); // 1h

      if (!signErr) signedUrl = signed?.signedUrl || null;
    }

    out.push({
      id,
      descricao: asStr(r.descricao),
      createdAt: asStr(r.created_at),
      comprovativoUrl: path,
      signedUrl,
      atletaId,
      atletaNome: atletaId ? (atletasById.get(atletaId)?.nome || null) : null,
      titularUserId,
      titularEmail: titularUserId ? (emailByUser.get(titularUserId) || null) : null,
      validado: asBool((r as any).validado ?? null),
    });
  }

  return out;
}

/**
 * Marca um pagamento como (in)validado.
 * Requer policy UPDATE para admins (ver SQL no comentário).
 * Se a coluna "validado" não existir, devolve erro claro.
 */
export async function marcarPagamentoValidado(pagamentoId: string, valid: boolean): Promise<void> {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado: valid } as any)
    .eq("id", pagamentoId);

  if (error) {
    // Se a tabela ainda não tem esta coluna, explica o que falta
    const msg = (error as any)?.message || "";
    if (msg.includes('column "validado"') || (error as any)?.code === "42703") {
      throw new Error(
        "A coluna 'validado' não existe em public.pagamentos. Adiciona-a com:\n" +
        "  alter table public.pagamentos add column if not exists validado boolean default false;"
      );
    }
    throw error;
  }
}

/* Opcional: helpers para recomputar estado de tesouraria por titular/atleta
   (deixa comentado; ativa quando quiseres essa lógica no admin)

export async function recomputeTesourariaSocio(titularUserId: string): Promise<void> {
  // Implementa a tua regra de negócio (contagem de comprovativos validados, etc.)
}

export async function recomputeTesourariaAtleta(atletaId: string): Promise<void> {
  // Implementa a tua regra de negócio
}
*/
