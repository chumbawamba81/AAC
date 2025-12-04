// src/types/Atleta.ts
export type Genero = 'Feminino' | 'Masculino';
export type TipoDocId = 'Cartão de cidadão' | 'Passaporte' | 'Título de Residência';
export type Nacionalidade = 'Portuguesa' | 'Outra';
export type Escalao =
  | 'Baby Basket (2020-2021)'
  | 'Mini 8 (2018-2019)'
  | 'Mini 10 (2016-2017)'
  | 'Mini 12 (2014-2015)'
  | 'Sub 14 feminino (2012-2013)'
  | 'Sub 14 masculino (2012-2013)'
  | 'Sub 16 feminino (2010-2011)'
  | 'Sub 16 masculino (2010-2011)'
  | 'Sub 18 femininos (2008-2009)'
  | 'Sub 18 masculinos (2008-2009)'
  | 'Seniores femininas (≤2007)'
  | 'Seniores masculinos Sub23 (2002-2007)'
  | 'Masters (<1995)'
  | 'Fora de escalões';

export type PlanoPagamento = 'Mensal' | 'Trimestral' | 'Anual';

export interface Atleta {
  id: string;
  nomeCompleto: string;
  dataNascimento: string; // ISO YYYY-MM-DD
  genero: Genero;

  nacionalidade: Nacionalidade;
  nacionalidadeOutra?: string;

  tipoDoc: TipoDocId;
  numDoc: string;
  validadeDoc: string; // ISO YYYY-MM-DD
  nif: string;

  nomePai: string;
  nomeMae: string;

  morada: string;
  codigoPostal: string;

  telefoneOpc?: string;
  emailOpc?: string;

  escola: string;
  anoEscolaridade: string;

  alergias: string;

  encarregadoEducacao?: 'Pai' | 'Mãe' | 'Outro';
  parentescoOutro?: string;

  contactosUrgencia: string;   // "912...; 913..."
  emailsPreferenciais: string; // "a@x.pt; b@y.pt"

  escalao: Escalao;
  planoPagamento: PlanoPagamento;

  // NOVO
  observacoes?: string;
  epoca?: number;
  social?: boolean;
  desistiu?: boolean;
}
