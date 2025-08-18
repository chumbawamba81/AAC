import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Image as ImageIcon, X } from "lucide-react";

type Img = { src: string; alt?: string };

export default function ImagesDialog({
  title,
  images,
  triggerText = "Tabela de Preços",
  triggerClassName = "h-7 px-2",
}: {
  title: string;
  images: Img[];
  triggerText?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);

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
            {images.map((img, i) => (
              <div key={i} className="border rounded-lg overflow-hidden">
                <img
                  src={img.src}
                  alt={img.alt || `imagem ${i + 1}`}
                  className="w-full h-auto block"
                />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
