import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, GitCompare, Store, Eye, EyeOff, Loader2, AlertCircle, Monitor, Smartphone, ShoppingCart, FileUp } from "lucide-react";
import type { SpreadsheetItem } from "@/lib/spreadsheetParser";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import ProductCard, { Product, ListFlag } from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
import { useProductLookup } from "@/hooks/useProductLookup";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const LOGO = "/newshop-logo.jpg";
const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));
const PhotoCapture = lazy(() => import("@/components/PhotoCapture"));
const ListHistory = lazy(() => import("@/components/ListHistory"));
const ConferenceView = lazy(() => import("@/components/ConferenceView"));
const LAZY_FALLBACK = (
  <div style={{ padding: 20, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
    Carregando...
  </div>
);

// â”€â”€ ConfiguraÃ§Ã£o de empresas e senhas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Empresa = "NEWSHOP" | "SOYE" | "FACIL";

const EMPRESAS: Empresa[] = ["NEWSHOP", "SOYE", "FACIL"];

const SENHAS: Record<"loja", Record<Empresa, string>> = {
  loja: {
    "NEWSHOP":       "1148",
    "SOYE":          "1090",
    "FACIL": "2461",
  },
};

/* â”€â”€ Shared style tokens â”€â”€ */
const S = {
  inputBase: {
    width: "100%", height: 48, padding: "0 16px",
    borderRadius: 10, border: "1.5px solid hsl(var(--border))",
    background: "hsl(var(--secondary))", color: "hsl(var(--foreground))",
    fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 500,
    outline: "none", boxSizing: "border-box" as const,
  } as React.CSSProperties,
  label: {
    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 500,
    letterSpacing: "0.18em", textTransform: "uppercase" as const,
    color: "hsl(var(--muted-foreground))", marginBottom: 6, display: "block",
  } as React.CSSProperties,
  btnPrimary: {
    width: "100%", height: 52, background: "hsl(var(--primary))",
    color: "hsl(var(--primary-foreground))", border: "none",
    borderRadius: 10, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700,
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8, transition: "all 0.18s",
    boxShadow: "var(--shadow-md)",
  } as React.CSSProperties,
};

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");

  const [barcode, setBarcode] = useState(() => sessionStorage.getItem("scan_barcode") ?? "");
  const [sku, setSku] = useState(() => sessionStorage.getItem("scan_sku") ?? "");
  const [photo, setPhoto] = useState<string | null>(() => sessionStorage.getItem("scan_photo") ?? null);
  const [quantity, setQuantity] = useState(() => sessionStorage.getItem("scan_quantity") ?? "");

  // Persistir campos do formulÃ¡rio no sessionStorage para nÃ£o perder ao trocar de aba
  useEffect(() => { sessionStorage.setItem("scan_barcode", barcode); }, [barcode]);
  useEffect(() => { sessionStorage.setItem("scan_sku", sku); }, [sku]);
  useEffect(() => { sessionStorage.setItem("scan_photo", photo ?? ""); }, [photo]);
  useEffect(() => { sessionStorage.setItem("scan_quantity", quantity); }, [quantity]);
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" ? "conference" : initialTab === "list" ? "list" : "scan"
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showProductInfo, setShowProductInfo] = useState(false);

  // â”€â”€ Estado do modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [modalFlag, setModalFlag]         = useState<ListFlag | null>(null);
  const [modalEmpresa, setModalEmpresa]   = useState<Empresa | null>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Estado para modo Desktop
  const [modoDesktop, setModoDesktop] = useState(() => {
    return localStorage.getItem('modoDesktop') === 'true';
  });
  const [modalTitle, setModalTitle]       = useState("");
  const [modalPerson, setModalPerson]     = useState("");

  const { lists, activeList, openList, closeList, addProduct, updateList, deleteProduct, addProductsFromSpreadsheet, updateProduct, scrollToProduct, moveProductToTop } = useInventory();
  
  // Estados para importaÃ§Ã£o de planilha
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importItems, setImportItems] = useState<SpreadsheetItem[]>([]);
  const [importing, setImporting] = useState(false);
  
  // Estado para item em ediÃ§Ã£o
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [pendingEditProductId, setPendingEditProductId] = useState<string | null>(null); // produto aguardando scan no modal
  
  // Estados para captura de foto
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [photoProductId, setPhotoProductId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { productInfo, loading, error, lookupProduct } = useProductLookup();

  // Preencher modal com dados do login salvo quando abrir
  useEffect(() => {
    if (showOpenModal) {
      const login = obterLoginSalvo();
      if (login) {
        // Definir flag como "loja" (Ãºnica opÃ§Ã£o)
        setModalFlag("loja");
        setModalEmpresa(login.empresa);
        // Senha jÃ¡ foi validada anteriormente, entÃ£o desbloquear diretamente
        setPasswordUnlocked(true);
        // Preencher tÃ­tulo e pessoa com os valores padrÃ£o
        setModalTitle(login.tituloPadrao || "");
        setModalPerson(login.nomePessoa || "");
      } else {
        // Se nÃ£o hÃ¡ login, resetar modal
        resetModal();
      }
    }
  }, [showOpenModal]);

  // Atualizar modoDesktop quando mudar no localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      setModoDesktop(localStorage.getItem('modoDesktop') === 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleBarcodeDetected = useCallback((code: string) => {
    setShowScanner(false);

    // Se o scan foi disparado de dentro do modal de ediÃ§Ã£o, atualiza o produto direto
    if (pendingEditProductId) {
      updateProduct(pendingEditProductId, { barcode: code });
      const idToReopen = pendingEditProductId;
      setPendingEditProductId(null);
      // Reabre o modal do produto apÃ³s o scan
      setEditingProductId(idToReopen);
      return;
    }

    // Scan normal: preenche o campo de barcode da tela principal
    setBarcode(code);
    setShowProductInfo(true);
    lookupProduct(code);
  }, [lookupProduct, pendingEditProductId, updateProduct]);

  // Quando o produto for encontrado no Supabase, preencher SKU com o campo descricao
  useEffect(() => {
    if (productInfo) {
      const descricao = productInfo.descricao || productInfo.nome_produto;
      if (descricao) {
        setSku(descricao);
      }
    }
  }, [productInfo]);

  const resetModal = () => {
    setModalFlag(null);
    setModalEmpresa(null);
    setModalPassword("");
    setPasswordError(false);
    setPasswordUnlocked(false);
    setShowPassword(false);
    setModalTitle("");
    setModalPerson("");
  };

  const selectFlag = (flag: ListFlag) => {
    setModalFlag(flag);
    setModalEmpresa(null);
    setModalPassword("");
    setPasswordError(false);
    setPasswordUnlocked(false);
    setShowPassword(false);
  };

  const selectEmpresa = (empresa: Empresa) => {
    setModalEmpresa(empresa);
    setModalPassword("");
    setPasswordError(false);
    setPasswordUnlocked(false);
    setShowPassword(false);
  };

  const checkPassword = () => {
    if (!modalFlag || !modalEmpresa) return;
    const correta = SENHAS[modalFlag][modalEmpresa];
    if (modalPassword === correta) {
      setPasswordUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
      setPasswordUnlocked(false);
    }
  };

  const handleCloseList = () => {
    if (!activeList) return;
    if (window.confirm(`Fechar "${activeList.title}"?`)) {
      closeList();
      
      // Tentar abrir nova lista automaticamente com login salvo
      const login = obterLoginSalvo();
      if (login && login.tituloPadrao && login.nomePessoa) {
        // Abrir nova lista automaticamente
        const ok = openList({
          title: login.tituloPadrao,
          person: login.nomePessoa,
          flag: "loja",
          empresa: login.empresa,
        });
        if (ok) {
          toast({ title: "Nova lista aberta automaticamente!", description: `${login.tituloPadrao} â€¢ ${login.nomePessoa}` });
        } else {
          // Se falhar, mostrar modal para abrir manualmente
          setShowOpenModal(true);
        }
      } else {
        // Sem login salvo, mostrar modal para configurar
        setShowOpenModal(true);
      }
    }
  };

  const handleImportSpreadsheet = async (file: File) => {
    try {
      setImporting(true);

      // Valida tamanho mÃ­nimo â€” arquivo 0 bytes = sem permissÃ£o no Android
      if (file.size === 0) {
        toast({
          title: "Arquivo ilegÃ­vel",
          description: "O app nÃ£o conseguiu ler o arquivo. Tente mover para a pasta Downloads e importar de lÃ¡.",
          variant: "destructive",
        });
        return;
      }

      const { parseSpreadsheet } = await import("@/lib/spreadsheetParser");
      const items = await parseSpreadsheet(file);

      if (items.length === 0) {
        toast({
          title: "Nenhum item encontrado",
          description: "Verifique se o arquivo tem dados nas colunas A e B.",
          variant: "destructive",
        });
        return;
      }

      const productItems = items.map(item => ({
        barcode: "",
        sku: item.sku ?? "",
        description: item.description,
        photo: null,
        quantity: 0,
        qtdPlanilha: item.qtdPlanilha ?? 0,
      }));

      addProductsFromSpreadsheet(productItems);
      const newItems = activeList?.products.slice(-items.length) || [];
      if (newItems.length > 0) {
        setEditingProductId(newItems[0].id);
        toast({ title: `${items.length} itens importados!`, description: "Edite COD e QTD de cada item." });
      }
    } catch (err: any) {
      toast({
        title: "Erro ao importar planilha",
        description: err?.message ?? "Erro desconhecido. Tente com o arquivo na pasta Downloads.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      setShowImportModal(false);
      setImportFile(null);
      setImportItems([]);
    }
  };

  const handleOpenList = () => {
    if (!modalFlag)          { toast({ title: "Selecione LOJA",              variant: "destructive" }); return; }
    if (!modalEmpresa)       { toast({ title: "Selecione a empresa",          variant: "destructive" }); return; }
    if (!passwordUnlocked)   { toast({ title: "Confirme a senha primeiro",    variant: "destructive" }); return; }
    if (!modalTitle.trim())  { toast({ title: "Informe o tÃ­tulo da lista",    variant: "destructive" }); return; }
    if (!modalPerson.trim()) { toast({ title: "Informe o responsÃ¡vel",        variant: "destructive" }); return; }

    const ok = openList({
      title: modalTitle.trim(),
      person: modalPerson.trim(),
      flag: modalFlag,
      empresa: modalEmpresa,
    });
    if (ok) { setShowOpenModal(false); resetModal(); }
  };

  const handleAdd = () => {
    const ok = addProduct({ barcode, sku, photo, quantity: Number(quantity) });
    if (ok) {
      setBarcode(""); setSku(""); setPhoto(null); setQuantity("");
      sessionStorage.removeItem("scan_barcode");
      sessionStorage.removeItem("scan_sku");
      sessionStorage.removeItem("scan_photo");
      sessionStorage.removeItem("scan_quantity");
    }
  };

  const productCount = activeList?.products.length ?? 0;

  // Determine if user has 'compras' role to show COMPRADOR tab
  const currentLogin = obterLoginSalvo();
  const handleTabChange = (key: "scan" | "list" | "conference" | "compras") => {
    if (key === "compras") {
      navigate("/compras");
      return;
    }
    setView(key);
  };
  const extraTab = currentLogin?.role === 'compras' ? [{ key: 'compras' as const, label: "COMPRADOR", Icon: ShoppingCart }] : [];
  const tabs = [
    { key: "scan"       as const, label: "Escanear",    Icon: ScanBarcode  },
    { key: "list"       as const, label: "Lista",        Icon: ClipboardList },
    { key: "conference" as const, label: "ConferÃªncia",  Icon: GitCompare   },
    ...extraTab
  ];

  // Badge da flag ativa no banner
  const flagBadge = { bg: "hsl(var(--primary)/0.10)", border: "hsl(var(--primary)/0.20)", text: "hsl(var(--primary))" };

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? 'max-w-6xl mx-auto' : 'max-w-md mx-auto'}`} style={{ background: "hsl(var(--background))" }}>

      {/* â”€â”€ Header â”€â”€ */}
      <header style={{ 
        background: "hsl(var(--primary))", 
        padding: modoDesktop ? "18px 32px" : "14px 20px", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between", 
        position: "relative", 
        overflow: "hidden" 
      }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate("/")} style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
            <ArrowLeft style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} />
          </button>
          <img src={LOGO} alt="Newshop" style={{ 
            height: modoDesktop ? 26 : 22, 
            filter: "brightness(0) invert(1)", 
            objectFit: "contain" 
          }} />
          {modoDesktop && (
            <div style={{ marginLeft: 16, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.2)" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                SCANNER
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: 600, marginTop: 2 }}>
                Sistema de Leitura de CÃ³digos
              </p>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ 
            fontFamily: "var(--font-mono)", 
            fontSize: modoDesktop ? 10 : 9, 
            color: "rgba(255,255,255,0.45)", 
            letterSpacing: "0.15em", 
            textTransform: "uppercase" 
          }}>
            {activeList ? activeList.title : "Pedido"}
          </p>
          {activeList && (
            <p style={{ 
              fontFamily: "var(--font-mono)", 
              fontSize: modoDesktop ? 12 : 11, 
              color: "rgba(255,255,255,0.8)", 
              marginTop: 1 
            }}>
              {productCount} produto(s)
            </p>
          )}
          {modoDesktop && !activeList && (
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
              {modoDesktop ? "ðŸ–¥ï¸ Modo Desktop" : "ðŸ“± Modo Mobile"}
            </p>
          )}
        </div>
      </header>

      {/* â”€â”€ Active banner â”€â”€ */}
      {activeList && (
        <div style={{ 
          background: "hsl(38 92% 50% / 0.12)", 
          borderBottom: "1.5px solid hsl(38 92% 50% / 0.2)", 
          padding: modoDesktop ? "12px 32px" : "10px 20px", 
          display: "flex", 
          alignItems: "center", 
          gap: 10 
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--warning))", flexShrink: 0, display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>
          <p style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            {activeList.title}
            <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}> Â· {activeList.person}</span>
          </p>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: flagBadge.bg, border: `1px solid ${flagBadge.border}`, color: flagBadge.text }}>
            {activeList.flag?.toUpperCase() ?? "LOJA"} Â· {activeList.empresa ? activeList.empresa.split(" ")[0] : ""}
          </span>
          <button
            onClick={handleCloseList}
            data-tut="fechar-lista"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "hsl(var(--destructive))", background: "transparent", border: "1px solid hsl(var(--destructive) / 0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Fechar
          </button>
        </div>
      )}

      {/* â”€â”€ Tabs â”€â”€ */}
      <div style={{ 
        background: "#fff", 
        borderBottom: "1px solid hsl(var(--border))", 
        display: "flex", 
        padding: modoDesktop ? "0 32px" : "0 8px" 
      }}>
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => handleTabChange(key)}
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
              justifyContent: modoDesktop ? "center" : "center",
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

      {/* â”€â”€ Content â”€â”€ */}
      <div style={{ 
        flex: 1, 
        overflowY: "auto", 
        padding: view === "scan" ? modoDesktop ? "24px 32px" : "20px" : "0" 
      }}>
        {view === "scan" ? (
          <div style={{ 
            display: "flex", 
            flexDirection: modoDesktop ? "row" : "column", 
            gap: modoDesktop ? 24 : 16,
            alignItems: modoDesktop ? "flex-start" : "stretch"
          }}>

            {/* Coluna esquerda - Controles */}
            <div style={{ 
              flex: modoDesktop ? 1 : "auto", 
              display: "flex", 
              flexDirection: "column", 
              gap: modoDesktop ? 20 : 16 
            }}>
              {!activeList && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={() => setShowOpenModal(true)} data-tut="abrir-lista" style={{ 
                    ...S.btnPrimary,
                    fontSize: modoDesktop ? 15 : 14,
                    height: modoDesktop ? 56 : 52
                  }}>
                    <ClipboardList style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} /> Abrir Nova Lista
                  </button>
                </div>
              )}

              {activeList && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <button onClick={() => setShowImportModal(true)} style={{ 
                    width: "100%",
                    height: modoDesktop ? 56 : 52,
                    borderRadius: 14,
                    background: "hsl(263.4, 70%, 50.4%)",
                    color: "#fff",
                    border: "none",
                    fontSize: modoDesktop ? 15 : 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}>
                    <FileUp style={{ width: modoDesktop ? 20 : 18, height:modoDesktop ? 20 : 18 }} /> Importa Lista
                  </button>
                </div>
              )}

              {!activeList && (
                <div style={{ 
                  background: "hsl(var(--destructive) / 0.07)", 
                  border: "1px solid hsl(var(--destructive) / 0.15)", 
                  borderRadius: 10, 
                  padding: modoDesktop ? "16px 20px" : "12px 16px", 
                  display: "flex", 
                  alignItems: "center", 
                  gap: 8 
                }}>
                  <ClipboardList style={{ width: modoDesktop ? 16 : 15, height: modoDesktop ? 16 : 15, color: "hsl(var(--destructive))", flexShrink: 0 }} />
                  <p style={{ 
                    fontSize: modoDesktop ? 14 : 13, 
                    color: "hsl(var(--destructive))", 
                    fontWeight: 500 
                  }}>
                    Abra uma lista para adicionar produtos
                  </p>
                </div>
              )}

            {/* ExibiÃ§Ã£o das informaÃ§Ãµes do produto */}
            {showProductInfo && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 16 }}>InformaÃ§Ãµes do Produto</h3>
                  <button
                    onClick={() => setShowProductInfo(false)}
                    style={{ background: "none", border: "none", color: "hsl(var(--muted-foreground))", cursor: "pointer" }}
                  >
                    âœ•
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
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                      <h4 style={{ fontWeight: 700, fontSize: 15 }}>
                        {productInfo.nome_produto || productInfo.descricao || "Produto sem nome"}
                      </h4>
                      {typeof productInfo.preco === 'number' && (
                        <span style={{ fontWeight: 800, fontSize: 16, color: "hsl(var(--primary))" }}>
                          R$ {productInfo.preco.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Estoque disponÃ­vel:</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {typeof productInfo.estoque === 'number' ? productInfo.estoque : "N/A"}
                      </span>
                    </div>

                    {/* Indicador de origem dos dados */}
                    <div style={{ marginTop: 12, padding: 8, background: "hsl(var(--primary) / 0.1)", borderRadius: 6, fontSize: 11, color: "hsl(var(--primary))" }}>
                      InformaÃ§Ãµes {" "}
                      {productInfo.nome_produto && typeof productInfo.preco === 'number' ? "atualizadas via API" : "do banco de dados local"}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label style={S.label}>CÃ³digo de Barras</label>
              <BarcodeInput
  value={barcode}
  onChange={setBarcode}
  onScanPress={() => setShowScanner(true)}
  onEnterPress={() => {
    if (barcode.trim()) {
      setShowProductInfo(true);
      lookupProduct(barcode.trim());
    }
  }}
/>
            </div>

            <div data-tut="scanner-descricao">
              <label style={S.label}>SKU</label>
              <input type="text" placeholder="Ex: BM-5050" value={sku} onChange={(e) => setSku(e.target.value)} style={S.inputBase} />
            </div>

            <div>
              <label style={S.label}>Foto do Produto</label>
              <div data-tut="scanner-foto">
                <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
              </div>
            </div>

            <div>
              <label style={S.label}>Quantidade</label>
              <input type="number" inputMode="numeric" min="1" placeholder="0" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                data-tut="scanner-quantity"
                style={{ ...S.inputBase, fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}
              />
            </div>



            <button onClick={handleAdd} disabled={!activeList}
              data-tut="scanner-add"
              style={{
                ...S.btnPrimary, 
                height: modoDesktop ? 60 : 56, 
                fontSize: modoDesktop ? 16 : 15,
                opacity: activeList ? 1 : 0.45,
                cursor: activeList ? "pointer" : "not-allowed",
              }}
            >
              <Plus style={{ width: modoDesktop ? 22 : 20, height: modoDesktop ? 22 : 20 }} /> Adicionar Produto
            </button>

            {/* Fechar coluna esquerda */}
            </div>

            {/* Coluna direita - Lista de produtos (apenas no desktop quando hÃ¡ produtos) */}
            
            {/* MODAL de ediÃ§Ã£o â€” abre ao clicar na seta â†‘ do produto importado */}
            <Dialog open={!!editingProductId} onOpenChange={(open) => { if (!open) setEditingProductId(null); }}>
              <DialogContent
                style={{
                  background: "hsl(var(--card))",
                  borderRadius: 20,
                  border: "1px solid hsl(var(--border))",
                  padding: 0,
                  overflow: "hidden",
                  maxWidth: 420,
                  width: "calc(100vw - 32px)",
                }}
              >
                {(() => {
                  const product = activeList?.products.find(p => p.id === editingProductId);
                  if (!product) return null;
                  return (
                    <div style={{ padding: 20 }}>

                      {/* Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <p style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", letterSpacing: "0.12em", textTransform: "uppercase" }}>Editando Item</p>
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: "hsl(var(--foreground))", marginTop: 2 }}>
                            {product.sku || "Produto importado"}
                          </h3>
                        </div>
                        <button onClick={() => setEditingProductId(null)} style={{ background: "hsl(var(--secondary))", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, color: "hsl(var(--muted-foreground))" }}>âœ•</button>
                      </div>

                      {/* DescriÃ§Ã£o */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>DescriÃ§Ã£o</label>
                        <div style={{ padding: "10px 12px", background: "hsl(var(--muted))", borderRadius: 8, fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground))" }}>
                          {product.description || "Sem descriÃ§Ã£o"}
                        </div>
                      </div>

                      {/* Foto */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Foto</label>
                        <PhotoCapture
                          photo={product.photo}
                          onCapture={(photo) => updateProduct(product.id, { photo })}
                          onRemove={() => updateProduct(product.id, { photo: null })}
                        />
                      </div>

                      {/* CÃ³digo de Barras + botÃ£o Scan */}
                      <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>CÃ³digo de Barras</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input
                            type="text"
                            placeholder="Digite ou escaneie o cÃ³digo"
                            value={product.barcode}
                            onChange={(e) => updateProduct(product.id, { barcode: e.target.value })}
                            style={{
                              flex: 1,
                              height: 48,
                              padding: "0 12px",
                              borderRadius: 10,
                              border: "1.5px solid hsl(var(--border))",
                              background: "hsl(var(--secondary))",
                              fontSize: 14,
                              fontFamily: "var(--font-mono)",
                              fontWeight: 500,
                              color: "hsl(var(--foreground))",
                              outline: "none",
                            }}
                          />
                          <button
                            onClick={() => {
                              // Salva o id, fecha o dialog (evita sobrepor o scanner) e abre o scanner
                              setPendingEditProductId(product.id);
                              setEditingProductId(null);
                              setShowScanner(true);
                            }}
                            style={{
                              height: 48,
                              padding: "0 14px",
                              borderRadius: 10,
                              background: "hsl(var(--foreground))",
                              color: "hsl(var(--background))",
                              border: "none",
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <ScanBarcode style={{ width: 16, height: 16 }} /> Scan
                          </button>
                        </div>
                      </div>

                      {/* Quantidade */}
                      <div style={{ marginBottom: 20 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6, display: "block" }}>Quantidade</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <button
                            onClick={() => updateProduct(product.id, { quantity: Math.max(0, product.quantity - 1) })}
                            style={{ width: 48, height: 48, borderRadius: 10, background: "hsl(var(--secondary))", border: "1.5px solid hsl(var(--border))", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >âˆ’</button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={product.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 0) {
                                updateProduct(product.id, { quantity: val });
                              }
                            }}
                            style={{
                              flex: 1,
                              height: 48,
                              textAlign: "center",
                              fontSize: 26,
                              fontWeight: 800,
                              color: "hsl(var(--primary))",
                              border: "1.5px solid hsl(var(--border))",
                              borderRadius: 10,
                              background: "hsl(var(--secondary))",
                              outline: "none",
                              width: 0,
                            }}
                          />
                          <button
                            onClick={() => updateProduct(product.id, { quantity: product.quantity + 1 })}
                            style={{ width: 48, height: 48, borderRadius: 10, background: "hsl(var(--secondary))", border: "1.5px solid hsl(var(--border))", fontSize: 22, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >+</button>
                        </div>
                      </div>

                      {/* Salvar */}
                      <button
                        onClick={() => setEditingProductId(null)}
                        style={{
                          width: "100%",
                          height: 50,
                          borderRadius: 12,
                          background: "hsl(var(--primary))",
                          color: "hsl(var(--primary-foreground))",
                          border: "none",
                          fontWeight: 700,
                          fontSize: 15,
                          cursor: "pointer",
                          boxShadow: "var(--shadow-md)",
                        }}
                      >
                        âœ“ Salvar e Fechar
                      </button>

                    </div>
                  );
                })()}
              </DialogContent>
            </Dialog>

            {modoDesktop && activeList && activeList.products.length > 0 && (
              <div style={{ 
                flex: 1, 
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 16,
                padding: modoDesktop ? 20 : 16,
                maxHeight: "70vh",
                overflowY: "auto"
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 style={{ 
                    fontSize: modoDesktop ? 18 : 16, 
                    fontWeight: 700, 
                    color: "hsl(var(--foreground))" 
                  }}>
                    Produtos Adicionados
                  </h3>
                  <span style={{ 
                    fontSize: modoDesktop ? 14 : 12, 
                    color: "hsl(var(--muted-foreground))",
                    fontWeight: 600
                  }}>
                    {activeList.products.length} itens
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {activeList.products.map((p) => (
                    <ProductCard 
                      key={p.id} 
product={p} 
                      onDelete={deleteProduct}
                      onUpdate={updateProduct}
onMoveToTop={(id) => { setEditingProductId(id); scrollToProduct(id); }}
                      onCapturePhoto={(id) => { setPhotoProductId(id); setShowPhotoCapture(true); }}
                      modoDesktop={modoDesktop} 
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Lista de produtos para mobile (mantÃ©m layout original) */}
            {!modoDesktop && activeList && activeList.products.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <p style={S.label}>Produtos adicionados</p>
                {activeList.products.map((p) => (
                  <ProductCard 
                    key={p.id} 
                    product={p} 
                    onDelete={deleteProduct}
                    onUpdate={updateProduct}
onMoveToTop={(id) => { setEditingProductId(id); scrollToProduct(id); }}
                    onCapturePhoto={(id) => { setPhotoProductId(id); setShowPhotoCapture(true); }}
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
            />
          </Suspense>
        ) : (
          <Suspense fallback={LAZY_FALLBACK}>
            <ConferenceView 
              onBack={() => setView("list")} 
              empresa={activeList?.empresa} 
              flag={activeList?.flag}
              modoDesktop={modoDesktop}
            />
          </Suspense>
        )}
      </div>

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
          Modal Nova Lista
          Passo 1: LOJA / CD
          Passo 2: Empresa (aparece apÃ³s flag)
          Passo 3: Senha (aparece apÃ³s empresa)
          Passo 4: ResponsÃ¡vel (aparece apÃ³s senha ok)
      â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
       <Dialog open={showOpenModal} onOpenChange={(open) => { setShowOpenModal(open); if (!open) resetModal(); }}>
        <DialogContent className={modoDesktop ? "max-w-md" : "max-w-sm"} style={{ 
          background: "#fff", 
          borderRadius: 20, 
          border: "1px solid hsl(var(--border))",
          padding: modoDesktop ? "24px" : "20px"
        }}>
          {!modoDesktop && <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />}

          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>
              Nova Lista
            </DialogTitle>
            {/* Breadcrumb visual do progresso */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {[
                modalFlag    ? modalFlag.toUpperCase()    : "Tipo",
                modalEmpresa ? modalEmpresa               : "Empresa",
                passwordUnlocked ? "âœ“ Senha"             : "Senha",
              ].map((step, i) => {
                const done = i === 0 ? !!modalFlag : i === 1 ? !!modalEmpresa : passwordUnlocked;
                return (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <span style={{ color: "hsl(var(--border))", fontSize: 12 }}>â€º</span>}
                    <span style={{
                      fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)",
                      color: done ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    }}>{step}</span>
                  </span>
                );
              })}
            </div>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>

            {/* â”€â”€ PASSO 1: Apenas LOJA â”€â”€ */}
            <div>
              <label style={S.label}>Tipo</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                {([
                  { flag: "loja" as const, label: "LOJA", Icon: Store, selColor: "hsl(var(--primary))" },
                ]).map(({ flag, label, Icon, selColor }) => {
                  const sel = modalFlag === flag;
                  return (
                    <button key={flag} onClick={() => selectFlag(flag)}
                      style={{
                        height: 64, borderRadius: 14, fontWeight: 800, fontSize: 15,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
                        cursor: "pointer", transition: "all 0.18s",
                        background: sel ? selColor : "hsl(var(--secondary))",
                        color: sel ? "#fff" : "hsl(var(--muted-foreground))",
                        border: sel ? `2px solid ${selColor}` : "2px solid hsl(var(--border))",
                        boxShadow: sel ? `0 4px 14px ${selColor}40` : "none",
                      }}
                    >
                      <Icon style={{ width: 20, height: 20 }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* â”€â”€ PASSO 2: Empresa (aparece apÃ³s escolher tipo) â”€â”€ */}
            {modalFlag && (
              <div>
                <label style={S.label}>Empresa</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {EMPRESAS.map((emp) => {
                    const sel = modalEmpresa === emp;
                    return (
                      <button key={emp} onClick={() => selectEmpresa(emp)}
                        style={{
                          height: 46, borderRadius: 12, fontWeight: 700, fontSize: 13,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer", transition: "all 0.18s",
                          background: sel ? "hsl(var(--foreground))" : "hsl(var(--secondary))",
                          color: sel ? "hsl(var(--background))" : "hsl(var(--foreground))",
                          border: sel ? "2px solid hsl(var(--foreground))" : "2px solid hsl(var(--border))",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {emp}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* â”€â”€ PASSO 3: Senha (aparece apÃ³s escolher empresa, antes de desbloquear) â”€â”€ */}
            {modalFlag && modalEmpresa && !passwordUnlocked && (
              <div>
                <label style={S.label}>Senha â€” {modalEmpresa} {modalFlag.toUpperCase()}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <input
                      type={showPassword ? "text" : "password"}
                      inputMode="numeric"
                      placeholder="Digite a senha"
                      value={modalPassword}
                      onChange={(e) => { setModalPassword(e.target.value); setPasswordError(false); }}
                      onKeyDown={(e) => e.key === "Enter" && checkPassword()}
                      autoFocus
                      style={{
                        ...S.inputBase,
                        borderColor: passwordError ? "hsl(var(--destructive))" : "hsl(var(--border))",
                        paddingRight: 44,
                      }}
                    />
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "hsl(var(--muted-foreground))", display: "flex" }}
                    >
                      {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                  <button onClick={checkPassword}
                    style={{ height: 48, padding: "0 18px", borderRadius: 10, background: "hsl(var(--primary))", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    OK
                  </button>
                </div>
                {passwordError && (
                  <p style={{ fontSize: 12, color: "hsl(var(--destructive))", marginTop: 5, fontWeight: 600 }}>âŒ Senha incorreta</p>
                )}
              </div>
            )}

            {/* â”€â”€ PASSO 4: TÃ­tulo + ResponsÃ¡vel â”€â”€ */}
            {passwordUnlocked && (
              <>
                {/* Badge confirmaÃ§Ã£o */}
                <div style={{ padding: "8px 14px", borderRadius: 10, background: "hsl(var(--success)/0.08)", border: "1px solid hsl(var(--success)/0.2)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: "hsl(var(--success))" }}>âœ…</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                    fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase",
                    background: "hsl(var(--primary)/0.12)",
                    color: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--primary)/0.25)",
                  }}>
                    {modalFlag!.toUpperCase()} Â· {modalEmpresa}
                  </span>
                </div>

                <div>
                  <label style={S.label}>TÃ­tulo da Lista</label>
                  <input
                    type="text"
                    placeholder="Ex: Pedido Nike, EletrÃ´nicos..."
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    autoFocus
                    style={S.inputBase}
                  />
                </div>

                <div>
                  <label style={S.label}>ResponsÃ¡vel</label>
                  <input
                    type="text"
                    placeholder="Ex: JoÃ£o Silva"
                    value={modalPerson}
                    onChange={(e) => setModalPerson(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleOpenList()}
                    style={S.inputBase}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter style={{ marginTop: 16 }}>
            <button
              onClick={handleOpenList}
              disabled={!passwordUnlocked}
              style={{
                ...S.btnPrimary, height: 50,
                opacity: passwordUnlocked ? 1 : 0.35,
                cursor: passwordUnlocked ? "pointer" : "not-allowed",
              }}
            >
              <ClipboardList style={{ width: 18, height: 18 }} /> Abrir Lista
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Importa Lista */}
      <Dialog open={showImportModal} onOpenChange={(open) => { setShowImportModal(open); if (!open) { setImportFile(null); setImportItems([]); } }}>
        <DialogContent className={modoDesktop ? "max-w-md" : "max-w-sm"} style={{ 
          background: "#fff", 
          borderRadius: 20, 
          border: "1px solid hsl(var(--border))",
          padding: modoDesktop ? "24px" : "20px"
        }}>
          {!modoDesktop && <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />}

          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>
              Importa Lista
            </DialogTitle>
            <DialogDescription style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
              Selecione um arquivo XLSX ou CSV com produtos na Coluna A
            </DialogDescription>
          </DialogHeader>

          {!activeList && (
            <div style={{ padding: "16px", background: "hsl(var(--destructive) / 0.08)", borderRadius: 10, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: "hsl(var(--destructive))", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <AlertCircle style={{ width: 16, height: 16 }} />
                Abra uma lista primeiro
              </p>
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                Ã‰ necessÃ¡rio ter uma lista aberta para importar produtos.
              </p>
            </div>
          )}

{/* SeleÃ§Ã£o de arquivo */}
          {activeList && (
            <div style={{ marginBottom: 16 }}>
              {/* input escondido â€” acionado por onClick para funcionar no iOS/Android */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportSpreadsheet(file);
                  // Limpa o valor para permitir selecionar o mesmo arquivo novamente
                  e.target.value = "";
                }}
                style={{ display: "none", position: "absolute", opacity: 0, pointerEvents: "none" }}
              />
              <button
                type="button"
                onClick={() => {
                  // Usa o ref diretamente â€” compatÃ­vel com iOS Safari e Android Chrome
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                    fileInputRef.current.click();
                  }
                }}
                style={{ 
                  width: "100%",
                  display: "flex", 
                  flexDirection: "column", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  gap: 12,
                  padding: "32px 20px",
                  border: "2px dashed hsl(var(--border))",
                  borderRadius: 14,
                  cursor: "pointer",
                  background: "hsl(var(--secondary))",
                  WebkitAppearance: "none",
                  appearance: "none",
                }}
              >
                <FileUp style={{ width: 32, height: 32, color: "hsl(var(--muted-foreground))" }} />
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))" }}>
                    Selecionar Arquivo
                  </p>
                  <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginTop: 2 }}>
                    XLSX ou CSV (atÃ© 200 itens)
                  </p>
                </div>
              </button>
            </div>
          )}

          <DialogFooter style={{ marginTop: 16 }}>
            <button
              onClick={() => { setShowImportModal(false); setImportFile(null); setImportItems([]); }}
              style={{
                width: "100%",
                height: 48,
                borderRadius: 12,
                background: "hsl(var(--secondary))",
                color: "hsl(var(--foreground))",
                border: "1.5px solid hsl(var(--border))",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showScanner && (
        <Suspense fallback={LAZY_FALLBACK}>
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}
      {showPhotoCapture && photoProductId && (
        <Suspense fallback={LAZY_FALLBACK}>
          <PhotoCapture
            photo={activeList?.products.find(p => p.id === photoProductId)?.photo || null}
            onCapture={(photo) => {
              if (photoProductId) {
                updateProduct(photoProductId, { photo });
                setShowPhotoCapture(false);
                setPhotoProductId(null);
              }
            }}
            onRemove={() => {
              if (photoProductId) {
                updateProduct(photoProductId, { photo: null });
                setShowPhotoCapture(false);
                setPhotoProductId(null);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Index;






