import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Image as ImageIcon, X, AlertTriangle } from "lucide-react";

type Img = { src: string; alt?: string };
type ImgInput = string | Img;

function resolveSrc(i: ImgInput, pathPrefix: string) {
  const raw = typeof i === "string" ? i : i.src;
  // http(s):// ou caminho absoluto -> usa tal como está; caso contrário, prefixa com pathPrefix
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return `${pathPrefix.replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
}

export default function ImagesDialog({
  title,
  images,
  triggerText = "Tabela de Preços",
  triggerClassName = "h-7 px-2",
  pathPrefix = "/precos", // imagens em public/precos
}: {
  title: string;
  images: ImgInput[];
  triggerText?: string;
  triggerClassName?: string;
  pathPrefix?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [errs, setErrs] = React.useState<Record<number, string>>({});

  // Fecho por ESC (fallback caso o teu Dialog não trate isto)
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleError(idx: number, src: string) {
    setErrs((e) => ({ ...e, [idx]: `Falha a carregar: ${src}` }));
  }

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

      <Dialog open={open} onOpenChange={setOpen}>
        {/* NOTA: Removido onPointerDownOutside porque o teu DialogContent não aceita essa prop */}
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{title}</span>
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            {images.map((img, i) => {
              const src = resolveSrc(img, pathPrefix);
              const alt =
                typeof img === "string"
                  ? `imagem ${i + 1}`
                  : img.alt || `imagem ${i + 1}`;
              const error = errs[i];

              return (
                <div key={i} className="border rounded-lg overflow-hidden p-2">
                  {error ? (
                    <div className="flex items-start gap-2 text-red-700 text-sm">
                      <AlertTriangle className="h-4 w-4 mt-0.5" />
                      <div>
                        <div className="font-medium">Não foi possível carregar a imagem.</div>
                        <div className="break-all">{error}</div>
                        <div className="text-gray-500 mt-1">
                          Verifica se o ficheiro existe em <code>{src}</code> e se o nome (maiúsculas/minúsculas) está correcto.
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

            <p className="text-xs text-gray-500">
              Coloca os ficheiros em <code>/public/precos/</code>. Ex.:{" "}
              <code>public/precos/pagamentos-2025.png</code> → URL{" "}
              <code>/precos/pagamentos-2025.png</code>.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
