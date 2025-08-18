import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { Image as ImageIcon, X, AlertTriangle } from "lucide-react";

type Img = { src: string; alt?: string };
type ImgInput = string | Img;

function resolveSrc(i: ImgInput, pathPrefix: string) {
  const raw = typeof i === "string" ? i : i.src;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return `${pathPrefix.replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
}

export default function ImagesDialog({
  title,
  images,
  triggerText = "Tabela de Preços",
  triggerClassName = "h-7 px-2",
  pathPrefix = "/precos",
}: {
  title: string;
  images: ImgInput[];
  triggerText?: string;
  triggerClassName?: string;
  pathPrefix?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<number, string>>({});
  const contentRef = React.useRef<HTMLDivElement | null>(null);

  // Bloquear scroll do body quando aberto + ESC para fechar
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    // Fecha apenas se o clique for no backdrop, não dentro do conteúdo
    if (e.target === e.currentTarget) setOpen(false);
  }

  function handleError(idx: number, src: string) {
    setErrs((e) => ({ ...e, [idx]: `Falha a carregar: ${src}` }));
  }

  const modal = open ? createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="images-dialog-title"
      onMouseDown={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 w-[95vw] max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 id="images-dialog-title" className="text-base font-semibold">{title}</h2>
          <Button
            type="button"
            variant="secondary"
            className="h-7 px-2"
            onClick={() => setOpen(false)}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="p-4 grid gap-3">
          {images.map((img, i) => {
            const src = resolveSrc(img, pathPrefix);
            const alt = typeof img === "string" ? `imagem ${i + 1}` : (img.alt || `imagem ${i + 1}`);
            const error = errs[i];

            return (
              <div key={i} className="border rounded-lg overflow-hidden p-2 bg-white">
                {error ? (
                  <div className="flex items-start gap-2 text-red-700 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5" />
                    <div>
                      <div className="font-medium">Não foi possível carregar a imagem.</div>
                      <div className="break-all">{error}</div>
                      <div className="text-gray-500 mt-1">
                        Garante que o ficheiro existe em <code>{src}</code> e que o nome (maiúsculas/minúsculas) está correto.
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={src}
                    alt={alt}
                    className="w-full h-auto block"
                    onError={() => handleError(i, src)}
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
            );
          })}

          <div className="flex justify-end">
            <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setOpen(false)}>
              Fechar
            </Button>
          </div>

        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="h-4 w-4 mr-1" />
        {triggerText}
      </Button>
      {modal}
    </>
  );
}
