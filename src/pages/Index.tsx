import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, GitCompare, Loader2, AlertCircle, ShoppingCart } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import ProductCard from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
import { useProductLookup } from "@/hooks/useProductLookup";
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

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");

  const [barcode, setBarcode] = useState(() => sessionStorage.getItem("scan_barcode") ?? "");
  const [sku, setSku] = useState(() => sessionStorage.getItem("scan_sku") ?? "");
  const [photo, setPhoto] = useState<string | null>(() => sessionStorage.getItem("scan_photo") ?? null);
  const [quantity, setQuantity] = useState(() => sessionStorage.getItem("scan_quantity") ?? "");
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" ? "conference" : initialTab === "list" ? "list" : "scan"
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showProductInfo, setShowProductInfo] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [photoProductId, setPhotoProductId] = useState<string | null>(null);

  const [modoDesktop, setModoDesktop] = useState(() => localStorage.getItem("modoDesktop") === "true");

  const { lists, activeList, closeList, addProduct, updateList, deleteProduct, updateProduct, moveProductToTop } = useInventory();
  const { productInfo, loading, error, lookupProduct } = useProductLookup();

  useEffect(() => {
    sessionStorage.setItem("scan_barcode", barcode);
  }, [barcode]);

  useEffect(() => {
    sessionStorage.setItem("scan_sku", sku);
  }, [sku]);

  useEffect(() => {
    sessionStorage.setItem("scan_photo", photo ?? "");
  }, [photo]);

  useEffect(() => {
    sessionStorage.setItem("scan_quantity", quantity);
  }, [quantity]);

  useEffect(() => {
    const handleStorageChange = () => {
      setModoDesktop(localStorage.getItem("modoDesktop") === "true");
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  useEffect(() => {
    if (!productInfo) return;
    const descricao = productInfo.descricao || productInfo.nome_produto;
    if (descricao) setSku(descricao);
  }, [productInfo]);

  const handleBarcodeDetected = useCallback(
    (code: string) => {
      setShowScanner(false);
      setBarcode(code);
      setShowProductInfo(true);
      lookupProduct(code);
    },
    [lookupProduct]
  );

  const handleCloseList = () => {
    if (!activeList) return;
    if (!window.confirm("Fechar lista atual?")) return;
    closeList();
    toast({ title: "Lista fechada" });
  };

  const handleAdd = () => {
    const ok = addProduct({ barcode, sku, photo, quantity: Number(quantity) });
    if (!ok) return;

    setBarcode("");
    setSku("");
    setPhoto(null);
    setQuantity("");
    sessionStorage.removeItem("scan_barcode");
    sessionStorage.removeItem("scan_sku");
    sessionStorage.removeItem("scan_photo");
    sessionStorage.removeItem("scan_quantity");
  };

  const productCount = activeList?.products.length ?? 0;
  const currentLogin = obterLoginSalvo();

  const handleTabChange = (key: "scan" | "list" | "conference" | "compras") => {
    if (key === "compras") {
      navigate("/compras");
      return;
    }
    setView(key);
  };

  const extraTab = currentLogin?.role === "compras" ? [{ key: "compras" as const, label: "COMPRADOR", Icon: ShoppingCart }] : [];
  const tabs = [
    { key: "scan" as const, label: "Escanear", Icon: ScanBarcode },
    { key: "list" as const, label: "Lista", Icon: ClipboardList },
    { key: "conference" as const, label: "Conferencia", Icon: GitCompare },
    ...extraTab,
  ];

  const flagBadge = { bg: "hsl(var(--primary)/0.10)", border: "hsl(var(--primary)/0.20)", text: "hsl(var(--primary))" };

  return (
    <div className={`min-h-screen flex flex-col ${modoDesktop ? "max-w-6xl mx-auto" : "max-w-md mx-auto"}`} style={{ background: "hsl(var(--background))" }}>
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
          <img src={LOGO} alt="Newshop" style={{ height: modoDesktop ? 26 : 22, filter: "brightness(0) invert(1)", objectFit: "contain" }} />
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
            gap: 10,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--warning))", flexShrink: 0, display: "inline-block" }} />
          <p style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            {activeList.title}
            <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}> . {activeList.person}</span>
          </p>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: flagBadge.bg, border: `1px solid ${flagBadge.border}`, color: flagBadge.text }}>
            {activeList.flag?.toUpperCase() ?? "LOJA"} . {activeList.empresa ? activeList.empresa.split(" ")[0] : ""}
          </span>
          <button
            onClick={handleCloseList}
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
              {!activeList && (
                <div style={{ background: "hsl(var(--destructive) / 0.07)", border: "1px solid hsl(var(--destructive) / 0.15)", borderRadius: 10, padding: modoDesktop ? "16px 20px" : "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <ClipboardList style={{ width: modoDesktop ? 16 : 15, height: modoDesktop ? 16 : 15, color: "hsl(var(--destructive))", flexShrink: 0 }} />
                  <p style={{ fontSize: modoDesktop ? 14 : 13, color: "hsl(var(--destructive))", fontWeight: 500 }}>Abra uma lista para adicionar produtos</p>
                </div>
              )}

              {showProductInfo && (
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
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <h4 style={{ fontWeight: 700, fontSize: 15 }}>{productInfo.nome_produto || productInfo.descricao || "Produto sem nome"}</h4>
                        {typeof productInfo.preco === "number" && <span style={{ fontWeight: 800, fontSize: 16, color: "hsl(var(--primary))" }}>R$ {productInfo.preco.toFixed(2)}</span>}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>Estoque disponivel:</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{typeof productInfo.estoque === "number" ? productInfo.estoque : "N/A"}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              <div>
                <label style={S.label}>Codigo de Barras</label>
                <BarcodeInput
                  value={barcode}
                  onChange={setBarcode}
                  onScanPress={() => setShowScanner(true)}
                  onEnterPress={() => {
                    if (!barcode.trim()) return;
                    setShowProductInfo(true);
                    lookupProduct(barcode.trim());
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
                <input type="number" inputMode="numeric" min="1" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-tut="scanner-quantity" style={{ ...S.inputBase, fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }} />
              </div>

              <button
                onClick={handleAdd}
                disabled={!activeList}
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
            <ListHistory lists={lists} onUpdateList={updateList} onStartConference={() => setView("conference")} modoDesktop={modoDesktop} />
          </Suspense>
        ) : (
          <Suspense fallback={LAZY_FALLBACK}>
            <ConferenceView onBack={() => setView("list")} empresa={activeList?.empresa} flag={activeList?.flag} modoDesktop={modoDesktop} />
          </Suspense>
        )}
      </div>

      {showScanner && (
        <Suspense fallback={LAZY_FALLBACK}>
          <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
        </Suspense>
      )}

      {showPhotoCapture && photoProductId && (
        <Suspense fallback={LAZY_FALLBACK}>
          <PhotoCapture
            photo={activeList?.products.find((p) => p.id === photoProductId)?.photo || null}
            onCapture={(nextPhoto) => {
              if (!photoProductId) return;
              updateProduct(photoProductId, { photo: nextPhoto });
              setShowPhotoCapture(false);
              setPhotoProductId(null);
            }}
            onRemove={() => {
              if (!photoProductId) return;
              updateProduct(photoProductId, { photo: null });
              setShowPhotoCapture(false);
              setPhotoProductId(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Index;
