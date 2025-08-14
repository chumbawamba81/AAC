// Type definitions for athlete records.

// PlanoPagamento descreve o tipo de pagamento que um atleta pode
// selecionar para a sua inscrição: mensal, trimestral ou anual.
export type PlanoPagamento = 'Mensal' | 'Trimestral' | 'Anual';

/**
 * Interface que representa um atleta inscrito na secção. Nem todos os
 * campos são obrigatórios à partida; a aplicação preencherá os
 * valores opcionais quando apropriado (p.ex. morada, escola). O
 * superset destes campos permite mapear registos simples da base de
 * dados para o modelo utilizado no frontend.
 */
export interface Atleta {
  id: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: 'Feminino' | 'Masculino';
  /**
   * Escalão calculado automaticamente a partir da data de nascimento e
   * género. Este campo é armazenado como string para facilitar a
   * apresentação. Pode ser "Fora de escalões" para casos sem
   * correspondência.
   */
  escalao: string;
  /**
   * Plano de pagamento selecionado pelo atleta. Este campo controla
   * quantos comprovativos de pagamento são necessários (mensal: 10,
   * trimestral: 3, anual: 1).
   */
  planoPagamento: PlanoPagamento;
  /**
   * Campos opcionais adicionais. Podem estar vazios quando não
   * preenchidos. Estes campos são utilizados no formulário mas não são
   * estritamente necessários para o registo mínimo de um atleta no
   * backend.
   */
  escola?: string;
  morada?: string;
  codigoPostal?: string;
  alergias?: string;
  emailPreferencial?: string;
  contactoUrgencia?: string;
}