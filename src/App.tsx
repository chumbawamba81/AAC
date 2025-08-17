import React, { useState } from 'react';
import { saveDadosPessoais } from './services/dadosPessoaisService';
import { saveAtleta } from './services/atletasService';
import { savePagamento } from './services/pagamentosService';

const isValidISODate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

function App() {
  const [form, setForm] = useState<any>({});
  const [errors, setErrors] = useState<string[]>([]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmitDadosPessoais = async () => {
    const errs: string[] = [];
    if (!isValidISODate(form.data_nascimento)) errs.push("Data de nascimento inválida");

    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    try {
      await saveDadosPessoais(form);
      alert("Dados pessoais guardados!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
  };

  const handleSubmitAtleta = async () => {
    try {
      await saveAtleta(form);
      alert("Atleta guardado!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
  };

  const handleSubmitPagamento = async () => {
    try {
      await savePagamento(form);
      alert("Pagamento guardado!");
    } catch (e: any) {
      alert("Erro: " + e.message);
    }
  };

  return (
    <div>
      <h1>Gestão AAC</h1>
      <input name="nome_completo" placeholder="Nome completo" onChange={handleChange} />
      <input name="data_nascimento" placeholder="AAAA-MM-DD" onChange={handleChange} />
      <input name="genero" placeholder="Género" onChange={handleChange} />
      <input name="morada" placeholder="Morada" onChange={handleChange} />
      <input name="codigo_postal" placeholder="Código Postal" onChange={handleChange} />
      <input name="telefone" placeholder="Telefone" onChange={handleChange} />
      <input name="email" placeholder="Email" onChange={handleChange} />

      <button onClick={handleSubmitDadosPessoais}>Guardar Dados Pessoais</button>
      <button onClick={handleSubmitAtleta}>Guardar Atleta</button>
      <button onClick={handleSubmitPagamento}>Guardar Pagamento</button>

      {errors.length > 0 && (
        <ul>
          {errors.map((err, i) => <li key={i}>{err}</li>)}
        </ul>
      )}
    </div>
  );
}

export default App;
