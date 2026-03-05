import { useState } from "react";
import { dispararWebhookListaBaixada } from "@/lib/webhook";
import { Product, ListData } from "@/components/ProductCard";
import {
  MoreVertical, Pencil, Trash2, Download, FileText,
  FileSpreadsheet, Share2, FileInput, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

interface ListHistoryProps {
  lists: ListData[];
  onUpdateList: (list: ListData) => void;
  onStartConference: () => void;
}

const DOT_COLORS: Record<string, string> = {
  green: "#00cc66",
  red: "#ff4444",
  yellow: "#ffaa00",
};

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
        photo: p.photo || null,
      })),
    });
  };

  const exportPDF = (list: ListData) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text(list.title || "Lista de Produtos", 14, 20);
    doc.setFontSize(11);
    doc.text(`Pessoa: ${list.person}`, 14, 28);
    doc.text(`Data: ${list.createdAt.toLocaleDateString("pt-BR")}`, 14, 35);
    doc.text(`Total: ${list.products.length}`, 14, 42);
    let y = 52;
    const pageHeight = doc.internal.pageSize.getHeight();
    list.products.forEach((p, i) => {
      const itemH = p.photo ? 45 : 25;
      if (y + itemH > pageHeight - 20) { doc.addPage(); y = 20; }
      if (p.photo) { try { doc.addImage(p.photo, "JPEG", 14, y, 28, 28); } catch {} }
      const tx = p.photo ? 48 : 14;
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}. Codigo: ${p.barcode}`, tx, y + 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(`SKU: ${p.sku || "-"} | Qtd: ${p.quantity}`, tx, y + 13);
      doc.text(`Tira Etiqueta: ${p.removeTag ? "Sim" : "Nao"}`, tx, y + 19);
      y += itemH;
    });
    doc.save(`lista_${list.person.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    markDownloaded(list.id); setDownloadOpen(null);
    toast({ title: "PDF exportado!" });
  };

  const exportCSV = (list: ListData) => {
    const rows = list.products.map((p) => `${p.barcode};${p.quantity}`).join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lista_${list.person.replace(/\s/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    markDownloaded(list.id); setDownloadOpen(null);
    toast({ title: "CSV exportado!" });
  };

  const handleShare = async (list: ListData) => {
    let text = `📋 ${list.title}\n👤 ${list.person}\n📅 ${list.createdAt.toLocaleDateString("pt-BR")}\n\n`;
    list.products.forEach((p, i) => { text += `${i + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | Qtd: ${p.quantity}\n`; });
    if (navigator.share) { try { await navigator.share({ title: list.title, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast({ title: "Lista copiada!" }); }
    markDownloaded(list.id); setDownloadOpen(null);
  };

  const exportJSON = async (list: ListData) => {
    const data = {
      type: "conference-file",
      items: list.products.map((p) => ({ codigo: p.barcode, sku: p.sku || "", quantidade: p.quantity, photo: p.photo || null })),
    };
    const fileName = list.title.replace(/[\s\/]/g, "_").replace(/[^a-zA-Z0-9_\-áéíóúàèìòùâêîôûãõäëïöüçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜÇ]/g, "");
    const soCodigosBloco = list.products.map((p) => p.barcode).join("\n");
    const codigoQuantidadeBloco = list.products.map((p) => `${p.barcode};${p.quantity}`).join("\n");
    const txtContent = `Codigo\n${soCodigosBloco}\n\n------------------------\n\nCodigo;Quantidade\n${codigoQuantidadeBloco}`;
    markDownloaded(list.id); setDownloadOpen(null);
    try {
      const zip = new JSZip();
      zip.file(`${fileName}.json`, JSON.stringify(data, null, 2));
      zip.file(`${fileName}.txt`, txtContent);
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([zipBlob], `${fileName}.zip`, { type: "application/zip" });
      if (navigator.share) { try { await navigator.share({ files: [zipFile], title: `Lista - ${list.title}` }); return; } catch (err: any) { if (err?.name === "AbortError") return; } }
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a"); a.href = url; a.download = `${fileName}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "ZIP baixado!" });
    } catch {
      const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(jsonBlob);
      const a = document.createElement("a"); a.href = url; a.download = `${fileName}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const openEdit = (list: ListData) => {
    setEditList({ ...list, products: list.products.map((p) => ({ ...p })) });
    setEditIndex(0);
    setEditProduct({ ...list.products[0] });
    setMenuOpen(null);
  };

  const saveEditProduct = () => {
    if (!editList || !editProduct) return;
    const updatedProducts = editList.products.map((p, i) => i === editIndex ? { ...editProduct } : p);
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
    const updatedProducts = editList.products.map((p, i) => i === editIndex ? { ...editProduct! } : p);
    onUpdateList({ ...editList, products: updatedProducts });
    setEditList(null); setEditProduct(null);
    toast({ title: "Lista atualizada!" });
  };

  const navigateEdit = (dir: number) => {
    if (!editList || !editProduct) return;
    const updatedProducts = editList.products.map((p, i) => i === editIndex ? { ...editProduct } : p);
    const updated = { ...editList, products: updatedProducts };
    setEditList(updated);
    const next = editIndex + dir;
    if (next >= 0 && next < updated.products.length) { setEditIndex(next); setEditProduct({ ...updated.products[next] }); }
  };

  const inputStyle = { width: "100%", height: 44, padding: "0 14px", borderRadius: 10, border: "1px solid #333", background: "#000", color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box" as const };
  const dialogStyle = { background: "#111", border: "1px solid #333", color: "#fff" };

  if (sortedLists.length === 0) {
    return (
      <div className="p-4">
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <p style={{ color: "#555", fontWeight: 500 }}>Nenhuma lista no histórico</p>
          <p style={{ fontSize: 13, color: "#444", marginTop: 4 }}>Feche uma lista na aba "Escanear"</p>
        </div>
        <div style={{ paddingTop: 16, borderTop: "1px solid #222" }}>
          <button onClick={onStartConference}
            style={{ width: "100%", height: 48, background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 12, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
          >
            <FileInput style={{ width: 18, height: 18 }} /> Importar Lista para Conferência
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {sortedLists.map((list) => (
        <div key={list.id} style={{ background: "#111", borderRadius: 12, border: "1px solid #222", padding: 16, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.title}</p>
              <p style={{ fontSize: 12, color: "#666", marginTop: 2 }}>👤 {list.person}</p>
              <p style={{ fontSize: 12, color: "#555" }}>{list.products.length} item(ns)</p>
              <p style={{ fontSize: 12, color: "#444" }}>{list.createdAt.toLocaleDateString("pt-BR")}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: DOT_COLORS[list.status] ?? DOT_COLORS.yellow }} />
              <div style={{ position: "relative" }}>
                <button onClick={() => setMenuOpen(menuOpen === list.id ? null : list.id)}
                  style={{ padding: 6, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <MoreVertical style={{ width: 20, height: 20, color: "#666" }} />
                </button>
                {menuOpen === list.id && (
                  <div style={{ position: "absolute", right: 0, top: "100%", marginTop: 4, background: "#1a1a1a", border: "1px solid #333", borderRadius: 12, zIndex: 10, width: 160, overflow: "hidden" }}>
                    {[
                      { label: "Editar", icon: <Pencil style={{ width: 14, height: 14 }} />, onClick: () => openEdit(list) },
                      { label: "Excluir", icon: <Trash2 style={{ width: 14, height: 14 }} />, onClick: () => { setDeleteConfirm(list.id); setMenuOpen(null); }, danger: true },
                      { label: "Baixar", icon: <Download style={{ width: 14, height: 14 }} />, onClick: () => { setDownloadOpen(list.id); setMenuOpen(null); } },
                    ].map(({ label, icon, onClick, danger }) => (
                      <button key={label} onClick={onClick}
                        style={{ width: "100%", padding: "10px 16px", fontSize: 13, textAlign: "left", display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", color: danger ? "#ff4444" : "#ccc" }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div style={{ paddingTop: 16, borderTop: "1px solid #222" }}>
        <button onClick={onStartConference}
          style={{ width: "100%", height: 48, background: "#1a1a1a", color: "#fff", border: "1px solid #333", borderRadius: 12, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
        >
          <FileInput style={{ width: 18, height: 18 }} /> Importar Lista para Conferência
        </button>
      </div>

      {/* DELETE */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm rounded-xl" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff" }}>Excluir lista?</DialogTitle>
            <DialogDescription style={{ color: "#666" }}>Ela será marcada como excluída no histórico.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, height: 40, borderRadius: 10, background: "#222", color: "#fff", border: "1px solid #333", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} style={{ flex: 1, height: 40, borderRadius: 10, background: "#ff4444", color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Excluir</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DOWNLOAD */}
      <Dialog open={!!downloadOpen} onOpenChange={() => setDownloadOpen(null)}>
        <DialogContent className="max-w-sm rounded-xl" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff" }}>Compartilhar / Exportar</DialogTitle>
            <DialogDescription style={{ color: "#666" }}>Como deseja enviar esta lista?</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button onClick={() => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportJSON(l); }}
              style={{ height: 64, borderRadius: 12, background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, border: "none", cursor: "pointer" }}
            >
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: "white" }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L.057 23.886a.5.5 0 0 0 .606.61l6.198-1.422A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.373l-.36-.214-3.733.856.888-3.62-.235-.373A9.865 9.865 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/></svg>
              Enviar pelo WhatsApp
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#444" }}>
              <div style={{ flex: 1, height: 1, background: "#222" }} /> outras opções <div style={{ flex: 1, height: 1, background: "#222" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "PDF", icon: <FileText style={{ width: 20, height: 20 }} />, onClick: () => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportPDF(l); } },
                { label: "CSV", icon: <FileSpreadsheet style={{ width: 20, height: 20 }} />, onClick: () => { const l = lists.find((x) => x.id === downloadOpen); if (l) exportCSV(l); } },
                { label: "Texto", icon: <Share2 style={{ width: 20, height: 20 }} />, onClick: () => { const l = lists.find((x) => x.id === downloadOpen); if (l) handleShare(l); } },
              ].map(({ label, icon, onClick }) => (
                <button key={label} onClick={onClick}
                  style={{ height: 56, borderRadius: 10, background: "#1a1a1a", color: "#ccc", border: "1px solid #333", fontWeight: 600, fontSize: 13, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* EDIT */}
      <Dialog open={!!editList} onOpenChange={() => { setEditList(null); setEditProduct(null); }}>
        <DialogContent className="max-w-sm rounded-xl" style={{ ...dialogStyle, maxHeight: "90vh", overflowY: "auto" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "#fff" }}>Editar Produtos</DialogTitle>
            <DialogDescription style={{ color: "#666" }}>Item {editIndex + 1} de {editList?.products.length || 0}</DialogDescription>
          </DialogHeader>
          {editProduct && (
            <div className="space-y-3">
              {editProduct.photo && <img src={editProduct.photo} alt="Produto" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} />}
              {[
                { label: "Código de Barras", value: editProduct.barcode, onChange: (e: any) => setEditProduct({ ...editProduct, barcode: e.target.value }), type: "text" },
                { label: "SKU", value: editProduct.sku, onChange: (e: any) => setEditProduct({ ...editProduct, sku: e.target.value }), type: "text" },
                { label: "Quantidade", value: editProduct.quantity, onChange: (e: any) => setEditProduct({ ...editProduct, quantity: Number(e.target.value) || 0 }), type: "number" },
              ].map(({ label, value, onChange, type }) => (
                <div key={label}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 4, display: "block" }}>{label}</label>
                  <input type={type} value={value} onChange={onChange} style={inputStyle} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 4, display: "block" }}>Tira Etiqueta?</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([true, false] as const).map((val) => (
                    <button key={String(val)} onClick={() => setEditProduct({ ...editProduct, removeTag: val })}
                      style={{ height: 40, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", background: editProduct.removeTag === val ? "#fff" : "#1a1a1a", color: editProduct.removeTag === val ? "#000" : "#555", border: editProduct.removeTag === val ? "2px solid #fff" : "2px solid #333" }}
                    >
                      {val ? "SIM" : "NÃO"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
                <button onClick={() => navigateEdit(-1)} disabled={editIndex === 0}
                  style={{ height: 40, padding: "0 12px", borderRadius: 10, background: "#1a1a1a", color: "#ccc", border: "1px solid #333", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", opacity: editIndex === 0 ? 0.3 : 1 }}
                >
                  <ChevronLeft style={{ width: 16, height: 16 }} /> Ant
                </button>
                {editIndex < (editList?.products.length || 0) - 1 ? (
                  <button onClick={() => navigateEdit(1)}
                    style={{ flex: 1, height: 40, borderRadius: 10, background: "#fff", color: "#000", border: "none", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}
                  >
                    Próximo <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                ) : (
                  <button onClick={finishEdit}
                    style={{ flex: 1, height: 40, borderRadius: 10, background: "#00cc66", color: "#000", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
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

