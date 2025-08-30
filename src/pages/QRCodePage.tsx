// src/pages/QRCodePage.tsx
import { useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";

/**
 * Página minimalista de geração de QR Codes
 * - Sem shadcn/ui: apenas HTML + classes Tailwind
 * - Gera SVG e permite descarregar SVG ou PNG
 * - Quiet zone adequada no PNG (margem branca)
 */
export default function QRCodePage() {
  const [text, setText] = useState<string>("https://aac-sb.netlify.app/");
  const [size, setSize] = useState<number>(240);
  const [fg, setFg] = useState<string>("#000000");
  const [bg, setBg] = useState<string>("#FFFFFF");
  const svgRef = useRef<SVGSVGElement | null>(null);

  const isLikelyUrl = useMemo(() => {
    try {
      new URL(text);
      return true;
    } catch {
      return /^mailto:|^tel:|^sms:/i.test(text);
    }
  }, [text]);

  function copyToClipboard() {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  /** Download direto do SVG (qualidade vetorial) */
  function downloadSVG() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const markup = serializer.serializeToString(svgRef.current);
    const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qrcode.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Converte o SVG para PNG com margem (quiet zone) e faz download */
  function downloadPNG() {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgRef.current);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const padding = Math.round(size * 0.10); // 10% quiet zone
      const canvas = document.createElement("canvas");
      canvas.width = size + padding * 2;
      canvas.height = size + padding * 2;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // fundo
      ctx.fillStyle = bg || "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // QR
      ctx.drawImage(img, padding, padding, size, size);

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const dl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = dl;
          a.download = "qrcode.png";
          a.click();
          URL.revokeObjectURL(dl);
        },
        "image/png",
        1
      );

      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Gerador de QR Code</h1>
        <p className="text-sm text-slate-600 mt-1">
          Gera QR para ligações ou texto. Podes descarregar em SVG (vetorial) ou PNG.
        </p>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-10">
        <section className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 space-y-6">
          {/* Entrada de texto */}
          <div>
            <label className="block text-sm font-medium mb-1">Ligação ou texto</label>
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="https://exemplo.pt/pagina"
            />
            <div className={`text-xs mt-1 ${isLikelyUrl ? "text-emerald-700" : "text-slate-500"}`}>
              {isLikelyUrl ? "Formato de URL detetado." : "Também podes gerar para qualquer texto."}
            </div>
          </div>

          {/* Controlos: tamanho e cores */}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tamanho</label>
              <input
                type="range"
                min={160}
                max={640}
                step={16}
                value={size}
                onChange={(e) => setSize(parseInt(e.target.value, 10))}
                className="w-full"
              />
              <div className="text-xs text-slate-600 mt-1">{size}px</div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Cor do QR</label>
              <input
                type="color"
                value={fg}
                onChange={(e) => setFg(e.target.value)}
                className="h-10 w-full rounded-xl border p-1 bg-white"
                title="Cor do QR"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Fundo</label>
              <input
                type="color"
                value={bg}
                onChange={(e) => setBg(e.target.value)}
                className="h-10 w-full rounded-xl border p-1 bg-white"
                title="Cor de fundo"
              />
            </div>
          </div>

          {/* Pré-visualização + ações */}
          <div className="flex flex-col items-center gap-4 py-3">
            <div className="rounded-2xl border bg-white p-4">
              {/* Nota: react-qr-code usa SVG; aplicamos cores com 'fgColor' e 'bgColor' */}
              <QRCode
                ref={svgRef as any}
                value={text || " "}
                size={size}
                fgColor={fg || "#000000"}
                bgColor={bg || "#FFFFFF"}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={downloadSVG}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 active:scale-[0.99]"
              >
                Descarregar SVG
              </button>
              <button
                onClick={downloadPNG}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 active:scale-[0.99]"
              >
                Descarregar PNG
              </button>
              <button
                onClick={copyToClipboard}
                className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50 active:scale-[0.99]"
                title="Copiar texto do QR"
              >
                Copiar texto
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Dica: o <span className="font-medium">SVG</span> é vetorial e imprime com mais nitidez. O{" "}
              <span className="font-medium">PNG</span> inclui uma margem branca (quiet zone) adequada.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
