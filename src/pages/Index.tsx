import { useState, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, GitCompare, Loader2, AlertCircle, ShoppingCart, BadgeDollarSign, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import ProductCard, { type Product } from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
import { useProductLookup } from "@/hooks/useProductLookup";
import { useToast } from "@/hooks/use-toast";
import { getLightModeEnabled } from "@/lib/lightMode";
import { getHistoricoComprasEnabled } from "@/lib/historicoCompras";
import { consultarHistoricoItem } from "@/lib/historicoItem";
import { hasPermission } from "@/lib/accessControl";
import { loginEhSefuly } from "@/lib/lojaFeatures";
import { PdvClienteModal } from "@/components/PdvClienteModal";
import type { ClientePdv } from "@/lib/erpClientes";
interface HistoricoItemOcorrencia {
  data: string;
  dataFormatada: string;
  status: string;
  listeiro: string;
  titulo: string;
}
import { blobToDataUrl, isDataPhotoUrl } from "@/lib/photoUtils";
import { getCompanyLogo, getCompanyName } from "@/lib/companyTheme";
import type { VarejoFacilProductOption } from "@/lib/varejoFacilIntegration";

const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));
const PhotoCapture = lazy(() => import("@/components/PhotoCapture"));
const ListHistory = lazy(() => import("@/components/ListHistory"));
const ConferenceView = lazy(() => import("@/components/ConferenceView"));

const LAZY_FALLBACK = (
  <div style={{ padding: 20, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
    Carregando...
  </div>
);

const S = {
  inputBase: {
    width: "100%",
    height: 48,
    padding: "0 16px",
    borderRadius: 10,
    border: "1.5px solid hsl(var(--border))",
    background: "hsl(var(--secondary))",
    color: "hsl(var(--foreground))",
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    fontWeight: 500,
    outline: "none",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,
  label: {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 500,
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: "hsl(var(--muted-foreground))",
    marginBottom: 6,
    display: "block",
  } as React.CSSProperties,
  btnPrimary: {
    width: "100%",
    height: 52,
    background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))",
    border: "none",
    borderRadius: 10,
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    transition: "all 0.18s",
    boxShadow: "var(--shadow-md)",
  } as React.CSSProperties,
};

const MIN_ITEM_DESCRIPTION_CHARS = 15;

function normalizarDescricaoItem(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isConsultaBloqueada(flag?: string | null): boolean {
  return (flag ?? "loja").toLowerCase() !== "loja";
}

const DESCONTO_LIVRE_PDV = 20;
const DESCONTO_MAXIMO_PDV = 50;

function formatarMoeda(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function normalizarDescontoPercentual(value: unknown): number {
  const numero = Number(value ?? 0);
  if (!Number.isFinite(numero) || numero <= 0) return 0;
  return Math.min(DESCONTO_MAXIMO_PDV, Math.round(numero * 100) / 100);
}

function totalProduto(product: Product) {
  const quantidade = Number(product.quantity ?? 0);
  const preco = Number(product.precoUnitario ?? 0);
  const descontoPercentual = normalizarDescontoPercentual(product.descontoPercentual);
  const bruto = Math.round(quantidade * preco * 100) / 100;
  const desconto = Math.round((bruto * descontoPercentual / 100) * 100) / 100;
  return {
    quantidade,
    preco,
    descontoPercentual,
    bruto,
    desconto,
    liquido: Math.max(0, Math.round((bruto - desconto) * 100) / 100),
  };
}

async function compactImageBlobToDataUrl(blob: Blob): Promise<string> {
  if (!blob.type.startsWith("image/")) return blobToDataUrl(blob);

  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.crossOrigin = "anonymous";

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Falha ao carregar foto do ERP"));
      image.src = objectUrl;
    });

    const maxEdge = 900;
    const currentMaxEdge = Math.max(image.width, image.height);
    const scale = currentMaxEdge > maxEdge ? maxEdge / currentMaxEdge : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return blobToDataUrl(blob);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.65);
  } finally {
    image.src = "";
    URL.revokeObjectURL(objectUrl);
  }
}

