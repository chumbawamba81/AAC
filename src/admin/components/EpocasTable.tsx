import React, { useEffect, useState } from "react";
import { RefreshCw, Plus, Edit, Trash2, Calendar } from "lucide-react";
import {
  listEpocas,
  createEpoca,
  updateEpoca,
  deleteEpoca,
  setActiveEpoca,
} from "../../services/epocaService";
import type { Epoca } from "../../models/Epoca";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/MiniToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 align-top">{children}</td>;
}

export default function EpocasTable() {
  const [epocas, setEpocas] = useState<Epoca[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Epoca | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formActiva, setFormActiva] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const data = await listEpocas();
      console.log("Loaded épocas:", data);
      setEpocas(data);
    } catch (err) {
      console.error("Erro ao carregar épocas:", err);
      showToast("Erro ao carregar épocas", "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  function handleNew() {
    setEditing(null);
    setFormName("");
    setFormActiva(false);
    setIsDialogOpen(true);
  }

  function handleEdit(epoca: Epoca) {
    setEditing(epoca);
    setFormName(epoca.name);
    setFormActiva(epoca.activa ?? false);
    setIsDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      showToast("O nome é obrigatório", "err");
      return;
    }

    try {
      if (editing) {
        await updateEpoca({ ...editing, name: formName.trim(), activa: formActiva });
        showToast("Época atualizada com sucesso", "ok");
      } else {
        await createEpoca({ name: formName.trim(), activa: formActiva });
        showToast("Época criada com sucesso", "ok");
      }
      setIsDialogOpen(false);
      reload();
    } catch (err) {
      console.error("Erro ao salvar época:", err);
      showToast("Erro ao salvar época", "err");
    }
  }

  async function handleDelete(epoca: Epoca) {
    if (!confirm(`Tem a certeza que deseja eliminar a época "${epoca.name}"?`)) {
      return;
    }

    try {
      await deleteEpoca(epoca.id);
      showToast("Época eliminada com sucesso", "ok");
      reload();
    } catch (err) {
      console.error("Erro ao eliminar época:", err);
      showToast("Erro ao eliminar época", "err");
    }
  }

  async function handleToggleActive(epoca: Epoca) {
    // If clicking on the already active one, deactivate it
    if (epoca.activa) {
      try {
        await updateEpoca({ ...epoca, activa: false });
        showToast("Época desativada", "ok");
        reload();
      } catch (err) {
        console.error("Erro ao desativar época:", err);
        showToast("Erro ao desativar época", "err");
      }
      return;
    }

    // Otherwise, activate this one and deactivate all others
    try {
      await setActiveEpoca(epoca.id);
      showToast("Época ativada com sucesso", "ok");
      reload();
    } catch (err) {
      console.error("Erro ao ativar época:", err);
      showToast("Erro ao ativar época", "err");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Épocas
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="default" onClick={handleNew}>
            <Plus className="h-4 w-4" /> Nova Época
          </Button>
          <Button variant="secondary" onClick={reload} aria-label="Atualizar">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {/* tabela */}
      <div className="border bg-white">
        <div className="p-3 border-b">
          <div className="text-xs/6 text-gray-600 font-semibold">
            {loading ? "A carregar…" : `${epocas.length} registo(s)`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full w-full text-sm">
            <thead>
              <tr className="bg-neutral-700 text-white uppercase">
                <Th>ID</Th>
                <Th>Nome</Th>
                <Th>Ativa</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {epocas.map((epoca, index) => (
                <tr
                  key={epoca.id}
                  className={`border-t ${
                    index % 2 === 0 ? "bg-neutral-100" : "bg-neutral-300"
                  } hover:bg-amber-400`}
                >
                  <Td>{epoca.id}</Td>
                  <Td>{epoca.name}</Td>
                  <Td>
                    <input
                      type="checkbox"
                      checked={epoca.activa ?? false}
                      onChange={() => handleToggleActive(epoca)}
                      className="h-4 w-4 cursor-pointer"
                      aria-label={`Marcar época ${epoca.name} como ativa`}
                    />
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleEdit(epoca)}
                        aria-label="Editar"
                        className="inline-flex h-8 items-center justify-center px-2 text-xs"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => handleDelete(epoca)}
                        aria-label="Eliminar"
                        className="inline-flex h-8 items-center justify-center px-2 text-xs text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {epocas.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">
                    Sem resultados.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-gray-500">
                    A carregar…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog para criar/editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Época" : "Nova Época"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nome</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: 2024/25"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSave();
                  }
                }}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formActiva}
                  onChange={(e) => setFormActiva(e.target.checked)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="text-sm font-medium">Ativa</span>
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button variant="default" onClick={handleSave}>
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

