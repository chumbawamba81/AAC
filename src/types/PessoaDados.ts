export interface PessoaDados {
  nomeCompleto: string;
  tipoSocio: 'Sócio Pro' | 'Sócio Família' | 'Sócio Geral Renovação' | 'Sócio Geral Novo' | 'Não pretendo ser sócio';
  dataNascimento: string; // YYYY-MM-DD
  morada: string;
  codigoPostal: string;
  tipoDocumento: 'Cartão de cidadão' | 'Passaporte' | 'Título de Residência';
  numeroDocumento: string;
  nif: string;
  telefone: string;
  email: string;
  profissao?: string;
}
