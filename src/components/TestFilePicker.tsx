import React, { useRef } from "react";

export default function TestFilePicker() {
  const refInvisible = useRef<HTMLInputElement>(null);

  async function tryShowPicker() {
    // API moderna (se disponível)
    const anyWin = window as any;
    if (typeof anyWin.showOpenFilePicker === "function") {
      try {
        const handles = await anyWin.showOpenFilePicker({
          multiple: true,
          types: [{ description: "Imagens/PDF", accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"], "application/pdf": [".pdf"] } }],
        });
        const files = await Promise.all(handles.map((h: any) => h.getFile()));
        console.log("[showOpenFilePicker] OK:", files.map((f: File) => f.name));
        alert("showOpenFilePicker abriu com sucesso (" + files.length + " ficheiro(s)). Ver consola.");
        return;
      } catch (e:any) {
        console.warn("[showOpenFilePicker] cancelado/erro:", e?.message || e);
      }
    } else {
      console.log("showOpenFilePicker não suportado – a usar input.click()");
    }

    // Fallback: dispara o input invisível
    refInvisible.current?.click();
  }

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-white">
      <h3 className="font-semibold">Teste do seletor de ficheiros</h3>

      {/* A) Input nativo visível (deve SEMPRE abrir ao clicar) */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">A) Input visível</label>
        <input
          type="file"
          multiple
          onChange={(e)=> {
            const names = Array.from(e.target.files ?? []).map(f=>f.name);
            console.log("[input visível] ficheiros:", names);
            alert("Input visível selecionou: " + names.join(", "));
            e.currentTarget.value = "";
          }}
        />
      </div>

      {/* B) Botão que chama showOpenFilePicker() ou input.click() de um input "invisível mas clicável" */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">B) Botão → programático</label>
        <input
          ref={refInvisible}
          type="file"
          multiple
          // Evita display:none (Safari/Chrome às vezes bloqueiam). Torna-o invisível mas clicável.
          style={{ position: "fixed", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
          onChange={(e)=> {
            const names = Array.from(e.target.files ?? []).map(f=>f.name);
            console.log("[input invisível] ficheiros:", names);
            alert("Input invisível selecionou: " + names.join(", "));
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm"
          onClick={tryShowPicker}
        >
          Abrir seletor (showOpenFilePicker → fallback)
        </button>
      </div>

      {/* C) Input escondido por CSS utilitário sr-only + botão que faz click() */}
      <div className="space-y-1">
        <label className="text-sm text-gray-600">C) sr-only + click()</label>
        <input
          id="file-sr-only"
          type="file"
          multiple
          className="sr-only"
          onChange={(e)=> {
            const names = Array.from(e.target.files ?? []).map(f=>f.name);
            console.log("[sr-only] ficheiros:", names);
            alert("Input sr-only selecionou: " + names.join(", "));
            e.currentTarget.value = "";
          }}
        />
        <button
          type="button"
          className="rounded-lg border px-3 py-1.5 text-sm"
          onClick={() => (document.getElementById("file-sr-only") as HTMLInputElement)?.click()}
        >
          Abrir seletor (sr-only + click())
        </button>
      </div>
    </div>
  );
}
