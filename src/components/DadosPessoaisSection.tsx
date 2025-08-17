import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export interface DadosPessoais {
  id?: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero: string;
  morada?: string;
  codigoPostal?: string;
  telefone?: string;
  email: string;
  situacaoTesouraria?: string;
  noticias?: string;
}

interface Props {
  state: any;
  setState: (s: any) => void;
  onAfterSave: (novo: DadosPessoais) => Promise<void>;
}

export default function DadosPessoaisSection({ state, setState, onAfterSave }: Props) {
  const [form, setForm] = useState<DadosPessoais>(
    state.perfil ?? {
      nomeCompleto: "",
      dataNascimento: "",
      genero: "",
      morada: "",
      codigoPostal: "",
      telefone: "",
      email: "",
      situacaoTesouraria: "Campo em atualização",
      noticias: "",
    }
  );

  const handleChange = (field: keyof DadosPessoais, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAfterSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border rounded">
      <h2 className="text-lg font-bold mb-4">Dados Pessoais</h2>

      <div className="mb-2">
        <label>Nome Completo</label>
        <input
          type="text"
          value={form.nomeCompleto}
          onChange={(e) => handleChange("nomeCompleto", e.target.value)}
          required
        />
      </div>

      <div className="mb-2">
        <label>Data de Nascimento</label>
        <input
          type="date"
          value={form.dataNascimento}
          onChange={(e) => handleChange("dataNascimento", e.target.value)}
          required
        />
      </div>

      <div className="mb-2">
        <label>Género</label>
        <select
          value={form.genero}
          onChange={(e) => handleChange("genero", e.target.value)}
          required
        >
          <option value="">Selecione...</option>
          <option value="Masculino">Masculino</option>
          <option value="Feminino">Feminino</option>
          <option value="Outro">Outro</option>
        </select>
      </div>

      <div className="mb-2">
        <label>Morada</label>
        <input
          type="text"
          value={form.morada}
          onChange={(e) => handleChange("morada", e.target.value)}
        />
      </div>

      <div className="mb-2">
        <label>Código Postal</label>
        <input
          type="text"
          value={form.codigoPostal}
          onChange={(e) => handleChange("codigoPostal", e.target.value)}
          placeholder="0000-000"
        />
      </div>

      <div className="mb-2">
        <label>Telefone</label>
        <input
          type="text"
          value={form.telefone}
          onChange={(e) => handleChange("telefone", e.target.value)}
        />
      </div>

      <div className="mb-2">
        <label>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          required
        />
      </div>

      <div className="mb-2">
        <label>Situação Tesouraria</label>
        <input
          type="text"
          value={form.situacaoTesouraria}
          onChange={(e) => handleChange("situacaoTesouraria", e.target.value)}
        />
      </div>

      <div className="mb-2">
        <label>Notícias</label>
        <textarea
          value={form.noticias}
          onChange={(e) => handleChange("noticias", e.target.value)}
        />
      </div>

      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
        Guardar
      </button>
    </form>
  );
}
