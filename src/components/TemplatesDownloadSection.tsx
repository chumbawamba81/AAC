import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { FileText, Download, ExternalLink } from "lucide-react";

/**
 * Coloca os PDFs em: public/formularios/
 * Ex.: public/formularios/ficha-socio.pdf  ->  /formularios/ficha-socio.pdf
 */

type Template = {
  file: string;        // caminho relativo a /formularios/
  title: string;
  note?: string;       // pequena descrição (opcional)
};

const BASE = "/formularios";

// ✏️ Edita a lista conforme precisares
const TEMPLATES: Template[] = [
  { file: "ficha-socio.pdf",            title: "Ficha de Sócio" },
  { file: "ficha-atleta.pdf",           title: "Ficha de Sócio de Atleta" },
  { file: "ficha-jogador-fpb.pdf",      title: "Ficha de Jogador FPB" },
  { file: "ficha-inscricao-aac.pdf",    title: "Ficha de Inscrição AAC" },
  { file: "exame-medico.pdf",           title: "Exame Médico (modelo)" },
];

export default function TemplatesDownloadSection() {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documentos para descarregar e preencher
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => {
            const href = `${BASE}/${t.file}`;
            return (
              <div
                key={t.file}
                className="border rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium">{t.title}</div>
                  {t.note && (
                    <div className="text-xs text-gray-500">{t.note}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <a
                    className="underline inline-flex items-center gap-1"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" /> Abrir
                  </a>
                  <a href={href} download>
                    <Button className="ml-1" variant="outline">
                      <Download className="h-4 w-4 mr-1" />
                      Descarregar
                    </Button>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-xs text-gray-500 mt-3">
          Dica: quando possível, preenche digitalmente para garantir legibilidade.
        </div>
      </CardContent>
    </Card>
  );
}
