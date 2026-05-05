import { useState } from "react";
import { enviarParaClickUp, WebhookPayload } from "@/lib/webhookRouter";
import { Product, ListData } from "@/components/ProductCard";
import { MoreVertical, Pencil, Trash2, Download, FileText, FileSpreadsheet, Share2, FileInput, ChevronLeft, ChevronRight, Monitor, Database, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { resolvePhotoToDataUrl } from "@/lib/photoUtils";

interface EstoqueResult {
  codigo: string;
  sku: string;
  quantidade_lista: number;
  quantidade_sistema: number;
  photo?: string | null;
  status: "ok" | "parcial" | "zero";
}

interface ListHistoryProps {
  lists: ListData[];
  onUpdateList: (list: ListData) => void;
  onStartConference: () => void;
  modoDesktop?: boolean;
  modoLeve?: boolean;
}

const S_INPUT = {
  width: "100%", height: 44, padding: "0 14px", borderRadius: 10,
  border: "1.5px solid hsl(var(--border))", background: "hsl(var(--secondary))",
  color: "hsl(var(--foreground))", fontSize: 14, outline: "none",
  boxSizing: "border-box" as const,
} as React.CSSProperties;

const LABEL = {
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
  letterSpacing: "0.18em", textTransform: "uppercase" as const,
  color: "hsl(var(--muted-foreground))", marginBottom: 5, display: "block",
} as React.CSSProperties;

const STATUS_LEFT: Record<string, string> = {
  green: "hsl(var(--success))",
  red: "hsl(var(--destructive))",
  yellow: "hsl(var(--warning))",
};

function isEmpresaSemConsulta(empresa?: string | null): boolean {
  const normalizada = (empresa ?? "").toUpperCase();
  return normalizada.includes("SOYE") || normalizada.includes("FACIL");
}

const ListHistory = ({ lists, onUpdateList, onStartConference, modoDesktop = false, modoLeve = false }: ListHistoryProps) => {
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [downloadOpen, setDownloadOpen] = useState<string | null>(null);
  const [editList, setEditList] = useState<ListData | null>(null);
  const [editIndex, setEditIndex] = useState(0);
  const [editProduct, setEditProduct] = useState<Product | null>(null);

  // Estados do Supabase
  const [analisandoId, setAnalisandoId] = useState<string | null>(null);
  const [estoqueResultados, setEstoqueResultados] = useState<EstoqueResult[]>([]);
  const [estoqueDialogOpen, setEstoqueDialogOpen] = useState(false);
  const [estoqueListTitle, setEstoqueListTitle] = useState("");
  const [estoqueListId, setEstoqueListId] = useState<string | null>(null); // GUARDA O ID PARA ATUALIZAR A LISTA

  const [sendingId, setSendingId] = useState<string | null>(null);
  const [uploadingPhotoListId, setUploadingPhotoListId] = useState<string | null>(null);

  const sortedLists = [...lists]
    .filter((l) => l.status !== "open")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const handleDelete = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    onUpdateList({ ...list, status: "red" });
    setDeleteConfirm(null); setMenuOpen(null);
    toast({ title: "Lista marcada como excluída" });
  };

  // ✅ Função de Análise do Supabase
  const analisarEstoque = async (list: ListData) => {
    if (isEmpresaSemConsulta(list.empresa)) {
      toast({ title: "Consulta bloqueada", description: "SOYE/FACIL nao consultam Supabase/API." });
      return;
    }

    setAnalisandoId(list.id);
    try {
      const codigosParaBuscar = list.products.map(p => p.barcode);

      const { data, error } = await supabase
        .from('estoque')
        .select('codigo, estoque')
        .in('codigo', codigosParaBuscar);

         console.log("🔍 Códigos enviados:", codigosParaBuscar);
         console.log("📦 Resposta do Supabase:", data, "Erro:", error);

      if (error) throw error;

      const mapaEstoque = new Map<string, number>();
      if (data) {
        data.forEach((row: any) => {
          mapaEstoque.set(String(row.codigo), Number(row.estoque));
        });
      }

      const resultados: EstoqueResult[] = list.products.map(p => {
        const qtdSistema = mapaEstoque.has(p.barcode) ? mapaEstoque.get(p.barcode)! : -1;

        let status: "ok" | "parcial" | "zero";
        if (qtdSistema <= 0) status = "zero";
        else if (qtdSistema < p.quantity) status = "parcial";
        else status = "ok";

        return {
          codigo: p.barcode,
          sku: p.sku || "",
          quantidade_lista: p.quantity,
          quantidade_sistema: qtdSistema === -1 ? 0 : qtdSistema,
          photo: p.photo || null,
          status,
        };
      });

      setEstoqueResultados(resultados);
      setEstoqueListTitle(list.title);
      setEstoqueListId(list.id); // Salva o ID da lista sendo analisada
      setEstoqueDialogOpen(true);
      toast({ title: "✅ Análise concluída!" });
    } catch (error: any) {
      toast({ title: "❌ Erro na análise", description: "Falha ao conectar com o banco de dados.", variant: "destructive" });
    } finally {
      setAnalisandoId(null);
    }
  };

  // ✅ Função de Atualizar a Lista (Mantendo Zerados para o ClickUp)
  const atualizarListaComEstoque = () => {
    if (!estoqueListId) return;

    const listaAtual = lists.find(l => l.id === estoqueListId);
    if (!listaAtual) return;

    const produtosAtualizados = listaAtual.products.map(p => {
      const resultado = estoqueResultados.find(r => r.codigo === p.barcode);
      if (!resultado) return p;

      // Se sistema tem 0 ou menos, fica 0. Se tem estoque, pega o menor entre o escaneado e o sistema.
      const novaQuantidade = resultado.quantidade_sistema > 0 
        ? Math.min(p.quantity, resultado.quantidade_sistema) 
        : 0;

      // ATENÇÃO: Retornamos o produto mesmo se for zero, para ir pro setor de Compras!
      return { ...p, quantity: novaQuantidade };
    });

    onUpdateList({ ...listaAtual, products: produtosAtualizados });
    setEstoqueDialogOpen(false);
    toast({ 
      title: "🔄 Lista Atualizada!", 
      description: "As quantidades foram ajustadas (itens zerados foram mantidos para o setor de Compras)." 
    });
  };

  const exportPDF = async (list: ListData) => {
    const hydratedProducts = await hydrateProductsForExport(list);
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text(list.title || "Lista", 14, 20);
    doc.setFontSize(11); doc.text(`Pessoa: ${list.person}`, 14, 28);
    doc.text(`Data: ${list.createdAt.toLocaleDateString("pt-BR")}`, 14, 35);
    let y = 45; const ph = doc.internal.pageSize.getHeight();
    hydratedProducts.forEach(({ product, photoDataUrl }, i) => {
      const p = product;
      const h = photoDataUrl ? 45 : 25;
      if (y + h > ph - 20) { doc.addPage(); y = 20; }
      if (photoDataUrl) { try { doc.addImage(photoDataUrl, "JPEG", 14, y, 28, 28); } catch {} }
      const tx = photoDataUrl ? 48 : 14;
      doc.setFontSize(11); doc.setFont("helvetica", "bold");
      doc.text(`${i + 1}. ${product.barcode}`, tx, y + 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      doc.text(`SKU: ${p.sku || "-"} | Qtd: ${p.quantity} | Etiqueta: ${p.removeTag ? "Sim" : "Não"}`, tx, y + 13);
      y += h;
    });
    doc.save(`lista_${list.person.replace(/\s/g, "_")}.pdf`);
    setDownloadOpen(null);
    toast({ title: "PDF exportado!" });
  };

  const exportCSV = (list: ListData) => {
    const header = "DESCRICAO;CODIGO;QTD_CONFERIDA;QTD_PLANILHA;DIVERGENCIA;DIVERGENTE";
    const rows = list.products.map((p) => {
      const desc = (p.description || p.sku || "").replace(/;/g, ",");
      const codigo = p.barcode || "";
      const qtdConferida = p.quantity;
      const qtdPlanilha = p.qtdPlanilha ?? 0;
      const divergencia = qtdPlanilha - qtdConferida;
      const divergente = divergencia !== 0 ? "SIM" : "NAO";
      return `${desc};${codigo};${qtdConferida};${qtdPlanilha};${divergencia};${divergente}`;
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lista_${list.person.replace(/\s/g,"_")}.csv`; a.click();
    URL.revokeObjectURL(url); setDownloadOpen(null);
    toast({ title: "CSV exportado!" });
  };

  const handleShare = async (list: ListData) => {
    let text = `📋 ${list.title}\n👤 ${list.person}\n\n`;
    list.products.forEach((p, i) => { text += `${i + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | Qtd: ${p.quantity}\n`; });
    if (navigator.share) { try { await navigator.share({ title: list.title, text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast({ title: "Lista copiada!" }); }
    setDownloadOpen(null);
  };

  const hydrateProductsForExport = async (list: ListData) => {
    return await Promise.all(
      list.products.map(async (product) => ({
        product,
        photoDataUrl: await resolvePhotoToDataUrl(product),
      }))
    );
  };

  const isFotoAppParaErp = (product: Product) => {
    if (!product.photo && !product.photoAssetId && !product.photoBlob) return false;
    return product.appPhotoWithoutErp || product.erpPhotoMissing || Boolean(product.photoAssetId);
  };

  const getProdutosComFotoAppParaErp = (list: ListData) =>
    list.products.filter(isFotoAppParaErp);

  const enviarFotosAppParaErp = async (list: ListData, perguntarAntes = true): Promise<ListData> => {
    const candidatos = getProdutosComFotoAppParaErp(list);

    if (candidatos.length === 0) {
      if (perguntarAntes) {
        toast({ title: "Nenhuma foto pendente", description: "Esta lista nao tem item vermelho ou foto tirada pelo app." });
      }
      return list;
    }

    if (perguntarAntes && !window.confirm(`Enviar ${candidatos.length} foto(s) para o cadastro do ERP?`)) return list;

    setUploadingPhotoListId(list.id);
    let enviados = 0;
    let naoEncontrados = 0;
    let falhas = 0;
    const produtosAtualizados = new Set<string>();

    try {
      for (const product of candidatos) {
        try {
          const photoDataUrl = await resolvePhotoToDataUrl(product);
          if (!photoDataUrl) {
            falhas += 1;
            console.error("[ERP Foto] Foto pendente nao foi encontrada no cache", {
              produtoCodigo: product.barcode,
              produtoId: product.id,
            });
            continue;
          }

          const response = await fetch(`/api/erp-proxy?action=upload-product-photo&empresa=${encodeURIComponent(list.empresa || "NEWSHOP")}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              codigo: product.barcode,
              photo: photoDataUrl,
            }),
          });

          if (response.ok) {
            enviados += 1;
            produtosAtualizados.add(product.id);
            continue;
          }

          if (response.status === 404) {
            naoEncontrados += 1;
          } else {
            falhas += 1;
            const detailText = await response.text().catch(() => "");
            let detail: unknown = detailText;
            try {
              detail = detailText ? JSON.parse(detailText) : detailText;
            } catch {
              detail = detailText;
            }
            console.error("[ERP Foto] Falha ao enviar foto", {
              produtoCodigo: product.barcode,
              status: response.status,
              detail,
            });
          }
        } catch (error) {
          falhas += 1;
          console.error("[ERP Foto] Erro inesperado ao enviar foto", {
            produtoCodigo: product.barcode,
            error,
          });
        }
      }

      if (produtosAtualizados.size > 0) {
        const updatedList = {
          ...list,
          products: list.products.map((product) =>
            produtosAtualizados.has(product.id)
              ? { ...product, appPhotoWithoutErp: false, erpPhotoMissing: false }
              : product
          ),
        };
        onUpdateList(updatedList);
        return updatedList;
      }

      toast({
        title: "Envio de fotos finalizado",
        description: `Enviadas: ${enviados} | Nao encontrado: ${naoEncontrados} | Falhas: ${falhas}`,
        variant: falhas > 0 ? "destructive" : undefined,
      });
    } finally {
      setUploadingPhotoListId(null);
    }

    return list;
  };

  const exportJSON = async (list: ListData) => {
    const hydratedProducts = await hydrateProductsForExport(list);
    const data = {
      type: "conference-file",
      items: hydratedProducts.map(({ product, photoDataUrl }) => ({
        codigo: product.barcode,
        sku: product.sku || "",
        quantidade: product.quantity,
        photo: photoDataUrl,
      })),
    };
    const fileName = list.title.replace(/[\s/]/g, "").replace(/[^a-zA-Z0-9-áéíóúàèìòùâêîôûãõäëïöüçÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÄËÏÖÜÇ]/g, "");
    const txt = `Codigo\n${list.products.map((p) => p.barcode).join("\n")}\n\n------------------------\n\nCodigo;Quantidade\n${list.products.map((p) => `${p.barcode};${p.quantity}`).join("\n")}`;
    setDownloadOpen(null);
    try {
      const zip = new JSZip();
      zip.file(`${fileName}.json`, JSON.stringify(data, null, 2));
      zip.file(`${fileName}.txt`, txt);
      const blob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([blob], `${fileName}.zip`, { type: "application/zip" });
      if (navigator.share) { try { await navigator.share({ files: [zipFile], title: `Lista - ${list.title}` }); return; } catch (e: any) { if (e?.name === "AbortError") return; } }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `${fileName}.zip`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "ZIP baixado!" });
    } catch {
      toast({ title: "Erro ao gerar ZIP", variant: "destructive" });
    }
  };

  const exportHTML = async (list: ListData) => {
    const hydratedProducts = await hydrateProductsForExport(list);
    const produtosJS = JSON.stringify(hydratedProducts.map(({ product, photoDataUrl }) => ({
      codigo: product.barcode, sku: product.sku || "", quantidade: product.quantity,
      removeTag: product.removeTag ?? false, photo: photoDataUrl,
      appPhotoWithoutErp: isFotoAppParaErp(product),
    })));
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>${list.title} — ${list.person}</title><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;700;900&display=swap" rel="stylesheet"/><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}body{font-family:'DM Sans',sans-serif;background:#f4f3f0;color:#1a1916;padding:32px 24px 60px;}header{max-width:1200px;margin:0 auto 28px;}header h1{font-size:26px;font-weight:900;}header p{font-family:'DM Mono',monospace;font-size:11px;color:#8a8780;margin-top:4px;}.grid{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;}.card{background:#fff;border-radius:16px;border:1.5px solid #e2e0da;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;position:relative;}.card:hover{transform:translateY(-3px);box-shadow:0 12px 32px rgba(0,0,0,.1);}.card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:#e2e0da;}.card.has-tag::before{background:#f0a500;}.card-img{width:100%;aspect-ratio:1;object-fit:cover;display:block;}.card-no-img{width:100%;aspect-ratio:1;background:#f0ede8;display:flex;align-items:center;justify-content:center;font-size:42px;color:#e2e0da;}.card-body{padding:11px 13px 13px;border-top:1.5px solid #e2e0da;}.card-code{font-family:'DM Mono',monospace;font-size:12px;font-weight:500;word-break:break-all;}.card-sku{font-size:11px;color:#8a8780;margin-top:2px;}.card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:8px;}.card-qty strong{font-size:20px;font-weight:900;display:block;line-height:1;}.card-qty span{font-size:10px;color:#8a8780;font-family:'DM Mono',monospace;}.tag{font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;font-family:'DM Mono',monospace;}.tag-etiqueta{background:#fff3e0;color:#a05c00;}.tag-ok{background:#e8f5ee;color:#1e7d4a;}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(80px);background:#1a1916;color:#fff;padding:12px 24px;border-radius:40px;font-size:13px;font-weight:600;opacity:0;transition:all .25s cubic-bezier(.34,1.56,.64,1);pointer-events:none;white-space:nowrap;z-index:999;}.toast.show{opacity:1;transform:translateX(-50%) translateY(0);}</style></head><body><header><h1>📦 ${list.title}</h1><p>👤 ${list.person} · ${list.createdAt.toLocaleDateString("pt-BR")} · Clique no card para copiar o código</p></header><div class="grid" id="grid"></div><div class="toast" id="toast"></div><script>const produtos=${produtosJS};const grid=document.getElementById("grid");produtos.forEach(p=>{const card=document.createElement("div");card.className="card"+(p.removeTag?" has-tag":"");card.onclick=()=>{navigator.clipboard.writeText(p.codigo).then(()=>{const t=document.getElementById("toast");t.textContent="✅ Copiado: "+p.codigo;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2000);});};const img=p.photo?\`<img class="card-img" src="\${p.photo}" alt="\${p.codigo}" loading="lazy">\`:\`<div class="card-no-img">📦</div>\`;card.innerHTML=\`\${img}<div class="card-body"><div class="card-code">\${p.codigo}</div><div class="card-sku">SKU: \${p.sku||"—"}</div><div class="card-footer"><div class="card-qty"><strong>\${p.quantidade}</strong><span>unid</span></div>\${p.removeTag?'<span class="tag tag-etiqueta">Tira etiqueta</span>':'<span class="tag tag-ok">OK</span>'}</div></div>\`;grid.appendChild(card);});</script></body></html>`;
    const finalHtml = html
      .replace(
        ".card{background:#fff;border-radius:16px;border:1.5px solid #e2e0da;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;position:relative;}.card:hover",
        ".card{background:#fff;border-radius:16px;border:1.5px solid #e2e0da;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;position:relative;}.card.app-photo-no-erp{border:3px solid #dc2626;box-shadow:0 0 0 2px rgba(220,38,38,.14);}.card:hover"
      )
      .replace(
        ".card.has-tag::before{background:#f0a500;}.card-img",
        ".card.has-tag::before{background:#f0a500;}.card.app-photo-no-erp::before{background:#dc2626;}.card-img"
      )
      .replace(
        'card.className="card"+(p.removeTag?" has-tag":"");',
        'card.className="card"+(p.removeTag?" has-tag":"")+(p.appPhotoWithoutErp?" app-photo-no-erp":"");'
      );
    const blob = new Blob([finalHtml], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `lista_${list.person.replace(/\s/g, "_")}.html`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadOpen(null);
    toast({ title: "HTML gerado! Abra no navegador do PC." });
  };

  const STORAGE_KEY = "clickup_sent_list_ids";

  const listaJaFoiEnviada = (listId: string): boolean => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.includes(listId);
    } catch { return false; }
  };

  const marcarListaEnviada = (listId: string) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const novos = [...ids, listId].slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novos));
    } catch {}
  };

  const enviarClickUp = async (list: ListData) => {
    // Verifica se a lista tem itens antes de enviar
    if (list.products.length === 0) {
      toast({ 
        title: "❌ Lista vazia", 
        description: "Não é possível enviar listas com 0 itens para o ClickUp.", 
        variant: "destructive" 
      });
      return;
    }
    
    if (list.sentToClickUp || listaJaFoiEnviada(list.id)) {
      toast({ title: "⚠️ Já enviado!", description: "Esta lista já foi enviada ao ClickUp.", variant: "destructive" });
      return;
    }
    if (sendingId === list.id) return;

    setSendingId(list.id);

    try {
      let listaParaEnviar = list;
      const totalFotosErp = getProdutosComFotoAppParaErp(list).length;

      if (
        totalFotosErp > 0 &&
        window.confirm(`Tem ${totalFotosErp} foto(s) tirada(s) pelo app sem foto no ERP. Enviar para o cadastro antes do ClickUp?`)
      ) {
        listaParaEnviar = await enviarFotosAppParaErp(list, false);
      }

      const hydratedProducts = await hydrateProductsForExport(listaParaEnviar);
      const payload: WebhookPayload = {
        flag:        listaParaEnviar.flag ?? "loja",
        empresa:     listaParaEnviar.empresa ?? "",
        pessoa:      listaParaEnviar.person,
        titulo:      listaParaEnviar.title,
        totalItens:  listaParaEnviar.products.length,
        dataCriacao: listaParaEnviar.createdAt.toISOString(),
        produtos:    hydratedProducts.map(({ product, photoDataUrl }) => ({
          barcode:    product.barcode,
          sku:        product.sku || "",
          quantidade: product.quantity,
          removeTag:  product.removeTag ?? false,
          secao:      product.secao || null,
          photo:      photoDataUrl,
        })),
      };

      await enviarParaClickUp(payload);
      marcarListaEnviada(listaParaEnviar.id);
      onUpdateList({ ...listaParaEnviar, status: "green", sentToClickUp: true });
      const dest = `${payload.flag.toUpperCase()} · ${payload.empresa}`;
      toast({ title: `✅ Chegou no ClickUp! [${dest}]`, description: `Lista "${listaParaEnviar.title}" enviada com sucesso.` });
    } catch {
      toast({ title: "❌ Falha no envio", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const openEdit = (list: ListData) => {
    setEditList({ ...list, products: list.products.map((p) => ({ ...p })) });
    setEditIndex(0); setEditProduct({ ...list.products[0] }); setMenuOpen(null);
  };

  const finishEdit = () => {
    if (!editList) return;
    const prods = editList.products.map((p, i) => i === editIndex ? { ...editProduct! } : p);
    onUpdateList({ ...editList, products: prods });
    setEditList(null); setEditProduct(null);
    toast({ title: "Lista atualizada!" });
  };

  const navigateEdit = (dir: number) => {
    if (!editList || !editProduct) return;
    const prods = editList.products.map((p, i) => i === editIndex ? { ...editProduct } : p);
    const updated = { ...editList, products: prods };
    setEditList(updated);
    const next = editIndex + dir;
    if (next >= 0 && next < updated.products.length) { setEditIndex(next); setEditProduct({ ...updated.products[next] }); }
  };

  const dialogStyle = { background: "hsl(var(--card))", borderRadius: 20, border: "1px solid hsl(var(--border))" };

  if (sortedLists.length === 0) {
    return (
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ textAlign: "center", padding: "52px 20px" }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, background: "hsl(var(--muted))", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", color: "hsl(var(--muted-foreground))" }}>
            <FileInput style={{ width: 26, height: 26 }} />
          </div>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 4 }}>Nenhuma lista</p>
          <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Feche uma lista na aba Escanear</p>
        </div>
        <button onClick={onStartConference}
          style={{ width: "100%", height: 48, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", borderRadius: 10, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" }}
        >
          <FileInput style={{ width: 17, height: 17 }} /> Importar para Conferência
        </button>
      </div>
    );
  }

  const estoqueOk = estoqueResultados.filter(r => r.status === "ok").length;
  const estoqueParcial = estoqueResultados.filter(r => r.status === "parcial").length;
  const estoqueZero = estoqueResultados.filter(r => r.status === "zero").length;

  return (
    <div style={{ 
      padding: modoDesktop ? 24 : 20, 
      display: "flex", 
      flexDirection: "column", 
      gap: modoDesktop ? 16 : 12 
    }}>
      {sortedLists.map((list) => {
        const isAnalisando = analisandoId === list.id;
        const consultaBloqueadaEmpresa = isEmpresaSemConsulta(list.empresa);
         return (
          <div key={list.id} style={{ 
            background: "hsl(var(--card))", 
            borderRadius: modoDesktop ? 18 : 16, 
            border: "1px solid hsl(var(--border))", 
            overflow: "hidden", 
            boxShadow: modoDesktop ? "var(--shadow-sm)" : "var(--shadow-xs)", 
            position: "relative" 
          }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: modoDesktop ? 6 : 4, background: STATUS_LEFT[list.status] ?? STATUS_LEFT.yellow }} />

            <div style={{ 
              padding: modoDesktop ? "20px 20px 16px 24px" : "16px 16px 12px 20px", 
              display: "flex", 
              alignItems: "flex-start", 
              justifyContent: "space-between", 
              gap: modoDesktop ? 16 : 12 
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ 
                  fontFamily: "var(--font-serif)", 
                  fontSize: modoDesktop ? 18 : 16, 
                  fontWeight: 700, 
                  color: "hsl(var(--foreground))", 
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap" 
                }}>
                  {list.title}
                </p>
                 {(() => {
                  const emp = list.empresa || list.title.split("—")[0].trim().split(" — ")[0].trim();
                  return (
                    <span style={{
                      display: "inline-block", 
                      marginTop: modoDesktop ? 6 : 4, 
                      padding: modoDesktop ? "3px 10px" : "2px 8px", 
                      borderRadius: modoDesktop ? 6 : 5, 
                      fontSize: modoDesktop ? 10 : 9, 
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)", 
                      letterSpacing: "0.08em", 
                      textTransform: "uppercase",
                      background: "hsl(var(--primary) / 0.1)",
                      color: "hsl(var(--primary))",
                      border: "1px solid hsl(var(--primary) / 0.2)",
                    }}>
                      {list.flag?.toUpperCase() ?? "LOJA"} · {emp}
                    </span>
                  );
                })()}
                <p style={{ 
                  fontSize: modoDesktop ? 13 : 12, 
                  color: "hsl(var(--muted-foreground))", 
                  marginTop: modoDesktop ? 4 : 3 
                }}>
                  👤 {list.person} · {list.createdAt.toLocaleDateString("pt-BR")}
                </p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ 
                  fontFamily: "var(--font-serif)", 
                  fontSize: modoDesktop ? 32 : 28, 
                  fontWeight: 900, 
                  color: "hsl(var(--foreground))", 
                  lineHeight: 1 
                }}>
                  {list.products.length}
                </div>
                <div style={{ 
                  fontFamily: "var(--font-mono)", 
                  fontSize: modoDesktop ? 10 : 9, 
                  color: "hsl(var(--muted-foreground))", 
                  letterSpacing: "0.1em", 
                  textTransform: "uppercase" 
                }}>
                  itens
                </div>
              </div>
            </div>

            <div style={{ 
              display: "flex", 
              gap: modoDesktop ? 10 : 8, 
              padding: modoDesktop ? "12px 20px 8px 24px" : "10px 16px 6px 20px", 
              borderTop: "1px solid hsl(var(--muted))" 
            }}>
              <button onClick={() => openEdit(list)}
                style={{ 
                  flex: 1, 
                  height: modoDesktop ? 40 : 36, 
                  borderRadius: modoDesktop ? 10 : 8, 
                  fontSize: modoDesktop ? 13 : 12, 
                  fontWeight: 600, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: modoDesktop ? 6 : 5, 
                  cursor: "pointer", 
                  background: "hsl(var(--secondary))", 
                  color: "hsl(var(--foreground))", 
                  border: "1px solid hsl(var(--border))" 
                }}>
                <Pencil style={{ width: modoDesktop ? 14 : 13, height: modoDesktop ? 14 : 13 }} /> Editar
              </button>
              <button onClick={() => { setDownloadOpen(list.id); setMenuOpen(null); }}
                style={{ 
                  flex: 1, 
                  height: modoDesktop ? 40 : 36, 
                  borderRadius: modoDesktop ? 10 : 8, 
                  fontSize: modoDesktop ? 13 : 12, 
                  fontWeight: 600, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: modoDesktop ? 6 : 5, 
                  cursor: "pointer", 
                  background: "hsl(var(--secondary))", 
                  color: "hsl(var(--foreground))", 
                  border: "1px solid hsl(var(--border))" 
                }}>
                <Download style={{ width: modoDesktop ? 14 : 13, height: modoDesktop ? 14 : 13 }} /> Baixar
              </button>
              {(() => {
                const jaEnviado = list.sentToClickUp || listaJaFoiEnviada(list.id);
                const enviando  = sendingId === list.id;
                return (
                  <button
                    onClick={() => enviarClickUp(list)}
                    disabled={enviando || jaEnviado}
                    style={{
                      flex: 1, 
                      height: modoDesktop ? 40 : 36, 
                      borderRadius: modoDesktop ? 10 : 8, 
                      fontSize: modoDesktop ? 13 : 12, 
                      fontWeight: 600,
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center", 
                      gap: modoDesktop ? 6 : 5,
                      cursor: (enviando || jaEnviado) ? "not-allowed" : "pointer",
                      opacity: (enviando || jaEnviado) ? 0.75 : 1,
                      transition: "all 0.2s",
                      background: jaEnviado ? "hsl(var(--success))" : enviando ? "hsl(var(--muted))" : "hsl(var(--primary))",
                      color:      jaEnviado ? "hsl(var(--success-foreground))" : enviando ? "hsl(var(--muted-foreground))" : "hsl(var(--primary-foreground))",
                      border: "none",
                    }}
                  >
                    {enviando && <span style={{ 
                      width: modoDesktop ? 12 : 11, 
                      height: modoDesktop ? 12 : 11, 
                      border: "2px solid currentColor", 
                      borderTopColor: "transparent", 
                      borderRadius: "50%", 
                      display: "inline-block", 
                      animation: "spin 0.7s linear infinite" 
                    }} />}
                    {jaEnviado && <span style={{ fontSize: modoDesktop ? 12 : 11 }}>✅</span>}
                    {!enviando && !jaEnviado && <Share2 style={{ width: modoDesktop ? 14 : 13, height: modoDesktop ? 14 : 13 }} />}
                    {enviando ? "Enviando…" : jaEnviado ? "Enviado" : "ClickUp"}
                  </button>
                );
              })()}
              <button onClick={() => { setDeleteConfirm(list.id); setMenuOpen(null); }}
                style={{ flex: 1, height: 36, borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, cursor: "pointer", background: "hsl(var(--destructive) / 0.07)", color: "hsl(var(--destructive))", border: "1px solid hsl(var(--destructive) / 0.2)" }}>
                <Trash2 style={{ width: 13, height: 13 }} /> Excluir
              </button>
            </div>

            <div style={{ padding: "6px 16px 14px 20px" }}>
              <button
                onClick={() => analisarEstoque(list)}
                disabled={isAnalisando || modoLeve || consultaBloqueadaEmpresa}
                style={{
                  width: "100%", height: 40, borderRadius: 10, fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  cursor: (modoLeve || consultaBloqueadaEmpresa) ? "not-allowed" : isAnalisando ? "wait" : "pointer",
                  opacity: (modoLeve || consultaBloqueadaEmpresa) ? 0.65 : 1,
                  background: (modoLeve || consultaBloqueadaEmpresa) ? "hsl(var(--muted))" : "hsl(var(--secondary))",
                  color: (modoLeve || consultaBloqueadaEmpresa) ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
                  border: (modoLeve || consultaBloqueadaEmpresa) ? "1.5px dashed hsl(var(--border))" : "1.5px solid hsl(var(--border))",
                  transition: "all 0.2s",
                }}
              >
                {consultaBloqueadaEmpresa ? (
                  <><AlertTriangle style={{ width: 15, height: 15 }} /> SOYE/FACIL: consulta bloqueada</>
                ) : modoLeve ? (
                  <><AlertTriangle style={{ width: 15, height: 15 }} /> Modo Leve: análise desativada</>
                ) : isAnalisando ? (
                  <><span style={{ width: 14, height: 14, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Buscando no Banco...</>
                ) : (
                  <><Database style={{ width: 15, height: 15 }} /> Analisar Estoque do Sistema</>
                )}
              </button>
            </div>
          </div>
        );
      })}

      <button onClick={onStartConference}
        style={{ width: "100%", height: 48, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", borderRadius: 10, fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", marginTop: 4 }}
      >
        <FileInput style={{ width: 17, height: 17 }} /> Importar para Conferência
      </button>

      {/* ── MODAL ANÁLISE DE ESTOQUE ── */}
      <Dialog open={estoqueDialogOpen} onOpenChange={() => setEstoqueDialogOpen(false)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm" style={{ ...dialogStyle, maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}>
              <Database style={{ width: 20, height: 20, display: "inline", marginRight: 8, verticalAlign: "middle" }} />
              Análise de Estoque
            </DialogTitle>
            <DialogDescription style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              {estoqueListTitle} — {estoqueResultados.length} itens verificados
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "hsl(var(--success) / 0.1)", border: "1px solid hsl(var(--success) / 0.2)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(var(--success))", fontFamily: "var(--font-serif)" }}>{estoqueOk}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--success))", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Tem tudo</div>
            </div>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "hsl(var(--warning) / 0.1)", border: "1px solid hsl(var(--warning) / 0.2)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(var(--warning))", fontFamily: "var(--font-serif)" }}>{estoqueParcial}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--warning))", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Parcial</div>
            </div>
            <div style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: "hsl(var(--destructive) / 0.1)", border: "1px solid hsl(var(--destructive) / 0.2)", textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "hsl(var(--destructive))", fontFamily: "var(--font-serif)" }}>{estoqueZero}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--destructive))", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sem estoque</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {estoqueResultados.map((item, idx) => {
              const cor = {
                ok: { border: "hsl(var(--success) / 0.3)", bg: "hsl(var(--success) / 0.05)", left: "hsl(var(--success))", badge: "hsl(var(--success))", label: "✅ Tem tudo", icon: <CheckCircle2 style={{ width: 13, height: 13 }} /> },
                parcial: { border: "hsl(var(--warning) / 0.3)", bg: "hsl(var(--warning) / 0.05)", left: "hsl(var(--warning))", badge: "hsl(var(--warning))", label: "⚠️ Parcial", icon: <span style={{ fontSize: 11 }}>⚠️</span> },
                zero: { border: "hsl(var(--destructive) / 0.3)", bg: "hsl(var(--destructive) / 0.05)", left: "hsl(var(--destructive))", badge: "hsl(var(--destructive))", label: "❌ Sem estoque", icon: <XCircle style={{ width: 13, height: 13 }} /> },
              }[item.status];

              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, border: `1px solid ${cor.border}`, background: cor.bg, borderLeftWidth: 4, borderLeftColor: cor.left }}>
                  {item.photo && <img src={item.photo} alt={item.codigo} style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", fontFamily: "var(--font-mono)" }}>{item.codigo}</p>
                    {item.sku && <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>SKU: {item.sku}</p>}
                    <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>Lista: <strong>{item.quantidade_lista}</strong></p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800, background: cor.badge, color: "#fff" }}>
                      {cor.icon} {item.quantidade_sistema}
                    </div>
                    <div style={{ fontSize: 9, color: "hsl(var(--muted-foreground))", marginTop: 3, fontFamily: "var(--font-mono)" }}>{cor.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={() => setEstoqueDialogOpen(false)}
              style={{ flex: 1, height: 44, borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button onClick={atualizarListaComEstoque}
              style={{ flex: 1, height: 44, borderRadius: 10, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Database style={{ width: 14, height: 14 }} /> Atualizar Lista
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE ── */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm" style={dialogStyle}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}>Excluir lista?</DialogTitle>
            <DialogDescription style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Ela será marcada como excluída no histórico.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2" style={{ marginTop: 16 }}>
            <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, height: 44, borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} style={{ flex: 1, height: 44, borderRadius: 10, background: "hsl(var(--destructive))", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Excluir</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DOWNLOAD ── */}
      <Dialog open={!!downloadOpen} onOpenChange={() => setDownloadOpen(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm" style={dialogStyle}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}>Compartilhar</DialogTitle>
            <DialogDescription style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Como deseja enviar esta lista?</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            <button onClick={() => { const l = lists.find(x => x.id === downloadOpen); if (l) exportJSON(l); }} style={{ height: 64, borderRadius: 12, background: "#25D366", color: "#fff", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, border: "none", cursor: "pointer", boxShadow: "0 4px 14px rgba(37,211,102,0.3)" }}>
              <svg viewBox="0 0 24 24" style={{ width: 24, height: 24, fill: "white" }}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.524 5.855L.057 23.886a.5.5 0 0 0 .606.61l6.198-1.422A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.9 9.9 0 0 1-5.031-1.373l-.36-.214-3.733.856.888-3.62-.235-.373A9.865 9.865 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/></svg> Enviar pelo WhatsApp
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "hsl(var(--muted-foreground))", fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} /> outras opções <div style={{ flex: 1, height: 1, background: "hsl(var(--border))" }} />
            </div>
            {(() => {
              const l = lists.find(x => x.id === downloadOpen);
              const totalFotosErp = l ? getProdutosComFotoAppParaErp(l).length : 0;
              return (
                <button
                  onClick={() => l && enviarFotosAppParaErp(l)}
                  disabled={!l || uploadingPhotoListId === l.id}
                  style={{ height: 48, borderRadius: 10, background: "hsl(var(--destructive) / 0.1)", color: "hsl(var(--destructive))", border: "1.5px solid hsl(var(--destructive) / 0.35)", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: !l ? "not-allowed" : uploadingPhotoListId === l.id ? "wait" : "pointer", opacity: !l || uploadingPhotoListId === l.id ? 0.65 : 1 }}
                >
                  {l && uploadingPhotoListId === l.id ? "Enviando fotos..." : totalFotosErp > 0 ? `Enviar ${totalFotosErp} foto(s) para ERP` : "Enviar fotos para ERP"}
                </button>
              );
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              {[
                { label: "PDF", Icon: FileText, action: () => { const l = lists.find(x => x.id === downloadOpen); if (l) exportPDF(l); } },
                { label: "CSV", Icon: FileSpreadsheet, action: () => { const l = lists.find(x => x.id === downloadOpen); if (l) exportCSV(l); } },
                { label: "Texto", Icon: Share2, action: () => { const l = lists.find(x => x.id === downloadOpen); if (l) handleShare(l); } },
                { label: "HTML", Icon: Monitor, action: () => { const l = lists.find(x => x.id === downloadOpen); if (l) exportHTML(l); } },
              ].map(({ label, Icon, action }) => (
                <button key={label} onClick={action} style={{ height: 56, borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", fontWeight: 600, fontSize: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}>
                  <Icon style={{ width: 18, height: 18 }} /> {label}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT ── */}
      <Dialog open={!!editList} onOpenChange={() => { setEditList(null); setEditProduct(null); }}>
        <DialogContent aria-describedby={undefined} className="max-w-sm" style={{ ...dialogStyle, maxHeight: "90vh", overflowY: "auto" }}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700 }}>Editar Produtos</DialogTitle>
            <DialogDescription style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Item {editIndex + 1} de {editList?.products.length || 0}</DialogDescription>
          </DialogHeader>
          {editProduct && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
              {editProduct.photo && <img src={editProduct.photo} alt="Produto" style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 10 }} />}
              {[
                { label: "Código de Barras", value: editProduct.barcode, onChange: (v: string) => setEditProduct({ ...editProduct, barcode: v }), type: "text" },
                { label: "SKU", value: editProduct.sku, onChange: (v: string) => setEditProduct({ ...editProduct, sku: v }), type: "text" },
                { label: "Quantidade", value: String(editProduct.quantity), onChange: (v: string) => setEditProduct({ ...editProduct, quantity: Number(v) || 0 }), type: "number" },
              ].map(({ label, value, onChange, type }) => (
                <div key={label}>
                  <label style={LABEL}>{label}</label>
                  <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={S_INPUT} />
                </div>
              ))}
              <div>
                <label style={LABEL}>Tira Etiqueta?</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {([true, false] as const).map((val) => (
                    <button key={String(val)} onClick={() => setEditProduct({ ...editProduct, removeTag: val })} style={{ height: 42, borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", background: editProduct.removeTag === val ? "hsl(var(--primary))" : "hsl(var(--secondary))", color: editProduct.removeTag === val ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))", border: editProduct.removeTag === val ? "2px solid hsl(var(--primary))" : "2px solid hsl(var(--border))" }}>
                      {val ? "SIM" : "NÃO"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button onClick={() => navigateEdit(-1)} disabled={editIndex === 0} style={{ height: 42, padding: "0 14px", borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1.5px solid hsl(var(--border))", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 4, cursor: "pointer", opacity: editIndex === 0 ? 0.35 : 1 }}>
                  <ChevronLeft style={{ width: 16, height: 16 }} /> Ant
                </button>
                {editIndex < (editList?.products.length || 0) - 1 ? (
                  <button onClick={() => navigateEdit(1)} style={{ flex: 1, height: 42, borderRadius: 10, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "none", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer" }}>
                    Próximo <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                ) : (
                  <button onClick={finishEdit} style={{ flex: 1, height: 42, borderRadius: 10, background: "hsl(var(--success))", color: "hsl(var(--success-foreground))", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Salvar Tudo</button>
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
