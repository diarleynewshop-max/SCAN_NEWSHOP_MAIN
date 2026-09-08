import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, PackageCheck, Send, Trash2 } from "lucide-react";
import BarcodeInput from "@/components/BarcodeInput";
import ProductCard, { type ListData, type Product } from "@/components/ProductCard";
import { useProductLookup } from "@/hooks/useProductLookup";
import { useToast } from "@/hooks/use-toast";
import { isDataPhotoUrl } from "@/lib/photoUtils";
import { enviarTransferencia, rotuloLoja, type LojaTransferencia } from "@/lib/transferencias";
import type { PedidoFilaProduto } from "@/lib/pedidosFila";

const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));
const PhotoCapture = lazy(() => import("@/components/PhotoCapture"));

const MIN_DESCRICAO = 15;

interface TransferenciaScannerProps {
  lista: ListData;
  origem: LojaTransferencia;
  destino: LojaTransferencia;
  onAddProduct: (params: {
    barcode: string;
    sku: string;
    photo?: string | null;
    quantity: number;
    secao?: string;
    erpProdutoId?: string;
    erpPhotoMissing?: boolean;
    appPhotoWithoutErp?: boolean;
  }) => Promise<boolean>;
  onDeleteProduct: (productId: string) => void;
  onUpdateProduct: (productId: string, updates: Partial<Product>) => void;
  onEnviada: () => void;
  onCancelar: () => void;
}

/**
 * Montagem dos itens de uma transferencia ja aberta.
 *
 * O produto e consultado no ERP da loja de ORIGEM de proposito: quem separa
 * e a origem, entao e o estoque dela que precisa ter o item.
 */