function labelStatusCompras(status: string): string {
  const s = status.toLowerCase().trim();
  if (s === "to do" || s === "a fazer") return "Aguardando Análise";
  if (s.includes("produto_bom") || s.includes("produto bom")) return "Tem no Galpão";
  if (s.includes("produto_ruim") || s.includes("produto ruim")) return "Produto Ruim";
  if (s.includes("fazer_pedido") || s.includes("fazer pedido")) return "Pedido em Aberto";
  if (s.includes("pedido_andamento") || s.includes("andamento")) return "Em Andamento";
  if (s.includes("compra_realizada") || s.includes("compra realizada")) return "Compra Realizada";
  if (s.includes("conclu")) return "Concluído";
  return status;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");
  const currentLogin = obterLoginSalvo();
  const isSefuly = loginEhSefuly(currentLogin);

  const [barcode, setBarcode] = useState(() => sessionStorage.getItem("scan_barcode") ?? "");
  const [semEAN, setSemEAN] = useState(() => (sessionStorage.getItem("scan_barcode") ?? "").startsWith("SEM_EAN_"));
  const [sku, setSku] = useState(() => sessionStorage.getItem("scan_sku") ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(() => sessionStorage.getItem("scan_quantity") ?? "");
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" && hasPermission(currentLogin, "conferencia")
      ? "conference"
      : initialTab === "list" && hasPermission(currentLogin, "lista")
        ? "list"
        : "scan"
  );
  const [clientePedido, setClientePedido] = useState<ClientePdv | null>(null);
  const [mostrarClienteModal, setMostrarClienteModal] = useState(false);
  const [mostrarDescontoModal, setMostrarDescontoModal] = useState(false);
  const [descontosPedido, setDescontosPedido] = useState<Record<string, number>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [photoProductId, setPhotoProductId] = useState<string | null>(null);
  const [selectedProductOption, setSelectedProductOption] = useState<VarejoFacilProductOption | null>(null);
  const [imageFailedOptions, setImageFailedOptions] = useState<Record<string, boolean>>({});

  const [modoDesktop, setModoDesktop] = useState(() => {
    // Sem preferencia salva, segue o tamanho real do aparelho (PC >= 1024px).
    const salvo = localStorage.getItem("modoDesktop");
    if (salvo === "true") return true;
    if (salvo === "false") return false;
    return typeof window !== "undefined" && window.innerWidth >= 1024;
  });
  const [modoLeve, setModoLeve] = useState(() => getLightModeEnabled());
  const [popupCompras, setPopupCompras] = useState<{
    ocorrencias: HistoricoItemOcorrencia[];
    carregando: boolean;
    emConferencia: { titulo: string; pessoa: string; status: string } | null;
    conferidoRecente: { dataFormatada: string; diasAtras: number } | null;
  } | null>(null);
  const [historicoCompletoAberto, setHistoricoCompletoAberto] = useState(false);
  // Bloqueio persistente (independe do popup estar aberto): item em pedido nao
  // concluido barra a inclusao no novo pedido.
  const [bloqueioConferencia, setBloqueioConferencia] = useState<{ titulo: string; pessoa: string } | null>(null);
  const popupMostradoParaRef = useRef<string | null>(null);
  const confirmandoOpcaoRef = useRef(false);

  const { lists, activeList, openList, closeList, addProduct, updateList, deleteProduct, updateProduct, updateProductPhoto, moveProductToTop } = useInventory(
    currentLogin?.usuarioId ?? currentLogin?.login ?? null
  );
  const lookupEmpresa = activeList?.empresa ?? currentLogin?.empresa;
  const lookupFlag = activeList?.flag ?? currentLogin?.flag ?? "loja";
  const logoEmpresa = getCompanyLogo(lookupEmpresa);
  const nomeEmpresaLogo = getCompanyName(lookupEmpresa);
  const consultaBloqueadaPorFlag = isConsultaBloqueada(lookupFlag);
  const { productInfo, productOptions, loading, error, lookupProduct, selectProductOption, clearProductOptions } = useProductLookup({
    enabled: !consultaBloqueadaPorFlag,
    empresa: lookupEmpresa,
    flag: lookupFlag,
  });

  useEffect(() => {
    if (!isSefuly) {
      setClientePedido(null);
      setMostrarClienteModal(false);
      setMostrarDescontoModal(false);
      return;
    }
    if (activeList?.clientePdv) setClientePedido(activeList.clientePdv);
  }, [isSefuly, activeList?.id, activeList?.clientePdv]);

  useEffect(() => {
    if (!activeList) setMostrarDescontoModal(false);
  }, [activeList?.id]);

  // Consulta o historico do item no Supabase (em paralelo com o ERP) e decide
  // barrar (item em pedido nao concluido) / avisar (conferido <=7 dias) / mostrar
  // o historico. Popup abre so quando ha algo relevante.
  const fetchHistoricoItem = useCallback(
    async (code: string) => {
      const cod = code.trim();
      if (!cod || consultaBloqueadaPorFlag) {
        setPopupCompras(null);
        setHistoricoCompletoAberto(false);
        setBloqueioConferencia(null);
        return;
      }
      try {
        const r = await consultarHistoricoItem(lookupEmpresa, cod);
        setBloqueioConferencia(
          r.emConferencia ? { titulo: r.emConferencia.titulo, pessoa: r.emConferencia.pessoa } : null
        );
        if (r.emConferencia || r.ocorrencias.length > 0) {
          setHistoricoCompletoAberto(false);
          setPopupCompras({
            ocorrencias: r.ocorrencias,
            carregando: false,
            emConferencia: r.emConferencia,
            conferidoRecente: r.conferidoRecente,
          });
        } else {
          setPopupCompras(null);
          setHistoricoCompletoAberto(false);
        }
      } catch (err) {
        console.error("[Index] Falha ao consultar historico do item:", err);
        setPopupCompras(null);
        setHistoricoCompletoAberto(false);
        setBloqueioConferencia(null);
      }
    },
    [lookupEmpresa, consultaBloqueadaPorFlag]
  );

  const startProductLookup = useCallback(
    (code: string) => {
      const normalizedCode = code.trim();
      if (!normalizedCode) return;
      // Duas consultas em paralelo: ERP (foto/preco) + historico (Supabase).
      lookupProduct(normalizedCode);
      void fetchHistoricoItem(normalizedCode);
    },
    [lookupProduct, fetchHistoricoItem]
  );

  useEffect(() => {
    sessionStorage.setItem("scan_barcode", barcode);
  }, [barcode]);

  useEffect(() => {
    sessionStorage.setItem("scan_sku", sku);
  }, [sku]);

  useEffect(() => {
    sessionStorage.setItem("scan_quantity", quantity);
  }, [quantity]);

  useEffect(() => {
    sessionStorage.removeItem("scan_photo");
  }, []);

  useEffect(() => {
    const handleStorageChange = () => {
      setModoDesktop(localStorage.getItem("modoDesktop") === "true");
      setModoLeve(getLightModeEnabled());
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Limpa popup/bloqueio quando o codigo e apagado (o fetch do historico e
  // disparado em startProductLookup, ao escanear/confirmar o codigo).
  useEffect(() => {
    if (!barcode.trim()) {
      popupMostradoParaRef.current = null;
      setPopupCompras(null);
      setHistoricoCompletoAberto(false);
      setBloqueioConferencia(null);
    }
  }, [barcode]);

  useEffect(() => {
    if (!consultaBloqueadaPorFlag) return;
    setShowProductInfo(false);
  }, [consultaBloqueadaPorFlag]);

  useEffect(() => {
    if (!productInfo) return;
    const descricao = productInfo.descricao || productInfo.nome_produto;
    if (descricao) setSku(descricao);
  }, [productInfo]);

  useEffect(() => {
    if (!productInfo?.imagem || modoLeve) return;

    let cancelled = false;

    const baixarFotoProduto = async () => {
      try {
        const dataUrl = isDataPhotoUrl(productInfo.imagem)
          ? productInfo.imagem
          : await fetch(productInfo.imagem).then(async (response) => {
              const contentType = response.headers.get("content-type") || "";
              if (!response.ok) {
                const detail = contentType.includes("application/json")
                  ? await response.json().catch(() => null)
                  : await response.text().catch(() => "");
                console.error("Erro detalhado da foto ERP:", detail);
                if (detail) {
                  console.error(
                    "Erro detalhado da foto ERP JSON:",
                    typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)
                  );
                }
                throw new Error(`Falha ao baixar foto (${response.status})`);
              }
              if (contentType.includes("application/json")) {
                const data = await response.json();
                if (typeof data?.dataUrl === "string" && isDataPhotoUrl(data.dataUrl)) {
                  return data.dataUrl;
                }
                throw new Error(data?.error || "Proxy nao retornou dataUrl de imagem.");
              }
              const blob = await response.blob();
              if (!blob.type.startsWith("image/")) {
                throw new Error(`Resposta nao e imagem (${blob.type || "sem content-type"})`);
              }
              return compactImageBlobToDataUrl(blob);
            });

        if (cancelled) return;
        const compactedDataUrl = isDataPhotoUrl(dataUrl)
          ? await compactImageBlobToDataUrl(await fetch(dataUrl).then((response) => response.blob()))
          : dataUrl;
        if (!isDataPhotoUrl(compactedDataUrl)) {
          throw new Error("Foto baixada nao gerou data:image valido.");
        }
        setPhoto((currentPhoto) => currentPhoto || compactedDataUrl);
      } catch (error) {
        console.error("Foto do ERP nao foi baixada:", error);
      }
    };

    void baixarFotoProduto();

    return () => {
      cancelled = true;
    };
  }, [productInfo?.imagem, modoLeve]);

  useEffect(() => {
    setSelectedProductOption(null);
    setImageFailedOptions({});
  }, [productOptions]);

  const handleBarcodeDetected = useCallback(
    (code: string) => {
      setShowScanner(false);
      setBarcode(code);
      if (consultaBloqueadaPorFlag) {
        toast({ title: "Consulta bloqueada", description: "Consulta de produto ativa apenas para flag LOJA." });
        return;
      }
      setShowProductInfo(true);
      startProductLookup(code);
    },
    [startProductLookup, consultaBloqueadaPorFlag, toast]
  );

  const confirmarProductOption = useCallback(
    async (option: VarejoFacilProductOption | null) => {
      if (!option || loading || confirmandoOpcaoRef.current) return;
      confirmandoOpcaoRef.current = true;
      try {
        setBarcode(option.codigo_barras);
        setSku(option.descricao);
        setShowProductInfo(true);
        await selectProductOption(option);
      } finally {
        confirmandoOpcaoRef.current = false;
      }
    },
    [loading, selectProductOption]
  );

  const handleCloseList = () => {
    if (!activeList) return;
    if (!window.confirm(isSefuly ? "Fechar pedido atual?" : "Fechar lista atual?")) return;
    closeList();
    if (isSefuly) {
      setView("list");
      setClientePedido(null);
    }
    toast({ title: isSefuly ? "Pedido fechado" : "Lista fechada" });
  };

  const handleOpenList = () => {
    const login = obterLoginSalvo();
    const isCD = login?.flag === "cd";
    const isSefulyLogin = loginEhSefuly(login);
    const clienteNome = clientePedido?.nome?.trim() ?? "";
    const titulo = isSefulyLogin ? (clienteNome ? `Pedido - ${clienteNome}` : "Pedido") : isCD ? "CD" : login?.tituloPadrao?.trim();

    if (isSefulyLogin && !clientePedido) {
      setMostrarClienteModal(true);
      toast({ title: "Selecione o cliente", description: "O pedido da SEFULY precisa de cliente para ir ao PDV.", variant: "destructive" });
      return;
    }

    if (!login?.nomePessoa || (!isCD && !isSefulyLogin && !titulo)) {
      toast({
        title: "Configure seu perfil antes",
        description: isCD ? "Preencha o nome da pessoa." : "Preencha a secao e o nome da pessoa.",
        variant: "destructive",
      });
      return;
    }

    const ok = openList({
      title: titulo || "CD",
      person: login.nomePessoa,
      flag: isCD ? "cd" : "loja",
      empresa: login.empresa,
      clientePdv: isSefulyLogin ? clientePedido : null,
    });

    if (ok) {
      toast({ title: isSefulyLogin ? "Pedido aberto" : "Lista aberta", description: `${titulo || "CD"} · ${login.nomePessoa}` });
    }
  };

  const setDraftPhoto = useCallback((nextPhoto: string) => {
    setPhoto(nextPhoto);
  }, []);

  const clearDraftPhoto = useCallback(() => {
    setPhoto(null);
  }, []);

  const handleAdd = async () => {
    if (!activeList) {
      toast({ title: "Abra uma lista primeiro", variant: "destructive" });
      return;
    }
    if (bloqueioConferencia) {
      toast({
        title: "🚫 Item em conferência",
        description: `Já existe um pedido em aberto (${bloqueioConferencia.titulo}). Não dá pra pedir de novo até concluir.`,
        variant: "destructive",
      });
      return;
    }

    const descricaoItem = normalizarDescricaoItem(sku);
    if (descricaoItem.length < MIN_ITEM_DESCRIPTION_CHARS) {
      toast({
        title: "Descricao muito curta",
        description: `Informe pelo menos ${MIN_ITEM_DESCRIPTION_CHARS} caracteres com referencia do item. Ex: espelho, mochila, cor ou modelo.`,
        variant: "destructive",
      });
      return;
    }

    if (!photo) {
      toast({
        title: "Foto obrigatoria",
        description: "Adicione uma foto do produto antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    const ok = await addProduct({
      barcode,
      sku: descricaoItem,
      photo,
      quantity: Number(quantity),
      secao: productInfo?.secao,
      erpProdutoId: productInfo?.erpProdutoId,
      precoUnitario: productInfo?.precoVarejo || productInfo?.preco || null,
      erpPhotoMissing: !(productInfo?.hasErpImage),
      appPhotoWithoutErp: !(productInfo?.hasErpImage) && !!photo,
    });
    if (!ok) return;

    setBarcode("");
    setSemEAN(false);
    setSku("");
    clearDraftPhoto();
    setQuantity("");
    sessionStorage.removeItem("scan_barcode");
    sessionStorage.removeItem("scan_sku");
    sessionStorage.removeItem("scan_photo");
    sessionStorage.removeItem("scan_quantity");
  };

  const productCount = activeList?.products.length ?? 0;

  const produtosDescontoPedido = activeList?.products.map((product) => {
    const descontoPercentual = normalizarDescontoPercentual(descontosPedido[product.id] ?? product.descontoPercentual);
    return {
      product,
      totais: totalProduto({ ...product, descontoPercentual }),
    };
  }) ?? [];
  const totalBrutoPedido = produtosDescontoPedido.reduce((sum, item) => sum + item.totais.bruto, 0);
  const totalDescontoPedido = produtosDescontoPedido.reduce((sum, item) => sum + item.totais.desconto, 0);
  const totalFinalPedido = produtosDescontoPedido.reduce((sum, item) => sum + item.totais.liquido, 0);
  const temDescontoAltoPedido = produtosDescontoPedido.some((item) => item.totais.descontoPercentual > DESCONTO_LIVRE_PDV);

  const abrirDescontoPedido = () => {
    if (!isSefuly) return;
    if (!activeList || activeList.products.length === 0) {
      toast({ title: "Adicione produto primeiro", description: "O desconto entra nos itens do pedido aberto.", variant: "destructive" });
      return;
    }

    const descontosAtuais: Record<string, number> = {};
    activeList.products.forEach((product) => {
      descontosAtuais[product.id] = normalizarDescontoPercentual(product.descontoPercentual);
    });
    setDescontosPedido(descontosAtuais);
    setMostrarDescontoModal(true);
  };

  const alterarDescontoPedido = (productId: string, value: unknown) => {
    setDescontosPedido((current) => ({
      ...current,
      [productId]: normalizarDescontoPercentual(value),
    }));
  };

  const salvarDescontoPedido = () => {
    if (!activeList) return;

    const products = activeList.products.map((product) => ({
      ...product,
      descontoPercentual: normalizarDescontoPercentual(descontosPedido[product.id] ?? product.descontoPercentual),
    }));

    updateList({ ...activeList, products });
    setMostrarDescontoModal(false);

    const qtdAcima = products.filter((product) => normalizarDescontoPercentual(product.descontoPercentual) > DESCONTO_LIVRE_PDV).length;
    toast({
      title: "Desconto salvo",
      description: qtdAcima > 0 ? `${qtdAcima} item(ns) acima de 20%; o envio ao PDV vai pedir confirmacao.` : "Desconto aplicado no pedido aberto.",
    });
  };

  const handleClientePedidoSelecionado = (cliente: ClientePdv) => {
    setClientePedido(cliente);
    setMostrarClienteModal(false);
    if (activeList) updateList({ ...activeList, clientePdv: cliente });
  };

  const handleTabChange = (key: "scan" | "list" | "conference" | "compras" | "consultaPreco") => {
    if (key === "compras") {
      navigate("/compras");
      return;
    }
    if (key === "consultaPreco") {
      navigate("/consulta-preco");
      return;
    }
    setView(key);
  };

  const extraTab = !isSefuly && hasPermission(currentLogin, "compras") ? [{ key: "compras" as const, label: "COMPRADOR", Icon: ShoppingCart }] : [];
  const tabs = [
    ...(hasPermission(currentLogin, "consulta_preco") ? [{ key: "consultaPreco" as const, label: "Consulta", Icon: BadgeDollarSign }] : []),
    ...(hasPermission(currentLogin, "scanner") ? [{ key: "scan" as const, label: isSefuly ? "Abrir pedido" : "Escanear", Icon: ScanBarcode }] : []),
    ...(hasPermission(currentLogin, "lista") ? [{ key: "list" as const, label: isSefuly ? "Pedidos" : "Lista", Icon: ClipboardList }] : []),
    ...(hasPermission(currentLogin, "conferencia") ? [{ key: "conference" as const, label: "Conferencia", Icon: GitCompare }] : []),
    ...extraTab,
  ];

  const flagBadge = { bg: "hsl(var(--primary)/0.10)", border: "hsl(var(--primary)/0.20)", text: "hsl(var(--primary))" };
  const descricaoItemLength = normalizarDescricaoItem(sku).length;
  const descricaoItemInvalida = descricaoItemLength > 0 && descricaoItemLength < MIN_ITEM_DESCRIPTION_CHARS;

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-6xl mx-auto" : "max-w-md mx-auto"}`} style={{ background: "hsl(var(--background))" }}>
      <PdvClienteModal
        open={mostrarClienteModal}
        empresa={currentLogin?.empresa ?? ""}
        onCancel={() => setMostrarClienteModal(false)}
        onSelect={handleClientePedidoSelecionado}
        createButtonLabel="Cadastrar e usar"
      />

      {mostrarDescontoModal && activeList && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(0,0,0,0.58)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: modoDesktop ? 24 : 10,
          }}
          onClick={() => setMostrarDescontoModal(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 620,
              maxHeight: "calc(100dvh - 20px)",
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 14,
              boxShadow: "0 18px 50px rgba(0,0,0,0.30)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: modoDesktop ? "18px 20px 14px" : "14px 14px 10px", borderBottom: "1px solid hsl(var(--border))", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
                  Pedido aberto
                </p>
                <h3 style={{ fontSize: modoDesktop ? 20 : 17, fontWeight: 850, color: "hsl(var(--foreground))" }}>
                  DESCONTO
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMostrarDescontoModal(false)}
                style={{ width: 36, height: 36, borderRadius: 9, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 18 }}
              >
                x
              </button>
            </div>

            <div style={{ padding: modoDesktop ? 16 : 10, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
              {produtosDescontoPedido.map(({ product, totais }) => (
                <div
                  key={product.id}
                  style={{
                    border: totais.descontoPercentual > DESCONTO_LIVRE_PDV ? "1.5px solid hsl(var(--warning) / 0.55)" : "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    borderRadius: 10,
                    padding: modoDesktop ? 12 : 10,
                    display: "grid",
                    gridTemplateColumns: modoDesktop ? "64px minmax(0,1fr) 170px" : "52px minmax(0,1fr)",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  {product.photo ? (
                    <img src={product.photo} alt={product.sku} style={{ width: modoDesktop ? 60 : 50, height: modoDesktop ? 60 : 50, borderRadius: 8, objectFit: "cover", border: "1px solid hsl(var(--border))" }} />
                  ) : (
                    <div style={{ width: modoDesktop ? 60 : 50, height: modoDesktop ? 60 : 50, borderRadius: 8, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))" }} />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: modoDesktop ? 14 : 13, fontWeight: 800, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {product.sku}
                    </p>
                    <p style={{ marginTop: 3, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                      {totais.quantidade} x {formatarMoeda(totais.preco)} = {formatarMoeda(totais.bruto)}
                    </p>
                    {!modoDesktop && (
                      <p style={{ marginTop: 3, fontSize: 12, fontWeight: 800, color: "hsl(var(--foreground))" }}>
                        Final: {formatarMoeda(totais.liquido)}
                      </p>
                    )}
                  </div>

                  <div style={{ gridColumn: modoDesktop ? "auto" : "1 / -1", display: "grid", gridTemplateColumns: "1fr 76px", gap: 8, alignItems: "center" }}>
                    <input
                      type="range"
                      min={0}
                      max={DESCONTO_MAXIMO_PDV}
                      step={1}
                      value={totais.descontoPercentual}
                      onChange={(event) => alterarDescontoPedido(product.id, event.target.value)}
                      style={{ width: "100%" }}
                    />
                    <input
                      type="number"
                      min={0}
                      max={DESCONTO_MAXIMO_PDV}
                      step={1}
                      inputMode="decimal"
                      value={totais.descontoPercentual}
                      onChange={(event) => alterarDescontoPedido(product.id, event.target.value)}
                      style={{
                        height: 38,
                        borderRadius: 8,
                        border: "1.5px solid hsl(var(--border))",
                        background: "hsl(var(--secondary))",
                        color: "hsl(var(--foreground))",
                        textAlign: "center",
                        fontSize: 16,
                        fontWeight: 800,
                        outline: "none",
                      }}
                    />
                    {modoDesktop && (
                      <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "right" }}>
                        Desc. {formatarMoeda(totais.desconto)} | Final {formatarMoeda(totais.liquido)}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {temDescontoAltoPedido && (
                <div style={{ borderRadius: 10, border: "1px solid hsl(var(--warning) / 0.4)", background: "hsl(var(--warning) / 0.10)", padding: 10, display: "flex", gap: 8, alignItems: "center" }}>
                  <AlertCircle style={{ width: 17, height: 17, color: "hsl(var(--warning))", flexShrink: 0 }} />
                  <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                    Tem desconto acima de 20%. No envio ao PDV, o resumo final vai exigir confirmacao.
                  </p>
                </div>
              )}
            </div>

            <div style={{ borderTop: "1px solid hsl(var(--border))", padding: modoDesktop ? "14px 18px" : "12px 10px", display: "grid", gridTemplateColumns: modoDesktop ? "1fr auto auto" : "1fr", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "hsl(var(--muted-foreground))", fontWeight: 700 }}>
                <span>Bruto {formatarMoeda(totalBrutoPedido)}</span>
                <span>Desconto {formatarMoeda(totalDescontoPedido)}</span>
                <span style={{ color: "hsl(var(--foreground))" }}>Final {formatarMoeda(totalFinalPedido)}</span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarDescontoModal(false)}
                style={{ height: 40, borderRadius: 9, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", padding: "0 14px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarDescontoPedido}
                style={{ height: 40, borderRadius: 9, border: "none", background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", padding: "0 16px", fontSize: 12, fontWeight: 850, cursor: "pointer" }}
              >
                Salvar desconto
              </button>
            </div>
          </div>
        </div>
      )}

      <header
        style={{
          background: "hsl(var(--primary))",
          padding: modoDesktop ? "18px 32px" : "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate("/")} style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
            <ArrowLeft style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} />
          </button>
          <img src={logoEmpresa} alt={nomeEmpresaLogo} onClick={() => navigate("/")} style={{ height: modoDesktop ? 38 : 34, objectFit: "contain", cursor: "pointer" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: modoDesktop ? 10 : 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            {activeList ? activeList.title : "Pedido"}
          </p>
          {activeList && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: modoDesktop ? 12 : 11, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>{productCount} produto(s)</p>
          )}
        </div>
      </header>

      {activeList && (
        <div
          style={{
            background: "hsl(38 92% 50% / 0.12)",
            borderBottom: "1.5px solid hsl(38 92% 50% / 0.2)",
            padding: modoDesktop ? "12px 32px" : "10px 20px",
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--warning))", flexShrink: 0, display: "inline-block" }} />
          <p style={{ flex: "1 1 150px", minWidth: 0, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            {activeList.title}
            <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}> . {activeList.person}</span>
          </p>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: flagBadge.bg, border: `1px solid ${flagBadge.border}`, color: flagBadge.text }}>
            {activeList.flag?.toUpperCase() ?? "LOJA"} . {activeList.empresa ? activeList.empresa.split(" ")[0] : ""}
          </span>
          {isSefuly && activeList.products.length > 0 && (
            <button
              type="button"
              onClick={abrirDescontoPedido}
              data-tut="desconto-pedido"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "hsl(var(--primary))",
                background: "hsl(var(--primary) / 0.08)",
                border: "1px solid hsl(var(--primary) / 0.28)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                fontWeight: 850,
              }}
            >
              DESCONTO
            </button>
          )}
          <button
            onClick={handleCloseList}
            data-tut="fechar-lista"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "hsl(var(--destructive))", background: "transparent", border: "1px solid hsl(var(--destructive) / 0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Fechar
          </button>
        </div>
      )}

      <div style={{ background: "#fff", borderBottom: "1px solid hsl(var(--border))", display: "flex", padding: modoDesktop ? "0 32px" : "0 8px" }}>
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            style={{
              flex: 1,
              padding: modoDesktop ? "14px 0 12px" : "11px 0 9px",
              fontSize: modoDesktop ? 12 : 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              display: "flex",
              flexDirection: modoDesktop ? "row" : "column",
              alignItems: "center",
              gap: modoDesktop ? 8 : 4,
              justifyContent: "center",
              background: "transparent",
              border: "none",
              borderBottom: view === key ? "2.5px solid hsl(var(--primary))" : "2.5px solid transparent",
              color: view === key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              cursor: "pointer",
              transition: "all 0.18s",
            }}
          >
            <Icon style={{ width: modoDesktop ? 16 : 15, height: modoDesktop ? 16 : 15 }} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: view === "scan" ? (modoDesktop ? "24px 32px" : "20px") : "0" }}>
        {view === "scan" ? (
          <div style={{ display: "flex", flexDirection: modoDesktop ? "row" : "column", gap: modoDesktop ? 24 : 16, alignItems: modoDesktop ? "flex-start" : "stretch" }}>
            <div style={{ flex: modoDesktop ? 1 : "auto", display: "flex", flexDirection: "column", gap: modoDesktop ? 20 : 16 }}>
              {isSefuly && (
                <div>
                  <label style={S.label}>Cliente</label>
                  <button
                    type="button"
                    onClick={() => setMostrarClienteModal(true)}
                    style={{
                      width: "100%",
                      minHeight: 52,
                      borderRadius: 10,
                      border: clientePedido ? "1.5px solid hsl(var(--primary) / 0.35)" : "1.5px solid hsl(var(--destructive) / 0.35)",
                      background: clientePedido ? "hsl(var(--primary) / 0.08)" : "hsl(var(--destructive) / 0.06)",
                      color: "hsl(var(--foreground))",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px",
                      textAlign: "left",
                    }}
                  >
                    <UserPlus style={{ width: 18, height: 18, color: clientePedido ? "hsl(var(--primary))" : "hsl(var(--destructive))", flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {clientePedido?.nome || "Selecionar ou cadastrar cliente"}
                      </span>
                      {clientePedido?.codigo && (
                        <span style={{ display: "block", marginTop: 2, fontFamily: "var(--font-mono)", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                          Cod. {clientePedido.codigo}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              )}

              {!activeList && (
                <button
                  onClick={handleOpenList}
                  data-tut="abrir-lista"
                  style={{ ...S.btnPrimary, height: modoDesktop ? 56 : 52, fontSize: modoDesktop ? 15 : 14 }}
                >
                  <ClipboardList style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} /> {isSefuly ? "Abrir pedido" : "Abrir Lista"}
                </button>
              )}

              {!activeList && (
                <div style={{ background: "hsl(var(--destructive) / 0.07)", border: "1px solid hsl(var(--destructive) / 0.15)", borderRadius: 10, padding: modoDesktop ? "16px 20px" : "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <ClipboardList style={{ width: modoDesktop ? 16 : 15, height: modoDesktop ? 16 : 15, color: "hsl(var(--destructive))", flexShrink: 0 }} />
                  <p style={{ fontSize: modoDesktop ? 14 : 13, color: "hsl(var(--destructive))", fontWeight: 500 }}>{isSefuly ? "Selecione o cliente e abra o pedido para adicionar produtos" : "Abra uma lista para adicionar produtos"}</p>
                </div>
              )}

              {(modoLeve || consultaBloqueadaPorFlag) && (
                <div style={{ background: "hsl(var(--warning) / 0.10)", border: "1px solid hsl(var(--warning) / 0.22)", borderRadius: 10, padding: modoDesktop ? "14px 18px" : "11px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle style={{ width: modoDesktop ? 16 : 15, height: modoDesktop ? 16 : 15, color: "hsl(var(--warning))", flexShrink: 0 }} />
                  <p style={{ fontSize: modoDesktop ? 13 : 12, color: "hsl(var(--foreground))", fontWeight: 500 }}>
                    {consultaBloqueadaPorFlag
                      ? "Consulta de produto ativa apenas para flag LOJA."
                      : "Modo Leve ativo: foto manual habilitada com compressao leve."}
                  </p>
                </div>
              )}

              {showProductInfo && !consultaBloqueadaPorFlag && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 16 }}>Informacoes do Produto</h3>
                    <button onClick={() => setShowProductInfo(false)} style={{ background: "none", border: "none", color: "hsl(var(--muted-foreground))", cursor: "pointer" }}>
                      X
                    </button>
                  </div>

                  {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : error ? (
                    <div style={{ background: "hsl(var(--destructive) / 0.07)", border: "1px solid hsl(var(--destructive) / 0.15)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle style={{ width: 15, height: 15, color: "hsl(var(--destructive))", flexShrink: 0 }} />
                      <p style={{ fontSize: 13, color: "hsl(var(--destructive))", fontWeight: 500 }}>{error}</p>
                    </div>
                  ) : productInfo ? (
                    <div style={{ background: "hsl(var(--secondary))", borderRadius: 10, padding: 16, border: "1px solid hsl(var(--border))" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                        <h4 style={{ fontWeight: 700, fontSize: 15 }}>{productInfo.nome_produto || productInfo.descricao || "Produto sem nome"}</h4>
                        {typeof productInfo.precoVarejo === "number" && (
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 700, textTransform: "uppercase" }}>Varejo</p>
                            <span style={{ fontWeight: 800, fontSize: 16, color: "hsl(var(--primary))" }}>R$ {productInfo.precoVarejo.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                        <div style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px 10px" }}>
                          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 700, textTransform: "uppercase" }}>Atacado</p>
                          <p style={{ fontWeight: 900, fontSize: 18, color: "hsl(var(--success))" }}>
                            {typeof productInfo.precoAtacado === "number" && productInfo.precoAtacado > 0
                              ? `R$ ${productInfo.precoAtacado.toFixed(2)}`
                              : "Nao informado"}
                          </p>
                        </div>
                        <div style={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px 10px" }}>
                          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontWeight: 700, textTransform: "uppercase" }}>Varejo</p>
                          <p style={{ fontWeight: 900, fontSize: 18, color: "hsl(var(--primary))" }}>
                            {typeof productInfo.precoVarejo === "number" && productInfo.precoVarejo > 0
                              ? `R$ ${productInfo.precoVarejo.toFixed(2)}`
                              : "Nao informado"}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Estoque disponivel:</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{typeof productInfo.estoque === "number" ? productInfo.estoque : "N/A"}</span>
                      </div>
                      {productInfo.erpProdutoId && (
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>ID Produto ERP:</span>
                          <span style={{ fontWeight: 700, fontSize: 14, fontFamily: "var(--font-mono)" }}>{productInfo.erpProdutoId}</span>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Badge histórico — abre popup manualmente se já carregou */}
              {barcode && popupCompras && !popupCompras.carregando && popupCompras.ocorrencias.length > 0 && (
                <button
                  onClick={() => setPopupCompras(popupCompras)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left",
                    background: "hsl(262 80% 50% / 0.10)", border: "1px solid hsl(262 80% 50% / 0.25)",
                    borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                  }}>
                  <ShoppingCart style={{ width: 16, height: 16, color: "hsl(262 80% 50%)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, color: "hsl(262 80% 50%)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Histórico de Pedidos</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>{popupCompras.ocorrencias[0] ? `Último: ${popupCompras.ocorrencias[0].dataFormatada}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 11, color: "hsl(262 80% 50%)", fontWeight: 600, flexShrink: 0 }}>
                    {popupCompras.ocorrencias.length}x
                  </span>
                </button>
              )}

              <div>
                <label style={S.label}>Codigo de barras ou SKU</label>
                {semEAN ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 48, borderRadius: 10, border: "1.5px solid hsl(var(--warning) / 0.5)", background: "hsl(var(--warning) / 0.08)", display: "flex", alignItems: "center", padding: "0 14px", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>📦</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--warning))" }}>PRODUTO SEM EAN</span>
                    </div>
                    <button
                      onClick={() => { setBarcode(""); setSemEAN(false); }}
                      style={{ width: 48, height: 48, borderRadius: 10, border: "1.5px solid hsl(var(--border))", background: "hsl(var(--card))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))", flexShrink: 0 }}
                      title="Cancelar sem EAN"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <BarcodeInput
                    value={barcode}
                    onChange={(v) => { setBarcode(v); setSemEAN(false); }}
                    onScanPress={() => setShowScanner(true)}
                    onEnterPress={() => {
                      if (!barcode.trim()) return;
                      if (consultaBloqueadaPorFlag) {
                        toast({ title: "Consulta bloqueada", description: "Consulta de produto ativa apenas para flag LOJA." });
                        return;
                      }
                      setShowProductInfo(true);
                      startProductLookup(barcode);
                    }}
                  />
                )}
                {!semEAN && (
                  <button
                    onClick={() => {
                      const id = `SEM_EAN_${Date.now()}`;
                      setBarcode(id);
                      setSemEAN(true);
                      setShowProductInfo(false);
                    }}
                    style={{ marginTop: 6, width: "100%", height: 36, borderRadius: 8, border: "1.5px dashed hsl(var(--warning) / 0.5)", background: "transparent", cursor: "pointer", fontSize: 12, fontWeight: 700, color: "hsl(var(--warning))", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    📦 Produto sem EAN
                  </button>
                )}
              </div>

              <div data-tut="scanner-descricao">
                <label style={S.label}>Descricao do item *</label>
                <input
                  type="text"
                  minLength={MIN_ITEM_DESCRIPTION_CHARS}
                  placeholder="Ex: BOM-9108 rocadeira com rodinha"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  style={{
                    ...S.inputBase,
                    border: descricaoItemInvalida ? "1.5px solid hsl(var(--destructive))" : S.inputBase.border,
                  }}
                />
                <p style={{ marginTop: 5, fontSize: 11, color: descricaoItemInvalida ? "hsl(var(--destructive))" : "hsl(var(--muted-foreground))" }}>
                  Minimo {MIN_ITEM_DESCRIPTION_CHARS} caracteres com referencia do item. {Math.min(descricaoItemLength, MIN_ITEM_DESCRIPTION_CHARS)}/{MIN_ITEM_DESCRIPTION_CHARS}
                </p>
              </div>

              <div>
                <label style={S.label}>Foto do Produto *</label>
                <div data-tut="scanner-foto">
                  <PhotoCapture
                    photo={photo}
                    onCapture={(nextPhoto) => {
                      setDraftPhoto(nextPhoto);
                    }}
                    onRemove={() => {
                      clearDraftPhoto();
                    }}
                    compressionPreset={modoLeve ? "light" : "default"}
                  />
                </div>
              </div>

              <div>
                <label style={S.label}>Quantidade</label>
                <input type="number" inputMode="numeric" min="1" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-tut="scanner-quantity" style={{ ...S.inputBase, fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }} />
              </div>

              <button
                onClick={() => {
                  void handleAdd();
                }}
                data-tut="scanner-add"
                style={{ ...S.btnPrimary, height: modoDesktop ? 60 : 56, fontSize: modoDesktop ? 16 : 15, opacity: activeList ? 1 : 0.45, cursor: activeList ? "pointer" : "not-allowed" }}
              >
                <Plus style={{ width: modoDesktop ? 22 : 20, height: modoDesktop ? 22 : 20 }} /> Adicionar Produto
              </button>
            </div>

            {modoDesktop && activeList && activeList.products.length > 0 && (
              <div style={{ flex: 1, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 16, padding: modoDesktop ? 20 : 16, maxHeight: "70vh", overflowY: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ fontSize: modoDesktop ? 18 : 16, fontWeight: 700, color: "hsl(var(--foreground))" }}>Produtos Adicionados</h3>
                  <span style={{ fontSize: modoDesktop ? 14 : 12, color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>{activeList.products.length} itens</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {activeList.products.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      onDelete={deleteProduct}
                      onUpdate={updateProduct}
                      onMoveToTop={moveProductToTop}
                      onCapturePhoto={(id) => {
                        setPhotoProductId(id);
                        setShowPhotoCapture(true);
                      }}
                      modoDesktop={modoDesktop}
                    />
                  ))}
                </div>
              </div>
            )}

            {!modoDesktop && activeList && activeList.products.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <p style={S.label}>Produtos adicionados</p>
                {activeList.products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onDelete={deleteProduct}
                    onUpdate={updateProduct}
                    onMoveToTop={moveProductToTop}
                    onCapturePhoto={(id) => {
                      setPhotoProductId(id);
                      setShowPhotoCapture(true);
                    }}
                    modoDesktop={modoDesktop}
                  />
                ))}
              </div>
            )}
          </div>
        ) : view === "list" ? (
          <Suspense fallback={LAZY_FALLBACK}>
            <ListHistory
              lists={lists}
              onUpdateList={updateList}
              onStartConference={() => setView("conference")}
              modoDesktop={modoDesktop}
              modoLeve={modoLeve}
            />
          </Suspense>
        ) : (
          <Suspense fallback={LAZY_FALLBACK}>
            <ConferenceView onBack={() => setView("list")} empresa={activeList?.empresa} flag={activeList?.flag} modoDesktop={modoDesktop} />
          </Suspense>
        )}
      </div>

      {showScanner && (
        <Suspense fallback={LAZY_FALLBACK}>
          <BarcodeScanner
            onDetected={handleBarcodeDetected}
            onClose={() => setShowScanner(false)}
            enableNumberTextScan={isSefuly}
          />
        </Suspense>
      )}

      {showPhotoCapture && photoProductId && (
        <Suspense fallback={LAZY_FALLBACK}>
          <PhotoCapture
            photo={activeList?.products.find((p) => p.id === photoProductId)?.photo || null}
            compressionPreset={modoLeve ? "light" : "default"}
            onCapture={(nextPhoto) => {
              if (!photoProductId) return;
              void (async () => {
                const ok = await updateProductPhoto(photoProductId, nextPhoto);
                if (!ok) return;
                setShowPhotoCapture(false);
                setPhotoProductId(null);
              })();
            }}
            onRemove={() => {
              if (!photoProductId) return;
              void (async () => {
                const ok = await updateProductPhoto(photoProductId, null);
                if (!ok) return;
                setShowPhotoCapture(false);
                setPhotoProductId(null);
              })();
            }}
          />
        </Suspense>
      )}

      {productOptions.length > 0 && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 110,
            background: "rgba(0,0,0,0.58)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 18,
          }}
          onClick={clearProductOptions}
        >
          <div
            style={{
              width: "100%", maxWidth: 520, maxHeight: "82vh", overflow: "hidden",
              background: "hsl(var(--background))", border: "1px solid hsl(var(--border))",
              borderRadius: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.28)",
              display: "flex", flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid hsl(var(--border))", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>
                  Escolha o item
                </p>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "hsl(var(--foreground))" }}>
                  SKU encontrou {productOptions.length} produtos
                </h3>
                <p style={{ marginTop: 4, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  Toque uma vez para marcar. Toque de novo ou confirme abaixo.
                </p>
              </div>
              <button
                onClick={clearProductOptions}
                style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))", cursor: "pointer", fontSize: 18 }}
              >
                x
              </button>
            </div>

            <div style={{ padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              {productOptions.map((option) => {
                const selected = selectedProductOption?.id === option.id;
                const imageFailed = imageFailedOptions[option.id];

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (selected) {
                        void confirmarProductOption(option);
                        return;
                      }
                      setSelectedProductOption(option);
                    }}
                    onDoubleClick={() => void confirmarProductOption(option)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: selected ? "2px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      background: selected ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
                      padding: selected ? 11 : 12,
                      display: "flex",
                      gap: 12,
                      cursor: loading ? "wait" : "pointer",
                      boxShadow: selected ? "0 0 0 3px hsl(var(--primary) / 0.12)" : "none",
                      transition: "border-color 0.12s ease, background 0.12s ease, box-shadow 0.12s ease",
                    }}
                  >
                    {option.imagem && !imageFailed ? (
                      <img
                        src={option.imagem}
                        alt={option.descricao}
                        loading="lazy"
                        decoding="async"
                        onError={() => setImageFailedOptions((current) => ({ ...current, [option.id]: true }))}
                        style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: "1px solid hsl(var(--border))", flexShrink: 0, background: "hsl(var(--secondary))" }}
                      />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 10, background: "hsl(var(--secondary))", border: "1px solid hsl(var(--border))", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 800, textAlign: "center", padding: 4 }}>
                        Sem foto
                      </div>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1.25 }}>
                        {option.descricao}
                      </p>
                      <p style={{ marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
                        ERP {option.id} {option.sku ? `| SKU ${option.sku}` : ""} | Cod {option.codigo_barras}
                      </p>
                      {selected && (
                        <p style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "hsl(var(--primary))" }}>
                          Item marcado
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ padding: 12, borderTop: "1px solid hsl(var(--border))", background: "hsl(var(--background))", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button
                type="button"
                onClick={() => void confirmarProductOption(selectedProductOption)}
                disabled={!selectedProductOption || loading}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "none",
                  background: selectedProductOption ? "hsl(var(--primary))" : "hsl(var(--muted))",
                  color: selectedProductOption ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: selectedProductOption && !loading ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                }}
              >
                {loading ? <Loader2 style={{ width: 15, height: 15, animation: "spin 0.8s linear infinite" }} /> : null}
                Selecionar esse item
              </button>
              <button
                type="button"
                onClick={() => setSelectedProductOption(null)}
                disabled={!selectedProductOption || loading}
                style={{
                  height: 44,
                  borderRadius: 10,
                  border: "1.5px solid hsl(var(--border))",
                  background: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: selectedProductOption && !loading ? "pointer" : "not-allowed",
                  opacity: selectedProductOption ? 1 : 0.55,
                }}
              >
                Escolher outro item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup histórico de compras */}
      {popupCompras && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => {
            setPopupCompras(null);
            setHistoricoCompletoAberto(false);
          }}
        >
          <div
            style={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 16, padding: 24, width: "100%", maxWidth: 360,
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              maxHeight: "86vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const bloqueado = !!popupCompras.emConferencia;
              const recente = popupCompras.conferidoRecente;
              const corTema = bloqueado ? "0 84% 60%" : "262 80% 50%";
              const ocorrenciasVisiveis = historicoCompletoAberto
                ? popupCompras.ocorrencias
                : popupCompras.ocorrencias.slice(0, 3);
              const totalOculto = Math.max(0, popupCompras.ocorrencias.length - 3);
              const limparTudo = () => {
                setPopupCompras(null);
                setHistoricoCompletoAberto(false);
                setBarcode("");
                setSemEAN(false);
                setSku("");
                clearDraftPhoto();
                setQuantity("");
                sessionStorage.removeItem("scan_barcode");
                sessionStorage.removeItem("scan_sku");
                sessionStorage.removeItem("scan_quantity");
              };
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `hsl(${corTema} / 0.12)`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {bloqueado
                        ? <AlertCircle style={{ width: 20, height: 20, color: `hsl(${corTema})` }} />
                        : <ShoppingCart style={{ width: 20, height: 20, color: `hsl(${corTema})` }} />}
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                        {bloqueado ? "Item em conferência" : "Histórico de Pedidos"}
                      </p>
                      <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                        {bloqueado ? "Pedido barrado" : `${popupCompras.ocorrencias.length}x encontrado(s)`}
                      </p>
                    </div>
                  </div>

                  {bloqueado && (
                    <div style={{ background: "hsl(0 84% 60% / 0.10)", border: "1px solid hsl(0 84% 60% / 0.30)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(0 84% 45%)", marginBottom: 2 }}>🚫 Já existe pedido em aberto</p>
                      <p style={{ fontSize: 12, color: "hsl(var(--foreground))" }}>
                        {popupCompras.emConferencia!.titulo}
                        {popupCompras.emConferencia!.pessoa ? ` — ${popupCompras.emConferencia!.pessoa}` : ""}
                      </p>
                    </div>
                  )}

                  {!bloqueado && recente && (
                    <div style={{ background: "hsl(38 92% 50% / 0.12)", border: "1px solid hsl(38 92% 50% / 0.30)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(32 90% 40%)" }}>
                        ⚠️ Conferido há {recente.diasAtras === 0 ? "menos de 1 dia" : `${recente.diasAtras} dia(s)`} ({recente.dataFormatada})
                      </p>
                    </div>
                  )}

                  {/* Ocorrências */}
                  {ocorrenciasVisiveis.map((oc, i) => {
                    const corStatus = oc.status === "separado" ? "#22c55e" : oc.status === "nao_tem" ? "#ef4444" : oc.status === "parcial" ? "#eab308" : "#9ca3af";
                    const labelSt = oc.status === "separado" ? "Separado" : oc.status === "nao_tem" ? "Não tinha" : oc.status === "parcial" ? "Parcial" : oc.status;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "hsl(var(--secondary))", borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))" }}>{oc.dataFormatada}</p>
                          {oc.titulo && <p style={{ fontSize: 11, color: "hsl(var(--foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oc.titulo}</p>}
                          {oc.listeiro && <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{oc.listeiro}</p>}
                        </div>
                        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: corStatus, background: `${corStatus}22`, borderRadius: 6, padding: "3px 8px" }}>{labelSt}</span>
                      </div>
                    );
                  })}

                  {totalOculto > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistoricoCompletoAberto((value) => !value)}
                      style={{
                        width: "100%",
                        minHeight: 42,
                        marginTop: 10,
                        border: "1px solid hsl(262 80% 50% / 0.25)",
                        borderRadius: 10,
                        background: "hsl(262 80% 50% / 0.08)",
                        color: "hsl(262 80% 42%)",
                        cursor: "pointer",
                        fontSize: 13,
                        fontWeight: 800,
                        fontFamily: "var(--font-sans)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "8px 12px",
                      }}
                    >
                      <ClipboardList style={{ width: 16, height: 16, flexShrink: 0 }} />
                      {historicoCompletoAberto ? "Mostrar apenas os 3 ultimos" : `Ver historico completo (+${totalOculto})`}
                    </button>
                  )}

                  {bloqueado ? (
                    <button
                      onClick={limparTudo}
                      style={{ width: "100%", height: 46, marginTop: 16, background: "hsl(0 84% 60%)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                    >
                      Entendi
                    </button>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))", marginTop: 16, marginBottom: 10, textAlign: "center" }}>
                        Deseja pedir mesmo assim?
                      </p>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={limparTudo}
                          style={{ flex: 1, height: 46, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                        >
                          Não
                        </button>
                        <button
                          onClick={() => {
                            setPopupCompras(null);
                            setHistoricoCompletoAberto(false);
                          }}
                          style={{ flex: 1, height: 46, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-sans)" }}
                        >
                          Sim, pedir
                        </button>
                      </div>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
