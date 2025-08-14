// Type definitions for personal profile data (PessoaDados)

export type TipoSocio =
  | "Sócio Pro"
  | "Sócio Família"
  | "Sócio Geral Renovação"
  | "Sócio Geral Novo"
  | "Não pretendo ser sócio";

export type TipoDocumento =
  | "Cartão de cidadão"
  | "Passaporte"
  | "Título de Residência";

/**
 * PessoaDados descreve os campos de um perfil pessoal.
 * Todos os campos são strings simples exceto aqueles marcados
 * como opcionais (profissao).
 */
export interface PessoaDados {
  nomeCompleto: string;
  tipoSocio: TipoSocio;
  dataNascimento: string;
  morada: string;
  codigoPostal: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  nif: string;
  telefone: string;
  email: string;
  /**
   * Profissão é opcional. Pode ser uma string vazia quando o
   * utilizador não pretende indicar uma profissão.
   */
  profissao?: string;
}