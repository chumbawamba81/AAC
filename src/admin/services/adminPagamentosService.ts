// src/admin/services/adminPagamentosService.ts
import { supabase } from "../../supabaseClient";

/** Nível do pagamento: inscrição/quotas de sócio vs atleta (mensalidades/inscrição atleta) */
export type NivelPagamento = "socio" | "atleta";

/** Estado básico (derivado de `validado`) */
export type StatusPagamento = "pendente" | "validado";

/** Linha que a tabela de Tesouraria apresenta */
export interface AdminPagamento {
  id: string;
  nivel: NivelPagamento;
  descricao: string;          // ex.: "Pagamento - 1º Mês" ou "Inscrição de Sócio"
  createdAt: string | null;   // ISO ou null
  status: StatusPagamento;    // 'pendente' | 'validado' (← DERIVADO)
  validado: boolean;          // valor real na BD

  titularUserId: string;      // user_id do titular/EE
  titularName: string;        // nome em dados_pessoais (ou "—" se faltar)

  atletaId: string | null;    // null quando nivel='socio'
  atletaNome: string | null;  // null quando nivel='socio'

  filePath: string | null;    // caminho no bucket de comprovativos (se existir)
  signedUrl: string | null;   // URL temporária para abrir o ficheiro (se existir)
}

/** Helper: obter Signed URL (ignora erros e devolve null) */
async function getSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await supabase
      .storage
      .from("pagamentos") // ajusta se o bucket tiver outro nome
      .createSignedUrl(path, 60 * 60);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

type Filtro = "todos" | "inscricao" | "mensalidades";

/**
 * Lista pagamentos para a Tesouraria (admin), já enriquecidos com:
 * - nome do titular/EE
 * - nome do atleta (se aplicável)
 * - signed URL do comprovativo (se existir)
 *
 * NOTA: NÃO seleciona 'status' da BD (essa coluna não existe). 'status' é derivado de 'validado'.
 */
export async function listPagamentosAdmin(filtro: Filtro = "todos"): Promise<AdminPagamento[]> {
  // 1) Ler pagamentos crus (sem 'status')
  const { data: pays, error } = await supabase
    .from("pagamentos")
    .select("id, created_at, validado, nivel, descricao, user_id, atleta_id, file_path")
    .order("created_at", { ascending: false });

  if (error) throw error;

  // 2) Filtrar por 'inscricao' vs 'mensalidades'
  const filtered = (pays ?? []).filter((r: any) => {
    if (filtro === "todos") return true;
    const isInscricao = (r.descricao || "").toLowerCase().includes("inscri");
    return filtro === "inscricao" ? isInscricao : !isInscricao;
  });

  // 3) Recolher user_ids e atleta_ids
  const userIds = Array.from(new Set(filtered.map((r: any) => r.user_id).filter(Boolean)));
  const atletaIds = Array.from(new Set(filtered.map((r: any) => r.atleta_id).filter(Boolean)));

  // 4) Ler nomes de titulares (dados_pessoais)
  const titularByUser: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: titulares, error: tErr } = await supabase
      .from("dados_pessoais")
      .select("user_id, nome_completo")
      .in("user_id", userIds);
    if (!tErr && titulares) {
      for (const r of titulares) {
        titularByUser[r.user_id] = r.nome_completo ?? "—";
      }
    }
  }

  // 5) Ler nomes de atletas (coluna 'nome' conforme o teu código antigo)
  const atletaById: Record<string, string> = {};
  if (atletaIds.length > 0) {
    const { data: atletas, error: aErr } = await supabase
      .from("atletas")
      .select("id, nome");
    if (!aErr && atletas) {
      for (const r of atletas) {
        atletaById[r.id] = r.nome ?? "—";
      }
    }
  }

  // 6) Montar resultado e assinar URLs (em paralelo)
  const out: AdminPagamento[] = await Promise.all(
    filtered.map(async (r: any): Promise<AdminPagamento> => {
      const validado = !!r.validado;
      const status: StatusPagamento = validado ? "validado" : "pendente"; // ← derivado aqui

      return {
        id: r.id,
        nivel: (r.nivel as NivelPagamento) ?? (r.atleta_id ? "atleta" : "socio"),
        descricao: r.descricao ?? "",
        createdAt: r.created_at ?? null,
        status,
        validado,
        titularUserId: r.user_id,
        titularName: titularByUser[r.user_id] ?? "—",
        atletaId: r.atleta_id ?? null,
        atletaNome: r.atleta_id ? (atletaById[r.atleta_id] ?? "—") : null,
        filePath: r.file_path ?? null,
        signedUrl: await getSignedUrl(r.file_path ?? null),
      };
    })
  );

  return out;
}

/**
 * Alterna validação (true/false) e devolve a linha atualizada.
 *
 * NOTA: NÃO escreve 'status' na tabela (não existe). Apenas atualiza 'validado'.
 * O 'status' será derivado no retorno.
 */
export async function marcarPagamentoValidado(pagamentoId: string, next: boolean): Promise<AdminPagamento | null> {
  const { data, error } = await supabase
    .from("pagamentos")
    .update({ validado: next }) // ← não tenta escrever 'status'
    .eq("id", pagamentoId)
    .select("id, created_at, validado, nivel, descricao, user_id, atleta_id, file_path")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const validado = !!data.validado;
  const status: StatusPagamento = validado ? "validado" : "pendente";

  // Enriquecer minimamente (nomes virão completos após refresh da lista)
  return {
    id: data.id,
    nivel: (data.nivel as NivelPagamento) ?? (data.atleta_id ? "atleta" : "socio"),
    descricao: data.descricao ?? "",
    createdAt: data.created_at ?? null,
    status,
    validado,
    titularUserId: data.user_id,
    titularName: "—", // será re-hidratado quando fizeres refresh via listPagamentosAdmin()
    atletaId: data.atleta_id ?? null,
    atletaNome: data.atleta_id ? "—" : null,
    filePath: data.file_path ?? null,
    signedUrl: await getSignedUrl(data.file_path ?? null),
  };
}
