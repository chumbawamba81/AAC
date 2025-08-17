import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "../supabaseClient";
import {
  uploadDoc,
  replaceDoc,
  deleteDoc,
  listDocs,
} from "../services/documentosService";

type DocumentoRow = {
  id: string;
  user_id: string;
  doc_nivel: string;
  atleta_id?: string | null;
  doc_tipo: string;
  page: number;
  file_path: string;
  nome: string;
  mime_type?: string | null;
  file_size?: number | null;
  uploaded_at?: string | null;
  url?: string; // signed URL opcional
};

type DocSocio = "BI" | "NIF" | "Foto";
type DocAtleta = "Ficha" | "Seguro" | "Exame";

interface Props {
  userId: string | null;
  atletas: { id: string; nome: string }[];
}

export default function UploadDocsSection({ userId, atletas }: Props) {
  const [loading, setLoading] = useState(false);
  const [socioDocs, setSocioDocs] = useState<DocumentoRow[]>([]);
  const [atletaDocs, setAtletaDocs] = useState<
    Record<string, DocumentoRow[]>
  >({});
  const [diagMsg, setDiagMsg] = useState<string>("");

  async function refreshAll() {
    if (!userId) return;
    const all = await listDocs(userId);
    if (!all) return;
    setSocioDocs(all.filter((d) => d.doc_nivel === "socio"));
    const ad: Record<string, DocumentoRow[]> = {};
    all.filter((d) => d.doc_nivel === "atleta").forEach((d) => {
      if (!d.atleta_id) return;
      if (!ad[d.atleta_id]) ad[d.atleta_id] = [];
      ad[d.atleta_id].push(d);
    });
    setAtletaDocs(ad);
  }

  useEffect(() => {
    refreshAll();
  }, [userId]);

  // ======== Sócio ========
  async function handleUploadSocio(tipo: DocSocio, file: File, mode: "new" | "replace" = "new") {
    if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
    setLoading(true);
    try {
      await uploadDoc({ nivel: "socio", userId, tipo, file, mode });
      await refreshAll();
      alert("Documento do sócio carregado com sucesso.");
    } catch (e: any) {
      console.error("[upload socio]", e);
      alert(`Falha no upload (sócio): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReplaceSocio(row: DocumentoRow, file: File) {
    if (!file) return;
    setLoading(true);
    try {
      await replaceDoc(row.id, file);
      await refreshAll();
      alert("Documento substituído.");
    } catch (e: any) {
      console.error("[replace socio]", e);
      alert(`Falha a substituir: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSocio(row: DocumentoRow) {
    if (!confirm("Apagar este ficheiro?")) return;
    setLoading(true);
    try {
      await deleteDoc(row.id);
      await refreshAll();
      alert("Apagado.");
    } catch (e: any) {
      console.error("[delete socio]", e);
      alert(`Falha a apagar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  // ======== Atleta ========
  async function handleUploadAtleta(atletaId: string, tipo: DocAtleta, file: File, mode: "new" | "replace" = "new") {
    if (!userId || !file) { alert("Sessão ou ficheiro em falta"); return; }
    setLoading(true);
    try {
      await uploadDoc({ nivel: "atleta", userId, atletaId, tipo, file, mode });
      await refreshAll();
      alert("Documento do atleta carregado com sucesso.");
    } catch (e: any) {
      console.error("[upload atleta]", e);
      alert(`Falha no upload (atleta): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleReplaceAtleta(row: DocumentoRow, file: File) {
    if (!file) return;
    setLoading(true);
    try {
      await replaceDoc(row.id, file);
      await refreshAll();
      alert("Documento substituído.");
    } catch (e: any) {
      console.error("[replace atleta]", e);
      alert(`Falha a substituir: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAtleta(row: DocumentoRow) {
    if (!confirm("Apagar este ficheiro?")) return;
    setLoading(true);
    try {
      await deleteDoc(row.id);
      await refreshAll();
      alert("Apagado.");
    } catch (e: any) {
      console.error("[delete atleta]", e);
      alert(`Falha a apagar: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  // ======== Diagnóstico ========
  async function testStorage() {
    try {
      setDiagMsg("A testar Storage…");
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Sem sessão");
      const blob = new Blob(["hello"], { type: "text/plain" });
      const file = new File([blob], "teste.txt", { type: "text/plain" });
      const path = `${u.user.id}/socio/Teste/${Date.now()}_teste.txt`;
      const up = await supabase.storage.from("documentos").upload(path, file, { upsert: false });
      if (up.error) throw up.error;
      setDiagMsg("Storage OK.");
      alert("Storage OK ✅");
    } catch (e: any) {
      console.error("[diag storage]", e);
      setDiagMsg(`Storage FAIL: ${e?.message || e}`);
      alert(`Storage FAIL ❌: ${e?.message || e}`);
    }
  }

  async function testTable() {
    try {
      setDiagMsg("A testar tabela…");
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) throw new Error("Sem sessão");
      const row = {
        user_id: u.user.id,
        doc_nivel: "socio",
        atleta_id: null,
        doc_tipo: "Teste",
        page: 1,
        file_path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        path: `${u.user.id}/socio/Teste/${Date.now()}_dummy.txt`,
        nome: "dummy.txt",
        mime_type: "text/plain",
        file_size: 5,
        uploaded_at: new Date().toISOString(),
      };
      const ins = await supabase.from("documentos").insert(row).select("id").single();
      if (ins.error) throw ins.error;
      setDiagMsg("Tabela OK.");
      alert("Tabela OK ✅");
    } catch (e: any) {
      console.error("[diag table]", e);
      setDiagMsg(`Tabela FAIL: ${e?.message || e}`);
      alert(`Tabela FAIL ❌: ${e?.message || e}`);
    }
  }

  // ======== Render ========
  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-3 bg-slate-50">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Diagnóstico rápido</div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={testStorage}>Testar Storage</Button>
            <Button variant="outline" onClick={testTable}>Testar Tabela</Button>
          </div>
        </div>
        {!!diagMsg && <div className="text-xs text-gray-600 mt-2">{diagMsg}</div>}
      </div>

      <div>
        <h3 className="text-lg font-semibold">Documentos do Sócio</h3>
        <input type="file" onChange={(e) => e.target.files && handleUploadSocio("BI", e.target.files[0])} />
        <ul>
          {socioDocs.map((doc) => (
            <li key={doc.id} className="flex justify-between">
              <a href={doc.url} target="_blank" rel="noreferrer">{doc.nome}</a>
              <div className="flex gap-2">
                <input type="file" onChange={(e) => e.target.files && handleReplaceSocio(doc, e.target.files[0])} />
                <Button variant="destructive" onClick={() => handleDeleteSocio(doc)}>Apagar</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-lg font-semibold">Documentos dos Atletas</h3>
        {atletas.map((a) => (
          <div key={a.id}>
            <h4 className="font-medium">{a.nome}</h4>
            <input type="file" onChange={(e) => e.target.files && handleUploadAtleta(a.id, "Ficha", e.target.files[0])} />
            <ul>
              {(atletaDocs[a.id] || []).map((doc) => (
                <li key={doc.id} className="flex justify-between">
                  <a href={doc.url} target="_blank" rel="noreferrer">{doc.nome}</a>
                  <div className="flex gap-2">
                    <input type="file" onChange={(e) => e.target.files && handleReplaceAtleta(doc, e.target.files[0])} />
                    <Button variant="destructive" onClick={() => handleDeleteAtleta(doc)}>Apagar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
