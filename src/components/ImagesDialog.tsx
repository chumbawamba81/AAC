import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Button } from "./ui/button";
import { Image as ImageIcon } from "lucide-react";

type Img = { src: string; alt?: string };

export default function ImagesDialog({
  title,
  images,
  triggerText = "Tabela de Preços",
}: {
  title: string;
  images: Img[];
  triggerText?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2">
          <ImageIcon className="h-4 w-4 mr-1" />
          {triggerText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {images.map((img, i) => (
            <div key={i} className="border rounded-lg overflow-hidden">
              {/* Evita estouro horizontal em mobiles */}
              <img src={img.src} alt={img.alt || `imagem ${i + 1}`} className="w-full h-auto block" />
            </div>
          ))}
          <p className="text-xs text-gray-500">
            Coloca as imagens em <code>/public/precos</code> e ajusta os caminhos se necessário.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
