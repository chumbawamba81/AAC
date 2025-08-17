import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export interface DadosPessoais {
  id?: string;
  user_id?: string;
  nomeCompleto: string;
  dataNascimento: string;
  genero?: string;
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
  onAfterSave: (novo: DadosPessoais) => void;
}

const isValidISODate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());

export default function DadosPessoaisSection({ state, setState, onAfterSave }: Props) {
  const [form, setForm] = useState<DadosPessoais>(
    state.dadosPessoais || {
      nomeCompleto: "",
      dataNascimento: "",
      email: "",
    }
  );

  const [saving, setSaving] = useState(false);

  const handleChange = (field: keyof DadosPessoais, value: string) => {
    setForm({ ...form, [field]: value });
  };

  const handleSave = async () => {
    const errs: string[] = [];

    if (!form.nomeCompleto) errs.push("Nome completo é obrigatório");
    if (!isValidISODate(form.dataNascimento))
      errs.push("Data de nascimento inválida");
    if (!form.email) errs.push("Email é obrigatório");

    if (errs.length > 0) {
      alert(errs.join("\n"));
      return;
    }

    setSaving(true);

    const { data, error } = await supabase.from("dados_pessoais").upsert([
      {
        id: form.id,
        user_id: form.user_id,
        nome_completo: form.nomeCompleto,
        data_nascimento: form.dataNascimento,
        genero: form.genero,
        morada: form.morada,
        codigo_postal: form.codigoPostal,
        telefone: form.telefone,
        email: form.email,
        situacao_tesouraria: form.situacaoTesouraria,
        noticias: form.noticias,
      },
    ])
    .select()
    .single();

    setSaving(false);

    if (error) {
      console.error("❌ Erro ao guardar dados pessoais:", error);
      alert("Erro ao guardar dados pessoais");
    } else {
      console.log("✅ Dados pessoais guardados:", data);
      setState({ ...state, dadosPessoais: data });
      onAfterSave(data);
    }
  };

  return (
    <div>
      <h2>Dados Pessoais</h2>

      <label>Nome Completo</label>
      <input
        type="text"
        value={form.nomeCompleto}
        onChange={(e) => handleChange("nomeCompleto", e.target.value)}
      />

      <label>Data de Nascimento</label>
      <input
        type="date"
        value={form.dataNascimento}
        onChange={(e) => handleChange("dataNascimento", e.target.value)}
      />

      <label>Email</label>
      <input
        type="email"
        value={form.email}
        onChange={(e) => handleChange("email", e.target.value)}
      />

      <label>Telefone</label>
      <input
        type="text"
        value={form.telefone || ""}
        onChange={(e) => handleChange("telefone", e.target.value)}
      />

      <button onClick={handleSave} disabled={saving}>
        {saving ? "A guardar..." : "Guardar"}
      </button>
    </div>
  );
}