const TransferenciaScanner = ({
  lista,
  origem,
  destino,
  onAddProduct,
  onDeleteProduct,
  onUpdateProduct,
  onEnviada,
  onCancelar,
}: TransferenciaScannerProps) => {
  const { toast } = useToast();
  const [barcode, setBarcode] = useState("");
  const [descricao, setDescricao] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const { productInfo, loading, error, lookupProduct } = useProductLookup({
    empresa: origem,
    flag: "loja",
  });

  useEffect(() => {
    const nome = productInfo?.descricao || productInfo?.nome_produto;
    if (nome) setDescricao(nome);
  }, [productInfo]);

  // Foto do ERP entra sozinha; so pede foto manual quando o ERP nao tem.
  useEffect(() => {
    if (!productInfo?.imagem) return;
    let cancelado = false;

    const baixarFoto = async () => {
      try {
        const url = productInfo.imagem as string;
        if (isDataPhotoUrl(url)) {
          if (!cancelado) setPhoto((atual) => atual || url);
          return;
        }

        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error("Falha ao baixar foto do ERP: " + resposta.status);

        const contentType = resposta.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const dados = await resposta.json();
          if (typeof dados?.dataUrl === "string" && isDataPhotoUrl(dados.dataUrl) && !cancelado) {
            setPhoto((atual) => atual || dados.dataUrl);
          }
          return;
        }

        const blob = await resposta.blob();
        if (!blob.type.startsWith("image/")) return;
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Falha ao ler foto"));
          reader.readAsDataURL(blob);
        });
        if (!cancelado && isDataPhotoUrl(dataUrl)) setPhoto((atual) => atual || dataUrl);
      } catch (err) {
        console.error("[transferencia] Foto do ERP nao baixou:", err);
      }
    };

    void baixarFoto();
    return () => {
      cancelado = true;
    };
  }, [productInfo?.imagem]);

  const buscar = useCallback(
    (codigo: string) => {
      const termo = codigo.trim();
      if (!termo) return;
      void lookupProduct(termo);
    },
    [lookupProduct]
  );

  const limparRascunho = () => {
    setBarcode("");
    setDescricao("");
    setQuantidade("");
    setPhoto(null);
  };

  const adicionar = async () => {
    const descricaoLimpa = descricao.replace(/\s+/g, " ").trim();

    if (!barcode.trim()) {
      toast({ title: "Informe o codigo", variant: "destructive" });
      return;
    }
    if (descricaoLimpa.length < MIN_DESCRICAO) {
      toast({
        title: "Descricao muito curta",
        description:
          "Informe pelo menos " + MIN_DESCRICAO + " caracteres para quem vai separar achar o item.",
        variant: "destructive",
      });
      return;
    }
    if (!Number(quantidade) || Number(quantidade) <= 0) {
      toast({ title: "Informe a quantidade", variant: "destructive" });
      return;
    }
    if (!photo) {
      toast({ title: "Foto obrigatoria", description: "Adicione uma foto do produto.", variant: "destructive" });
      return;
    }

    const ok = await onAddProduct({
      barcode: barcode.trim(),
      sku: descricaoLimpa,
      photo,
      quantity: Number(quantidade),
      secao: productInfo?.secao,
      erpProdutoId: productInfo?.erpProdutoId,
      erpPhotoMissing: !productInfo?.hasErpImage,
      appPhotoWithoutErp: !productInfo?.hasErpImage && !!photo,
    });
    if (ok) limparRascunho();
  };

  const enviar = async () => {
    if (lista.products.length === 0) {
      toast({ title: "Transferencia vazia", description: "Adicione ao menos 1 item.", variant: "destructive" });
      return;
    }
    if (enviando) return;

    const confirmado = window.confirm(
      "Confirmar transferencia?\n\n" +
        rotuloLoja(origem) +
        " separa e manda\n" +
        rotuloLoja(destino) +
        " recebe\n\n" +
        lista.products.length +
        " item(ns)."
    );
    if (!confirmado) return;

    setEnviando(true);
    try {
      const produtos: PedidoFilaProduto[] = lista.products.map((produto) => ({
        barcode: produto.barcode,
        sku: produto.sku,
        description: produto.sku,
        quantidade: produto.quantity,
        removeTag: false,
        secao: produto.secao ?? null,
        photo: produto.photo,
        erpProdutoId: produto.erpProdutoId,
        appPhotoWithoutErp: produto.appPhotoWithoutErp,
      }));

      await enviarTransferencia({
        origem,
        destino,
        pessoa: lista.person,
        titulo: lista.title,
        // Mesma lista reenviada nao duplica pedido (o conference_id e unico).
        conferenceId: "transferencia-" + lista.id,
        dataCriacao: lista.createdAt.toISOString(),
        produtos,
      });

      toast({
        title: "Transferencia enviada",
        description:
          "Caiu na conferencia da " + rotuloLoja(origem) + ", que separa e manda para " + rotuloLoja(destino) + ".",
      });
      onEnviada();
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Falha ao enviar a transferencia.";
      toast({ title: "Erro ao enviar", description: mensagem, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onDetected={(codigo: string) => {
              setShowScanner(false);
              setBarcode(codigo);
              buscar(codigo);
            }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Item para {rotuloLoja(origem)} separar
        </p>

        <BarcodeInput
          value={barcode}
          onChange={setBarcode}
          onScanPress={() => setShowScanner(true)}
          onEnterPress={() => buscar(barcode)}
          placeholder="Codigo de barras ou SKU"
        />

        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando no estoque da {rotuloLoja(origem)}...
          </p>
        )}
        {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
        {productInfo && (
          <p className="text-xs text-muted-foreground">
            Estoque na {rotuloLoja(origem)}:{" "}
            <span className="font-bold text-foreground">{productInfo.estoque}</span>
            {productInfo.secao ? " · " + productInfo.secao : ""}
          </p>
        )}

        <div>
          <label className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Descricao do item
          </label>
          <input
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            placeholder="Ex: mochila costas preta 3 bolsos"
            className="h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Quantidade
          </label>
          <input
            value={quantidade}
            onChange={(event) => setQuantidade(event.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="0"
            className="h-11 w-full rounded-lg border border-input bg-secondary px-3 text-sm font-bold text-foreground outline-none focus:border-primary"
          />
        </div>

        <Suspense fallback={null}>
          <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
        </Suspense>

        <button
          type="button"
          onClick={() => void adicionar()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground"
        >
          <PackageCheck className="h-4 w-4" /> Adicionar item
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Itens ({lista.products.length})
          </p>
          <button
            type="button"
            onClick={onCancelar}
            className="flex items-center gap-1 text-[11px] font-bold text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Cancelar transferencia
          </button>
        </div>

        {lista.products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Nenhum item ainda. Escaneie o primeiro produto acima.
          </div>
        ) : (
          lista.products.map((produto) => (
            <ProductCard
              key={produto.id}
              product={produto}
              onDelete={onDeleteProduct}
              onUpdate={onUpdateProduct}
            />
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() => void enviar()}
        disabled={enviando || lista.products.length === 0}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-black uppercase tracking-wide text-background disabled:opacity-50"
      >
        {enviando ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Enviando...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> {rotuloLoja(origem)}
            <ArrowRight className="h-4 w-4" /> {rotuloLoja(destino)}
          </>
        )}
      </button>
    </div>
  );
};

export default TransferenciaScanner;
