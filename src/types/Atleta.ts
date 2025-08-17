export type Genero = 'Feminino' | 'Masculino';
export type Nacionalidade = 'Portuguesa' | 'Outra';
export type TipoDocId = 'Cartão de cidadão' | 'Passaporte' | 'Título de Residência';
export type PlanoPagamento = 'Mensal' | 'Trimestral' | 'Anual';

export interface Atleta {
  id: string;
  nomeCompleto: string;
  dataNascimento: string; // ISO yyyy-mm-dd
  genero: Genero;
  escalao: string;
  planoPagamento: PlanoPagamento;

  // Campos opcionais (compatibilidade com formulário completo)
  nacionalidade?: Nacionalidade;
  nacionalidadeOutra?: string;
  tipoDoc?: TipoDocId;
  numDoc?: string;
  validadeDoc?: string; // ISO yyyy-mm-dd
  nif?: string;
  nomePai?: string;
  nomeMae?: string;

  morada?: string;
  codigoPostal?: string;

  telefoneOpc?: string;
  emailOpc?: string;

  escola?: string;
  anoEscolaridade?: string;
  alergias?: string;

  encarregadoEducacao?: 'Pai' | 'Mãe' | 'Outro';
  parentescoOutro?: string;

  contactosUrgencia?: string;
  emailsPreferenciais?: string;

  // Alternativos usados na integração mais simples
  contactoUrgencia?: string;
  emailPreferencial?: string;
}