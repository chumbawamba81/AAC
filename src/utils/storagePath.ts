// src/utils/storagePath.ts
/** Segmento seguro para paths: remove acentos/ç, troca espaços por "-", permite [a-z0-9._-] */
export function toSafeSegment(input: string, fallback = "item"): string {
  if (!input) return fallback;
  let s = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[^a-zA-Z0-9._-]/g, "-");
  s = s.replace(/-+/g, "-").replace(/\.+/g, ".");
  s = s.toLowerCase().replace(/^[-.]+|[-.]+$/g, "");
  return s || fallback;
}

/** Nome de ficheiro seguro preservando extensão (ex.: "ficha-socio.pdf") */
export function toSafeFilename(name: string, fallback = "ficheiro.bin"): string {
  if (!name) return fallback;
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) {
    const base = toSafeSegment(name);
    return base.includes(".") ? base : `${base}.bin`;
  }
  const base = toSafeSegment(name.slice(0, idx)) || "ficheiro";
  const ext = toSafeSegment(name.slice(idx + 1)) || "bin";
  return `${base}.${ext}`;
}

/** Junta segmentos sem “//” e sem barras iniciais/finais */
export function joinPath(...parts: Array<string | undefined | null>): string {
  const cleaned = parts
    .filter(Boolean)
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0);
  return cleaned.join("/");
}
