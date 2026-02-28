import { Product } from "@/components/ProductCard";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface ExportButtonsProps {
  products: Product[];
}

const ExportButtons = ({ products }: ExportButtonsProps) => {
  const exportCSV = () => {
    const header = "Código de Barras,Quantidade,Data/Hora\n";
    const rows = products
      .map(
        (p) =>
          `"${p.barcode}",${p.quantity},"${p.createdAt.toLocaleString("pt-BR")}"`
      )
      .join("\n");
    
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produtos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Lista de Produtos", 14, 20);
    doc.setFontSize(10);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 14, 28);

    let y = 35;
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      // Check if we need a new page (each card ~45px tall)
      if (y + 50 > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      // Photo
      if (p.photo) {
        try {
          doc.addImage(p.photo, "JPEG", 14, y, 30, 30);
        } catch {
          // skip if image fails
        }
      }

      const textX = p.photo ? 50 : 14;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}. Código: ${p.barcode}`, textX, y + 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Quantidade: ${p.quantity}`, textX, y + 16);
      doc.text(`Data: ${p.createdAt.toLocaleString("pt-BR")}`, textX, y + 23);

      // Separator line
      y += 35;
      doc.setDrawColor(200);
      doc.line(14, y, 196, y);
      y += 8;
    }

    doc.save(`produtos_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const shareList = async () => {
    const text = products
      .map((p, i) => `${i + 1}. Código: ${p.barcode} | Qtd: ${p.quantity}`)
      .join("\n");

    const fullText = `📋 Lista de Produtos (${new Date().toLocaleDateString("pt-BR")})\n\n${text}\n\nTotal: ${products.length} produto(s)`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Lista de Produtos", text: fullText });
      } catch {}
    } else {
      await navigator.clipboard.writeText(fullText);
      alert("Lista copiada!");
    }
  };

  if (products.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={exportCSV}
        className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <FileSpreadsheet className="w-4 h-4" />
        CSV
      </button>
      <button
        onClick={exportPDF}
        className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <FileText className="w-4 h-4" />
        PDF
      </button>
      <button
        onClick={shareList}
        className="flex-1 h-11 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <Download className="w-4 h-4" />
        Compartilhar
      </button>
    </div>
  );
};

export default ExportButtons;
