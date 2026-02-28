import { useState } from "react";
import { dispararWebhookListaBaixada } from "@/lib/webhook";
import { Product, ListData } from "@/components/ProductCard";
import {
  MoreVertical,
  Pencil,
  Trash2,
  Download,
  FileText,
  FileSpreadsheet,
  Share2,
  FileInput,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ListHistoryProps {
  lists: ListData[];
  onUpdateList: (list: ListData) => void;
  onStartConference: () => void;
}

const ListHistory = ({ lists, onUpdateList, onStartConference }: ListHistoryProps) => {
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState<string | null>(null);
  const [editList, setEditList] = useState<ListData | null>(null);
  const [editIndex, setEditIndex] = useState(0);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  const sortedLists = [...lists]
    .filter((l) => l.status !== "open")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const getStatusDot = (status: ListData["status"]) => {
    switch (status) {
      case "green": return "bg-[hsl(var(--success))]";
      case "red": return "bg-destructive";
      default: return "bg-[hsl(var(--warning))]";
    }
  };

  const handleDelete = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    onUpdateList({ ...list, status: "red" });
    setDeleteConfirm(null);
    setMenuOpen(null);
    toast({ title: "Lista marcada como excluída" });
  };

  const markDownloaded = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list || list.status === "red") return;
    onUpdateList({ ...list, status: "green" });

    // 🔔 WEBHOOK — PONTO 1: lista baixada
    dispararWebhookListaBaixada({
      pessoa: list.person,
      titulo: list.title,
      totalItens: list.products.length,
      dataCriacao: list.createdAt.toISOString(),
      produtos: list.products.map((p) => ({
       barcode: p.barcode,
        sku: p.sku || "",
        quantidade: p.quantity,
       removeTag: p.removeTag ?? false,
        photo: p.photo || null, // ✅ foto incluída
})),
    });
  };

  // ---- EXPORT FUNCTIONS ----
  const exportPDF = (list: ListData) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(list.title || "Lista de Produtos", 14, 20);
    doc.setFontSize(11);
    doc.text(`Pessoa: ${list.person}`, 14, 28);
    doc.text(`Data: ${list.createdAt.toLocaleDateString("pt-BR")}`, 14, 35);
    doc.text(`Total de SKUs: ${list.products.length}`, 14, 42);

    let y = 52;
    const pageHeight = doc.internal.pageSize.getHeight();

    list.products.forEach((p, i) => {
      const itemH = p.photo ? 45 : 25;
      if (y + itemH > pageHeight - 20) { doc.addPage(); y = 20; }

      if (p.photo) {
        try { doc.addImage(p.photo, "JPEG", 14, y, 28, 28); } catch {}
      }
      const tx = p.photo ? 48 : 14;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}. Codigo: ${p.barcode}`, tx, y + 6);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`SKU: ${p.sku || "-"} | Qtd: ${p.quantity}`, tx, y + 13);
      doc.text(`Tira Etiqueta: ${p.removeTag ? "Sim" : "Nao"}`, tx, y + 19);

      y += itemH;
      doc.setDrawColor(200);
      doc.line(14, y, 196, y);
      y += 5;
    });

    doc.save(`lista_${list.person.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    markDownloaded(list.id);
    setDownloadOpen(null);
    toast({ title: "PDF exportado!" });
  };

  const exportCSV = (list: ListData) => {
    const rows = list.products
      .map((p) => `${p.barcode};${p.quantity}`)
      .join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista_${list.person.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    markDownloaded(list.id);
    setDownloadOpen(null);
    toast({ title: "CSV exportado!" });
  };

  const handleShare = async (list: ListData) => {
    let text = `📋 ${list.title}\n👤 Pessoa: ${list.person}\n📅 ${list.createdAt.toLocaleDateString("pt-BR")}\n`;

    text += `\n📦 PRODUTOS (${list.products.length})\n`;
    list.products.forEach((p, i) => {
      text += `${i + 1}. Código: ${p.barcode} | SKU: ${p.sku || "-"} | Qtd: ${p.quantity}\n`;
    });
    text += `\nTotal: ${list.products.length} produto(s)`;

    if (navigator.share) {
      try { await navigator.share({ title: list.title, text }); } catch {}
    } else {
      await navigator.clipboard.writeText(text);
      toast({ title: "Lista copiada!" });
    }
    markDownloaded(list.id);
    setDownloadOpen(null);
  };

  const exportJSON = async (list: ListData) => {
    const data = {
      type: "conference-file",
      items: list.products.map((p) => ({
        codigo: p.barcode,
        sku: p.sku || "",
        quantidade: p.quantity,
        photo: p.photo || null,
      })),
    };

    const fileName = list.title.replace(/[\s\/]/g, "_").replace(/[^a-zA-Z0-9_\-áéíóúàèìòùâêîôûãõäëïöüçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜÇ]/g, "");

    markDownloaded(list.id);
    setDownloadOpen(null);

    try {
      const zip = new JSZip();
      zip.file(`${fileName}.json`, JSON.stringify(data, null, 2));
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([zipBlob], `${fileName}.zip`, { type: "application/zip" });

      // Tenta share nativo — Android abre menu para escolher WhatsApp com arquivo
      if (navigator.share) {
        try {
          await navigator.share({ files: [zipFile], title: `Lista - ${list.title}` });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }

      // Fallback: baixa o ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "ZIP baixado!", description: "Abra o WhatsApp e anexe o arquivo." });

    } catch {
      const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(jsonBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "JSON baixado!", description: "Não foi possível gerar o ZIP." });
    }
  };

  // ---- EDIT LOGIC ----
  const openEdit = (list: ListData) => {
    setEditList({ ...list, products: list.products.map((p) => ({ ...p })) });
    setEditIndex(0);
    setEditProduct({ ...list.products[0] });
    setMenuOpen(null);
  };

  const saveEditProduct = () => {
    if (!editList || !editProduct) return;
    const updatedProducts = editList.products.map((p, i) =>
      i === editIndex ? { ...editProduct } : p
    );
    const updated = { ...editList, products: updatedProducts };
    setEditList(updated);

    if (editIndex < updated.products.length - 1) {
      const next = editIndex + 1;
      setEditIndex(next);
      setEditProduct({ ...updated.products[next] });
    }
  };

  const finishEdit = () => {
    if (!editList) return;
    // Save current product first
    const updatedProducts = editList.products.map((p, i) =>
      i === editIndex ? { ...editProduct! } : p
    );
    onUpdateList({ ...editList, products: updatedProducts });
    setEditList(null);
    setEditProduct(null);
    toast({ title: "Lista atualizada!" });
  };

  const navigateEdit = (dir: number) => {
    if (!editList || !editProduct) return;
    // Save current
    const updatedProducts = editList.products.map((p, i) =>
      i === editIndex ? { ...editProduct } : p
    );
    const updated = { ...editList, products: updatedProducts };
    setEditList(updated);
    const next = editIndex + dir;
    if (next >= 0 && next < updated.products.length) {
      setEditIndex(next);
      setEditProduct({ ...updated.products[next] });
    }
  };

  if (sortedLists.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center py-16">
          <p className="text-muted-foreground font-medium">Nenhuma lista no histórico</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Feche uma lista na aba "Escanear" para ver aqui
          </p>
        </div>

        <div className="pt-4 border-t border-border">
          <button
            onClick={onStartConference}
            className="w-full h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <FileInput className="w-5 h-5" />
            Importar Lista para Conferência
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {sortedLists.map((list) => (
        <div key={list.id} className="bg-card rounded-xl border border-border p-4 shadow-sm relative">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{list.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">👤 {list.person}</p>
              <p className="text-xs text-muted-foreground">{list.products.length} item(ns)</p>
              <p className="text-xs text-muted-foreground">
                {list.createdAt.toLocaleDateString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full ${getStatusDot(list.status)}`} />
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(menuOpen === list.id ? null : list.id)}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <MoreVertical className="w-5 h-5 text-muted-foreground" />
                </button>
                {menuOpen === list.id && (
                  <div className="absolute right-0 top-full mt-1 bg-popover border border-border rounded-xl shadow-lg z-10 w-40 overflow-hidden">
                    <button
                      onClick={() => openEdit(list)}
                      className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors"
                    >
                      <Pencil className="w-4 h-4" /> Editar
                    </button>
                    <button
                      onClick={() => { setDeleteConfirm(list.id); setMenuOpen(null); }}
                      className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors text-destructive"
                    >
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                    <button
                      onClick={() => { setDownloadOpen(list.id); setMenuOpen(null); }}
                      className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 hover:bg-accent transition-colors"
                    >
                      <Download className="w-4 h-4" /> Baixar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="pt-4 border-t border-border">
        <button
          onClick={onStartConference}
          className="w-full h-12 bg-secondary text-secondary-foreground rounded-xl font-semibold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <FileInput className="w-5 h-5" />
          Importar Lista para Conferência
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Excluir lista?</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir esta lista? Ela será marcada como excluída no histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="flex-1 h-10 rounded-xl bg-accent text-accent-foreground font-semibold text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm"
            >
              Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Options Dialog */}
      <Dialog open={!!downloadOpen} onOpenChange={() => setDownloadOpen(null)}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Compartilhar / Exportar</DialogTitle>
            <DialogDescription>Como deseja enviar esta lista?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Botão principal: WhatsApp com arquivo */}
            <button
              onClick={() => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportJSON(l); }}
              className="h-16 rounded-xl bg-[#25D366] text-white font-bold text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-md"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L.057 23.886a.5.5 0 0 0 .606.61l6.198-1.422A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.373l-.36-.214-3.733.856.888-3.62-.235-.373A9.865 9.865 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/></svg>
              Enviar pelo WhatsApp
            </button>
            {/* Linha divisória */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              outras opções
              <div className="flex-1 h-px bg-border" />
            </div>
            {/* Botões secundários */}
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportPDF(l); }}
                className="h-14 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-transform"
              >
                <FileText className="w-5 h-5" /> PDF
              </button>
              <button
                onClick={() => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportCSV(l); }}
                className="h-14 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-transform"
              >
                <FileSpreadsheet className="w-5 h-5" /> CSV
              </button>
              <button
                onClick={() => { const l = lists.find((x) => x.id === downloadOpen); if (l) handleShare(l); }}
                className="h-14 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex flex-col items-center justify-center gap-1 active:scale-[0.98] transition-transform"
              >
                <Share2 className="w-5 h-5" /> Texto
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editList} onOpenChange={() => { setEditList(null); setEditProduct(null); }}>
        <DialogContent className="max-w-sm rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produtos</DialogTitle>
            <DialogDescription>
              Item {editIndex + 1} de {editList?.products.length || 0}
            </DialogDescription>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-3">
              {editProduct.photo && (
                <img src={editProduct.photo} alt="Produto" className="w-full h-32 object-cover rounded-xl" />
              )}
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Código de Barras</label>
                <input
                  type="text"
                  value={editProduct.barcode}
                  onChange={(e) => setEditProduct({ ...editProduct, barcode: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">SKU</label>
                <input
                  type="text"
                  value={editProduct.sku}
                  onChange={(e) => setEditProduct({ ...editProduct, sku: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Quantidade</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editProduct.quantity}
                  onChange={(e) => setEditProduct({ ...editProduct, quantity: Number(e.target.value) || 0 })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1 block">Tira Etiqueta?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setEditProduct({ ...editProduct, removeTag: true })}
                    className={`h-10 rounded-xl font-semibold text-sm transition-all border ${
                      editProduct.removeTag
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    SIM
                  </button>
                  <button
                    onClick={() => setEditProduct({ ...editProduct, removeTag: false })}
                    className={`h-10 rounded-xl font-semibold text-sm transition-all border ${
                      !editProduct.removeTag
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    NÃO
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => navigateEdit(-1)}
                  disabled={editIndex === 0}
                  className="h-10 px-3 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center gap-1 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" /> Ant
                </button>
                {editIndex < (editList?.products.length || 0) - 1 ? (
                  <button
                    onClick={() => navigateEdit(1)}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-1"
                  >
                    Próximo <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={finishEdit}
                    className="flex-1 h-10 rounded-xl bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] font-bold text-sm flex items-center justify-center"
                  >
                    Salvar Tudo
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ListHistory;



