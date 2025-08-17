export interface PessoaDados {
  // Campos existentes na tabela `dados_pessoais`
  nomeCompleto: string;
  dataNascimento: string;  // ISO yyyy-mm-dd
  genero?: 'Masculino' | 'Feminino' | 'Outro';
  morada?: string;
  codigoPostal?: string;   // ####-###
  telefone?: string;
  email: string;
  situacaoTesouraria?: string;
  noticias?: string;

  // Campos extra usados na UI (não persistidos enquanto não existirem no schema)
  tipoSocio?: 'Sócio Pro' | 'Sócio Família' | 'Sócio Geral Renovação' | 'Sócio Geral Novo' | 'Não pretendo ser sócio';
  tipoDocumento?: 'Cartão de cidadão' | 'Passaporte' | 'Título de Residência';
  numeroDocumento?: string;
  nif?: string;
  profissao?: string;
}