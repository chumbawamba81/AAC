// Admin · src/services/tesourariaService.ts
import { supabase } from "../supabaseClient";

/** Marca um pagamento como validado/invalidado. */
export async function marcarPagamentoValidado(
  pagamentoId: string,
  validado: boolean
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const adminId = auth?.user?.id ?? null;

  const payload: any = { validado };
  if (validado) {
    payload.validado_em = new Date().toISOString();
    payload.validado_por = adminId;
  } else {
    payload.validado_em = null;
    payload.validado_por = null;
  }

  const { error } = await supabase
    .from("pagamentos")
    .update(payload)
    .eq("id", pagamentoId);

  if (error) throw error;
}

/** Atualiza a situação de tesouraria do titular (registo em dados_pessoais). */
export async function atualizarSituacaoTesouraria(
  titularUserId: string,
  situacao: "Regularizado" | "Pendente"
): Promise<void> {
  const { error } = await supabase
    .from("dados_pessoais")
    .update({ situacao_tesouraria: situacao })
    .eq("user_id", titularUserId);

  if (error) throw error;
}

/** Resolve o user_id (titular) de um pagamento via atleta -> user_id. */
export async function obterTitularUserIdPorPagamento(
  pagamentoId: string
): Promise<string> {
  const { data: pago, error: e1 } = await supabase
    .from("pagamentos")
    .select("atleta_id")
    .eq("id", pagamentoId)
    .single();

  if (e1) throw e1;
  const atletaId = (pago as any)?.atleta_id;
  if (!atletaId) throw new Error("Pagamento sem atleta associado.");

  const { data: atl, error: e2 } = await supabase
    .from("atletas")
    .select("user_id")
    .eq("id", atletaId)
    .maybeSingle();

  if (e2) throw e2;
  const userId = (atl as any)?.user_id;
  if (!userId) throw new Error("Não foi possível determinar o titular do pagamento.");
  return userId as string;
}

/**
 * Orquestração: valida/ invalida e sincroniza a situação de tesouraria do titular.
 * Uso típico no botão "Validar/Invalidar".
 */
export async function validarPagamentoESincronizar(
  pagamentoId: string,
  validado: boolean
): Promise<void> {
  await marcarPagamentoValidado(pagamentoId, validado);
  const titular = await obterTitularUserIdPorPagamento(pagamentoId);
  await atualizarSituacaoTesouraria(titular, validado ? "Regularizado" : "Pendente");
}
