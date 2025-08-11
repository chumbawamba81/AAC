import React, { useState } from 'react';
import { PessoaDados } from './types/PessoaDados';

function App() {
  const [formData, setFormData] = useState<PessoaDados>({
    nomeCompleto: '',
    tipoSocio: 'Não pretendo ser sócio',
    dataNascimento: '',
    morada: '',
    codigoPostal: '',
    tipoDocumento: 'Cartão de cidadão',
    numeroDocumento: '',
    nif: '',
    telefone: '',
    email: '',
    profissao: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(import.meta.env.VITE_API_URL + '/registar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      if (!response.ok) {
        throw new Error('Erro ao submeter os dados');
      }
      alert('Registo efetuado com sucesso!');
    } catch (error) {
      console.error(error);
      alert('Ocorreu um erro ao registar');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: 'auto' }}>
      <h1>Registo de Sócio / Atleta</h1>
      <form onSubmit={handleSubmit}>
        <label>Nome Completo:</label>
        <input type="text" name="nomeCompleto" value={formData.nomeCompleto} onChange={handleChange} required />

        <label>Tipo de Sócio:</label>
        <select name="tipoSocio" value={formData.tipoSocio} onChange={handleChange}>
          <option value="Sócio Pro">Sócio Pro</option>
          <option value="Sócio Família">Sócio Família</option>
          <option value="Sócio Geral Renovação">Sócio Geral Renovação</option>
          <option value="Sócio Geral Novo">Sócio Geral Novo</option>
          <option value="Não pretendo ser sócio">Não pretendo ser sócio</option>
        </select>

        <label>Data de Nascimento:</label>
        <input type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange} required />

        <label>Morada:</label>
        <input type="text" name="morada" value={formData.morada} onChange={handleChange} required />

        <label>Código Postal:</label>
        <input type="text" name="codigoPostal" value={formData.codigoPostal} onChange={handleChange} required />

        <label>Tipo de Documento:</label>
        <select name="tipoDocumento" value={formData.tipoDocumento} onChange={handleChange}>
          <option value="Cartão de cidadão">Cartão de cidadão</option>
          <option value="Passaporte">Passaporte</option>
          <option value="Título de Residência">Título de Residência</option>
        </select>

        <label>Número de Documento:</label>
        <input type="text" name="numeroDocumento" value={formData.numeroDocumento} onChange={handleChange} required />

        <label>NIF:</label>
        <input type="text" name="nif" value={formData.nif} onChange={handleChange} required />

        <label>Telefone:</label>
        <input type="text" name="telefone" value={formData.telefone} onChange={handleChange} required />

        <label>Email:</label>
        <input type="email" name="email" value={formData.email} onChange={handleChange} required />

        <label>Profissão (Opcional):</label>
        <input type="text" name="profissao" value={formData.profissao} onChange={handleChange} />

        <button type="submit" style={{ marginTop: '20px' }}>Registar</button>
      </form>
    </div>
  );
}

export default App;
