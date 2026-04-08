import { useState, useCallback, useEffect } from "react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, GitCompare, Store, Eye, EyeOff, Loader2, AlertCircle, Monitor, Smartphone } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import PhotoCapture from "@/components/PhotoCapture";
import ListHistory from "@/components/ListHistory";
import ConferenceView from "@/components/ConferenceView";
import ProductCard from "@/components/ProductCard";
import { ListFlag } from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
import { useProductLookup } from "@/hooks/useProductLookup";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const LOGO = "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAABkAAD/4QMwaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA5LjEtYzAwMiA3OS5hNmE2Mzk2OGEsIDIwMjQvMDMvMDYtMTE6NTI6MDUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNS4xMSAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QjIwNEU4RUM4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QjIwNEU4RUQ4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpCMjA0RThFQTgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpCMjA0RThFQjgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pv/uAA5BZG9iZQBkwAAAAAH/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAARCAMgAyADASIAAhEBAxEB/8QAHgABAAICAwEBAQAAAAAAAAAAAAgJBwoEBQYCAwH/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/wAARCAMgAyADASIAAhEBAxEB/9sAQwADAgICAgIDAgICA";

// ── Configuração de empresas e senhas ────────────────────────────────────────
type Empresa = "NEWSHOP" | "SOYE" | "FACIL";

const EMPRESAS: Empresa[] = ["NEWSHOP", "SOYE", "FACIL"];

const SENHAS: Record<"loja", Record<Empresa, string>> = {
  loja: {
    "NEWSHOP":       "1148",
    "SOYE":          "1090",
    "FACIL": "2461",
  },
};

