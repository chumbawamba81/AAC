export type Genero = 'Feminino' | 'Masculino' | 'Outro';
export type PlanoPagamento = 'Mensal' | 'Trimestral' | 'Anual';

export interface Atleta {
  id: string;
  nomeCompleto: string;       // map -> atletas.nome
  dataNascimento: string;     // ISO yyyy-mm-dd -> atletas.data_nascimento
  genero?: Genero;            // (opcional no schema)
  escalao?: string;           // map -> atletas.escalao (ver migração abaixo)
  alergias: string;           // not null
  planoPagamento: PlanoPagamento; // map -> atletas.opcao_pagamento

  // Extra (não obrigatórios no schema actual)
  morada?: string;
  codigoPostal?: string;
  contactosUrgencia?: string;
  emailsPreferenciais?: string;
}