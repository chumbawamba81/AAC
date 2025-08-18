// src/services/atletasService.ts
import { supabase } from "../supabaseClient";
import type { Atleta } from "../types/Atleta";

/**
 * Tabela public.atletas (snake_case):
 * id (uuid), user_id (uuid), nome_completo (text), genero (text),
 * data_nascimento (date/text YYYY-MM-DD), escalao (text),
 * plano_pagamento (text: 'Mensal' | 'Trimestral' | 'Anual'),
 * morada (text), codigo_postal (text), telefone (text), email (text),
 * created_at (timestamptz)
 *
 * RLS (exemplo):
 * alter table public.atletas enable row level security;
 * create policy "atletas_select" on public.atletas for select using (auth.uid() = user_id);
 * create policy "atletas_ins"    on public.atletas for insert with check (auth.uid() = user_id);
 * create policy "atletas_upd"    on public.atletas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
 * create policy "atletas_del"    on public.atletas for delete using (auth.uid() = user_id);
 */

type DbRow = {
  id: string;
  user_id: string | null;
  nome_completo: string;
  genero: string | null;
  data_nascimento: string; // YYYY-MM-DD
  escalao: string | null;
  plano_pagamento: string | null;
  morada?: string | null;
  codigo_postal?: string | null;
  telefone?: string | null;
  email?: string | null;
  created_at?: string | null;
};

const TABLE = "atletas";

/** DB -> App */
function dbToAtleta(r: DbRow): Atleta {
  const a: any = {
    id: r.id,
    nomeCompleto: r.nome_completo ?? "",
    genero: r.genero ?? "",
    dataNascimento: r.data_nascimento ?? "",
    escalao: r.escalao ?? "",
    planoPagamento: (r.plano_pagamento as Atleta["planoPagamento"]) ?? "Anual",
  };
  a.morada = r.morada ?? a.morada;
  a.codigoPostal = r.codigo_postal ?? a.codigoPostal;
  a.telefone = r.telefone ?? a.telefone;
  a.email = r.email ?? a.email;
  return a as Atleta;
}

/** App -> DB (sempre com user_id = auth.uid()) */
function atletaToDb(a: Atleta, userId: string): Partial<DbRow> & { user_id: string } {
  const out: any = {
    user_id: userId,
    nome_completo: (a as any).nomeCompleto ?? "",
    genero: (a as any).genero ?? null,
    data_nascimento: (a as any).dataNascimento ?? "",
    escalao: (a as any).escalao ?? null,
    plano_pagamento: (a as any).planoPagamento ?? "Anual",
  };
  if ((a as any).morada !== undefined) out.morada = (a as any).morada;
  if ((a as any).codigoPostal !== undefined) out.codigo_postal = (a as any).codigoPostal;
  if ((a as any).telefone !== undefined) out.telefone = (a as any).telefone;
  if ((a as any).email !== undefined) out.email = (a as any).email;
  return out as Partial<DbRow> & { user_id: string };
}

/** Lista atletas do utilizador autenticado */
export async function listAtletas(): Promise<Atleta[]> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[atletasService] listAtletas:", error.message);
    throw error;
  }
  const rows = (data as DbRow[]) ?? [];
  return rows.map(dbToAtleta);
}

/** Cria/atualiza um atleta do utilizador autenticado */
export async function upsertAtleta(a: Atleta): Promise<Atleta> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Sessão não encontrada.");

  const row = atletaToDb(a, user.id);
  const hasId = !!(a as any).id;

  if (hasId) {
    const { data, error } = await supabase
      .from(TABLE)
      .update(row)
      .eq("id", (a as any).id)
      .select("*")
      .single();

    if (error) {
      console.error("[atletasService] update:", error.message);
      throw error;
    }
    return dbToAtleta(data as DbRow);
  } else {
    const { data, error } = await supabase
      .from(TABLE)
      .insert(row)
      .select("*")
      .single();

    if (error) {
      console.error("[atletasService] insert:", error.message);
      throw error;
    }
    return dbToAtleta(data as DbRow);
  }
}

/** Remove um atleta do utilizador autenticado */
export async function deleteAtleta(id: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) throw new Error("Sessão não encontrada.");

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("[atletasService] delete:", error.message);
    throw error;
  }
}