/* ── Shared style tokens ── */
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

  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" ? "conference" : initialTab === "list" ? "list" : "scan"
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showProductInfo, setShowProductInfo] = useState(false);

  // ── Estado do modal ─────────────────────────────────────────────────────
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

  const { lists, activeList, openList, closeList, addProduct, updateList, deleteProduct } = useInventory();
  const { productInfo, loading, error, lookupProduct } = useProductLookup();

  // Preencher modal com dados do login salvo quando abrir
  useEffect(() => {
    if (showOpenModal) {
      const login = obterLoginSalvo();
      if (login) {
        // Definir flag como "loja" (única opção)
        setModalFlag("loja");
        setModalEmpresa(login.empresa);
        // Senha já foi validada anteriormente, então desbloquear diretamente
        setPasswordUnlocked(true);
        // Preencher título e pessoa com os valores padrão
        setModalTitle(login.tituloPadrao || "");
        setModalPerson(login.nomePessoa || "");
      } else {
        // Se não há login, resetar modal
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
    setBarcode(code);
    setShowScanner(false);
    setShowProductInfo(true);
    // Buscar informações do produto automaticamente
    lookupProduct(code);
  }, [lookupProduct]);

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
          toast({ title: "Nova lista aberta automaticamente!", description: `${login.tituloPadrao} • ${login.nomePessoa}` });
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

  const handleOpenList = () => {
    if (!modalFlag)          { toast({ title: "Selecione LOJA",              variant: "destructive" }); return; }
    if (!modalEmpresa)       { toast({ title: "Selecione a empresa",          variant: "destructive" }); return; }
    if (!passwordUnlocked)   { toast({ title: "Confirme a senha primeiro",    variant: "destructive" }); return; }
    if (!modalTitle.trim())  { toast({ title: "Informe o título da lista",    variant: "destructive" }); return; }
    if (!modalPerson.trim()) { toast({ title: "Informe o responsável",        variant: "destructive" }); return; }

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
    if (ok) { setBarcode(""); setSku(""); setPhoto(null); setQuantity(""); }
  };

  const productCount = activeList?.products.length ?? 0;

  const tabs = [
    { key: "scan"       as const, label: "Escanear",    Icon: ScanBarcode  },
    { key: "list"       as const, label: "Lista",        Icon: ClipboardList },
    { key: "conference" as const, label: "Conferência",  Icon: GitCompare   },
  ];

  // Badge da flag ativa no banner
  const flagBadge = { bg: "hsl(var(--primary)/0.10)", border: "hsl(var(--primary)/0.20)", text: "hsl(var(--primary))" };

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? 'max-w-6xl mx-auto' : 'max-w-md mx-auto'}`} style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
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
                Sistema de Leitura de Códigos
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
              {modoDesktop ? "🖥️ Modo Desktop" : "📱 Modo Mobile"}
            </p>
          )}
        </div>
      </header>

      {/* ── Active banner ── */}
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
            <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}> · {activeList.person}</span>
          </p>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: flagBadge.bg, border: `1px solid ${flagBadge.border}`, color: flagBadge.text }}>
            {activeList.flag?.toUpperCase() ?? "LOJA"} · {activeList.empresa ? activeList.empresa.split(" ")[0] : ""}
          </span>
          <button
            onClick={handleCloseList}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "hsl(var(--destructive))", background: "transparent", border: "1px solid hsl(var(--destructive) / 0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Fechar
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ 
        background: "#fff", 
        borderBottom: "1px solid hsl(var(--border))", 
        display: "flex", 
        padding: modoDesktop ? "0 32px" : "0 8px" 
      }}>
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setView(key)}
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

      {/* ── Content ── */}
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
                  <button onClick={() => setShowOpenModal(true)} style={{ 
                    ...S.btnPrimary,
                    fontSize: modoDesktop ? 15 : 14,
                    height: modoDesktop ? 56 : 52
                  }}>
                    <ClipboardList style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} /> Abrir Nova Lista
                  </button>
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

                  {/* Botão temporário para testar a API do Varejo Fácil - Remover depois */}
                  <button onClick={() => {
                    setActiveList({
                      id: "test-" + Date.now(),
                      title: "Teste API",
                      person: "TESTE",
                      empresa: "NEWSHOP",
                      flag: "loja",
                      products: [],
                      createdAt: new Date(),
                      status: "open",
                    });
                  }} style={{ 
                    ...S.btnPrimary, 
                    background: "hsl(var(--warning))", 
                    color: "hsl(var(--warning-foreground))",
                    fontSize: modoDesktop ? 15 : 14,
                    height: modoDesktop ? 56 : 52
                  }}>
                    <ClipboardList style={{ width: modoDesktop ? 20 : 18, height: modoDesktop ? 20 : 18 }} /> Criar Lista de Teste (API)
                  </button>
                </div>
              )}

            {/* Exibição das informações do produto */}
            {showProductInfo && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 16 }}>Informações do Produto</h3>
                  <button
                    onClick={() => setShowProductInfo(false)}
                    style={{ background: "none", border: "none", color: "hsl(var(--muted-foreground))", cursor: "pointer" }}
                  >
                    ✕
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
                      <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Estoque disponível:</span>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>
                        {typeof productInfo.estoque === 'number' ? productInfo.estoque : "N/A"}
                      </span>
                    </div>

                    {/* Indicador de origem dos dados */}
                    <div style={{ marginTop: 12, padding: 8, background: "hsl(var(--primary) / 0.1)", borderRadius: 6, fontSize: 11, color: "hsl(var(--primary))" }}>
                      Informações {" "}
                      {productInfo.nome_produto && typeof productInfo.preco === 'number' ? "atualizadas via API" : "do banco de dados local"}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label style={S.label}>Código de Barras</label>
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

            <div>
              <label style={S.label}>SKU</label>
              <input type="text" placeholder="Ex: BM-5050" value={sku} onChange={(e) => setSku(e.target.value)} style={S.inputBase} />
            </div>

            <div>
              <label style={S.label}>Foto do Produto</label>
              <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
            </div>

            <div>
              <label style={S.label}>Quantidade</label>
              <input type="number" inputMode="numeric" min="1" placeholder="0" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ ...S.inputBase, fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}
              />
            </div>



            <button onClick={handleAdd} disabled={!activeList}
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

            {/* Coluna direita - Lista de produtos (apenas no desktop quando há produtos) */}
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
                    <ProductCard key={p.id} product={p} onDelete={deleteProduct} modoDesktop={modoDesktop} />
                  ))}
                </div>
              </div>
            )}

            {/* Lista de produtos para mobile (mantém layout original) */}
            {!modoDesktop && activeList && activeList.products.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <p style={S.label}>Produtos adicionados</p>
                {activeList.products.map((p) => (
                  <ProductCard key={p.id} product={p} onDelete={deleteProduct} modoDesktop={modoDesktop} />
                ))}
              </div>
            )}
          </div>
        ) : view === "list" ? (
          <ListHistory 
            lists={lists} 
            onUpdateList={updateList} 
            onStartConference={() => setView("conference")} 
            modoDesktop={modoDesktop}
          />
        ) : (
          <ConferenceView 
            onBack={() => setView("list")} 
            empresa={activeList?.empresa} 
            flag={activeList?.flag}
            modoDesktop={modoDesktop}
          />
        )}
      </div>

      {/* ══════════════════════════════════════════
          Modal Nova Lista
          Passo 1: LOJA / CD
          Passo 2: Empresa (aparece após flag)
          Passo 3: Senha (aparece após empresa)
          Passo 4: Responsável (aparece após senha ok)
      ══════════════════════════════════════════ */}
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
                passwordUnlocked ? "✓ Senha"             : "Senha",
              ].map((step, i) => {
                const done = i === 0 ? !!modalFlag : i === 1 ? !!modalEmpresa : passwordUnlocked;
                return (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <span style={{ color: "hsl(var(--border))", fontSize: 12 }}>›</span>}
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

            {/* ── PASSO 1: Apenas LOJA ── */}
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

            {/* ── PASSO 2: Empresa (aparece após escolher tipo) ── */}
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

            {/* ── PASSO 3: Senha (aparece após escolher empresa, antes de desbloquear) ── */}
            {modalFlag && modalEmpresa && !passwordUnlocked && (
              <div>
                <label style={S.label}>Senha — {modalEmpresa} {modalFlag.toUpperCase()}</label>
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
                  <p style={{ fontSize: 12, color: "hsl(var(--destructive))", marginTop: 5, fontWeight: 600 }}>❌ Senha incorreta</p>
                )}
              </div>
            )}

            {/* ── PASSO 4: Título + Responsável ── */}
            {passwordUnlocked && (
              <>
                {/* Badge confirmação */}
                <div style={{ padding: "8px 14px", borderRadius: 10, background: "hsl(var(--success)/0.08)", border: "1px solid hsl(var(--success)/0.2)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", color: "hsl(var(--success))" }}>✅</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                    fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase",
                    background: "hsl(var(--primary)/0.12)",
                    color: "hsl(var(--primary))",
                    border: "1px solid hsl(var(--primary)/0.25)",
                  }}>
                    {modalFlag!.toUpperCase()} · {modalEmpresa}
                  </span>
                </div>

                <div>
                  <label style={S.label}>Título da Lista</label>
                  <input
                    type="text"
                    placeholder="Ex: Pedido Nike, Eletrônicos..."
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    autoFocus
                    style={S.inputBase}
                  />
                </div>

                <div>
                  <label style={S.label}>Responsável</label>
                  <input
                    type="text"
                    placeholder="Ex: João Silva"
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

      {showScanner && <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />}
    </div>
  );
};

export default Index;

