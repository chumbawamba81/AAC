// src/components/UploadDocsSection.tsx
import React, { useState, useRef, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, File as FileIcon, Trash2 } from "lucide-react";

type DocumentoTipo = "socio" | "atleta";

interface Documento {
  id: string;
  tipo: DocumentoTipo;
  nome: string;
  ficheiros: DocumentoFicheiro[];
}

interface DocumentoFicheiro {
  id: string;
  documento_id: string;
  path: string;
  url: string;
  created_at: string;
}

export default function UploadDocsSection({
  pessoaId,
  atletaId,
}: {
  pessoaId?: string;
  atletaId?: string;
}) {
  const [docs, setDocs] = useState<Documento[]>([]);
  const [busy, setBusy] = useState(false);

  // Carregar documentos já existentes
  useEffect(() => {
    async function fetchDocs() {
      if (!pessoaId && !atletaId) return;
      const { data, error } = await supabase
        .from("documentos")
        .select("id, tipo, nome, ficheiros:documentos_ficheiros(*)")
        .or(
          `${pessoaId ? `pessoa_id.eq.${pessoaId}` : ""}${
            pessoaId && atletaId ? "," : ""
          }${atletaId ? `atleta_id.eq.${atletaId}` : ""}`
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        return;
      }
      setDocs(
        (data ?? []).map((d: any) => ({
          id: d.id,
          tipo: d.tipo,
          nome: d.nome,
          ficheiros: d.ficheiros.map((f: any) => ({
            id: f.id,
            documento_id: f.documento_id,
            path: f.path,
            url: supabase.storage.from("documentos").getPublicUrl(f.path).data
              .publicUrl,
            created_at: f.created_at,
          })),
        }))
      );
    }
    fetchDocs();
  }, [pessoaId, atletaId]);

  async function handleUpload(
    tipo: DocumentoTipo,
    files: FileList | File[]
  ): Promise<void> {
    if (!files.length) return;
    setBusy(true);
    try {
      // Cria ou encontra documento
      const { data: doc, error: docError } = await supabase
        .from("documentos")
        .upsert(
          {
            pessoa_id: pessoaId ?? null,
            atleta_id: atletaId ?? null,
            tipo,
            nome: tipo === "socio" ? "Documentos do Sócio" : "Documentos do Atleta",
          },
          { onConflict: "pessoa_id,atleta_id,tipo" }
        )
        .select()
        .single();
      if (docError || !doc) throw docError;

      for (const file of Array.from(files)) {
        const path = `${doc.id}/${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("documentos")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;

        await supabase.from("documentos_ficheiros").insert({
          documento_id: doc.id,
          path,
        });
      }

      // refresh
      const { data: d } = await supabase
        .from("documentos")
        .select("id, tipo, nome, ficheiros:documentos_ficheiros(*)")
        .eq("id", doc.id)
        .single();

      if (d) {
        setDocs((prev) => {
          const idx = prev.findIndex((x) => x.id === d.id);
          const mapped: Documento = {
            id: d.id,
            tipo: d.tipo,
            nome: d.nome,
            ficheiros: d.ficheiros.map((f: any) => ({
              id: f.id,
              documento_id: f.documento_id,
              path: f.path,
              url: supabase.storage.from("documentos").getPublicUrl(f.path).data
                .publicUrl,
              created_at: f.created_at,
            })),
          };
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = mapped;
            return copy;
          }
          return [mapped, ...prev];
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFile(f: DocumentoFicheiro) {
    setBusy(true);
    try {
      await supabase.from("documentos_ficheiros").delete().eq("id", f.id);
      await supabase.storage.from("documentos").remove([f.path]);
      setDocs((prev) =>
        prev.map((d) =>
          d.id === f.documento_id
            ? { ...d, ficheiros: d.ficheiros.filter((x) => x.id !== f.id) }
            : d
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">Documentos</h2>
      <div className="flex gap-4">
        <FileTrigger
          multiple
          disabled={busy}
          onPick={(files) => handleUpload("socio", files)}
          label="Carregar Documentos do Sócio"
          leftIcon={<Upload className="w-4 h-4 mr-2" />}
        />
        <FileTrigger
          multiple
          disabled={busy}
          onPick={(files) => handleUpload("atleta", files)}
          label="Carregar Documentos do Atleta"
          leftIcon={<Upload className="w-4 h-4 mr-2" />}
        />
      </div>
      <div className="grid gap-4">
        {docs.map((doc) => (
          <Card key={doc.id}>
            <CardContent>
              <h3 className="font-medium">{doc.nome}</h3>
              <ul className="mt-2 space-y-2">
                {doc.ficheiros.map((f) => (
                  <li key={f.id} className="flex items-center justify-between">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center text-blue-600 hover:underline"
                    >
                      <FileIcon className="w-4 h-4 mr-2" /> {f.path.split("/").pop()}
                    </a>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => handleDeleteFile(f)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/* --------------- BOTÕES DE UPLOAD --------------- */

function FileTrigger({
  multiple,
  disabled,
  onPick,
  label,
  leftIcon,
}: {
  multiple?: boolean;
  disabled?: boolean;
  onPick: (files: FileList) => void;
  label: string;
  leftIcon?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="sr-only"
        multiple={!!multiple}
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length) onPick(fs);
          e.currentTarget.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        {leftIcon}
        {label}
      </Button>
    </>
  );
}
