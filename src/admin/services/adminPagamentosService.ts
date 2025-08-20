// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Pagamentos: nível do pagamento. Sem 'nivel' na tabela, inferimos:
 * - atleta_id != null -> 'atleta'
 * - atleta_id == null -> 'socio'
 */
export type NivelPagamento = "atleta" | "socio";

export type AdminPagamento = {
  id: string;
  nivel: NivelPagamento;
  titularUserId: string | null; // do titular (se for atleta, vem do join atletas.user_id)
  atletaId: string | null;      // null => pagamento do sócio
  atletaNome: string | null;    // nome do atleta se existir
  descricao: string;
  comprovativo_url: string | null; // storage path do bucket 'pagamentos' (não é URL pública)
  created_at: string | null;
  signedUrl?: string | null;    // URL temporária para abrir o ficheiro
  validado?: boolean | null;    // só será preenchido se tiveres a coluna na tabela
};

/** Cria signed URL (1 hora) para o bucket 'pagamentos' se houver path */
async function signedUrlForComprovativo(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase
    .storage
    .from("pagamentos")
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Lista TODOS os pagamentos (apenas para admin). Junta dados do atleta para sabermos o titular. */
export async function listAdminPagamentos(): Promise<AdminPagamento[]> {
  // pedimos tudo e juntamos o básico do atleta
  const { data, error } = await supabase
    .from("pagamentos")
    .select(`
      id,
      atleta_id,
      descricao,
      comprovativo_url,
      created_at,
      atletas:atleta_id (
        id,
        user_id,
        nome
      ),
      validado
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[adminPagamentosService] listAdminPagamentos:", error.message);
    throw error;
  }

  const rows = (data || []).map((r: any) => {
    const nivel: NivelPagamento = r.atleta_id ? "atleta" : "socio";
    return {
      id: r.id,
      nivel,
      atletaId: r.atleta_id ?? null,
      titularUserId: r.atletas?.user_id ?? null,     // para atleta puxamos do join
      atletaNome: r.atletas?.nome ?? null,
      descricao: r.descricao,
      comprovativo_url: r.comprovativo_url ?? null,
      created_at: r.created_at ?? null,
      validado: typeof r.validado === "boolean" ? r.validado : null,
    } as AdminPagamento;
  });

  // Assinar URLs (em paralelo)
  const signed = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      signedUrl: await signedUrlForComprovativo(row.comprovativo_url ?? null),
    }))
  );

  return signed;
}

/** (Opcional) marca um pagamento validado / não validado.
 * Só vai funcionar se adicionaste a coluna public.pagamentos.validado boolean default false.
 * Se não tiveres essa coluna, esta função vai lançar erro — nesse caso, remove do UI.
 */
export async function markPagamentoValidado(pagamentoId: string, validado: boolean) {
  const { error } = await supabase
    .from("pagamentos")
    .update({ validado })
    .eq("id", pagamentoId);
  if (error) {
    console.error("[adminPagamentosService] markPagamentoValidado:", error.message);
    throw error;
  }
}

/** Atualiza situação de tesouraria do SÓCIO/EE (titular) em dados_pessoais. */
export async function recomputeTesourariaSocio(
  titularUserId: string,
  statusAfter: "Regularizado" | "Pendente" | "Isento"
) {
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: statusAfter })
    .eq("user_id", titularUserId);
  if (error) {
    console.error("[adminPagamentosService] recomputeTesourariaSocio:", error.message);
    throw error;
  }
}

/** Para conveniência no UI: abre o comprovativo numa nova janela (se houver). */
export function openComprovativo(row: AdminPagamento) {
  if (!row.signedUrl) return;
  window.open(row.signedUrl, "_blank", "noopener,noreferrer");
}
