import { useState, useCallback } from "react";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, Lock, Tag, GitCompare } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import PhotoCapture from "@/components/PhotoCapture";
import ListHistory from "@/components/ListHistory";
import ConferenceView from "@/components/ConferenceView";
import ProductCard from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

const LOGO = "data:image/jpeg;base64,/9j/4QAYRXhpZgAASUkqAAgAAAAAAAAAAAAAAP/sABFEdWNreQABAAQAAABkAAD/4QMwaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLwA8P3hwYWNrZXQgYmVnaW49Iu+7vyIgaWQ9Ilc1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCI/PiA8eDp4bXBtZXRhIHhtbG5zOng9ImFkb2JlOm5zOm1ldGEvIiB4OnhtcHRrPSJBZG9iZSBYTVAgQ29yZSA5LjEtYzAwMiA3OS5hNmE2Mzk2OGEsIDIwMjQvMDMvMDYtMTE6NTI6MDUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnhtcD0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wLyIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bXA6Q3JlYXRvclRvb2w9IkFkb2JlIFBob3Rvc2hvcCAyNS4xMSAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QjIwNEU4RUM4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QjIwNEU4RUQ4MTdBMTFFRkIwQUNBMjBCNTgyOThGQUUiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpCMjA0RThFQTgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpCMjA0RThFQjgxN0ExMUVGQjBBQ0EyMEI1ODI5OEZBRSIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pv/uAA5BZG9iZQBkwAAAAAH/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAMgAyADASIAAhEBAxEB/8QAHgABAAICAwEBAQAAAAAAAAAAAAgJBwoEBQYCAwH/xABYEAEAAQMDAgIEBgwKBwQJBQAAAQIDBAUGBwgREiEJEzFBGSJRV2F2FDI2OEJxdZWztNHTFRYjN1JigZGUlhcYWHJzscMkM0PUJVN0goOSoaOyNFRVk9L/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AqqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/9k=";

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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab");

  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [removeTag, setRemoveTag] = useState(false);
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" ? "conference" : initialTab === "list" ? "list" : "scan"
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalPerson, setModalPerson] = useState("");

  const { lists, activeList, openList, closeList, addProduct, updateList, deleteProduct } = useInventory();

  const handleBarcodeDetected = useCallback((code: string) => {
    setBarcode(code);
    setShowScanner(false);
  }, []);

  const handleOpenList = () => {
    const ok = openList({ title: modalTitle, person: modalPerson });
    if (ok) { setShowOpenModal(false); setModalTitle(""); setModalPerson(""); }
  };

  const handleAdd = () => {
    const ok = addProduct({ barcode, sku, photo, quantity: Number(quantity), removeTag });
    if (ok) { setBarcode(""); setSku(""); setPhoto(null); setQuantity(""); setRemoveTag(false); }
  };

  const productCount = activeList?.products.length ?? 0;

  const tabs = [
    { key: "scan" as const, label: "Escanear", Icon: ScanBarcode },
    { key: "list" as const, label: "Lista",    Icon: ClipboardList },
    { key: "conference" as const, label: "Conferência", Icon: GitCompare },
  ];

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto" style={{ background: "hsl(var(--background))" }}>

      {/* ── Header ── */}
      <header style={{ background: "hsl(var(--primary))", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate("/")} style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>
          <img src={LOGO} alt="Newshop" style={{ height: 22, filter: "brightness(0) invert(1)", objectFit: "contain" }} />
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(255,255,255,0.45)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            {activeList ? activeList.title : "Pedido"}
          </p>
          {activeList && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,0.8)", marginTop: 1 }}>
              {productCount} produto(s)
            </p>
          )}
        </div>
      </header>

      {/* ── Active banner ── */}
      {activeList && (
        <div style={{ background: "hsl(38 92% 50% / 0.12)", borderBottom: "1.5px solid hsl(38 92% 50% / 0.2)", padding: "10px 20px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--warning))", flexShrink: 0, display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
          <style>{"\@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}"}</style>
          <p style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            {activeList.title} <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}>· {activeList.person}</span>
          </p>
          <button
            onClick={() => { if (window.confirm(`Fechar "${activeList?.title}"?`)) closeList(); }}
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "hsl(var(--destructive))", background: "transparent", border: "1px solid hsl(var(--destructive) / 0.3)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}
          >
            Fechar
          </button>
        </div>
      )}

      {/* ── Tabs ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid hsl(var(--border))", display: "flex", padding: "0 8px" }}>
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setView(key)}
            style={{
              flex: 1, padding: "11px 0 9px", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.06em", textTransform: "uppercase",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
              background: "transparent", border: "none",
              borderBottom: view === key ? "2.5px solid hsl(var(--primary))" : "2.5px solid transparent",
              color: view === key ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
              cursor: "pointer", transition: "all 0.18s",
            }}
          >
            <Icon style={{ width: 15, height: 15 }} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: view === "scan" ? "20px" : "0" }}>
        {view === "scan" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* List status */}
            {activeList ? null : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={() => setShowOpenModal(true)} style={{ ...S.btnPrimary }}>
                  <ClipboardList style={{ width: 18, height: 18 }} /> Abrir Nova Lista
                </button>
                <div style={{ background: "hsl(var(--destructive) / 0.07)", border: "1px solid hsl(var(--destructive) / 0.15)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <ClipboardList style={{ width: 15, height: 15, color: "hsl(var(--destructive))", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "hsl(var(--destructive))", fontWeight: 500 }}>Abra uma lista para adicionar produtos</p>
                </div>
              </div>
            )}

            {/* Barcode */}
            <div>
              <label style={S.label}>Código de Barras</label>
              <BarcodeInput value={barcode} onChange={setBarcode} onScanPress={() => setShowScanner(true)} />
            </div>

            {/* SKU */}
            <div>
              <label style={S.label}>SKU</label>
              <input type="text" placeholder="Ex: BM-5050" value={sku} onChange={(e) => setSku(e.target.value)} style={S.inputBase} />
            </div>

            {/* Photo */}
            <div>
              <label style={S.label}>Foto do Produto</label>
              <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
            </div>

            {/* Quantity */}
            <div>
              <label style={S.label}>Quantidade</label>
              <input type="number" inputMode="numeric" min="1" placeholder="0" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                style={{ ...S.inputBase, fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700 }}
              />
            </div>

            {/* Tag toggle */}
            <div>
              <label style={{ ...S.label, display: "flex", alignItems: "center", gap: 6 }}>
                <Tag style={{ width: 12, height: 12 }} /> Tira Etiqueta?
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([true, false] as const).map((val) => (
                  <button key={String(val)} onClick={() => setRemoveTag(val)}
                    style={{
                      height: 46, borderRadius: 10, fontWeight: 700, fontSize: 13,
                      letterSpacing: "0.06em", cursor: "pointer", transition: "all 0.18s",
                      background: removeTag === val ? "hsl(var(--primary))" : "hsl(var(--secondary))",
                      color: removeTag === val ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                      border: removeTag === val ? "2px solid hsl(var(--primary))" : "2px solid hsl(var(--border))",
                    }}
                  >
                    {val ? "SIM" : "NÃO"}
                  </button>
                ))}
              </div>
            </div>

            {/* Add button */}
            <button onClick={handleAdd} disabled={!activeList}
              style={{
                ...S.btnPrimary, height: 56, fontSize: 15,
                opacity: activeList ? 1 : 0.45, cursor: activeList ? "pointer" : "not-allowed",
              }}
            >
              <Plus style={{ width: 20, height: 20 }} /> Adicionar Produto
            </button>

            {/* Products */}
            {activeList && activeList.products.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <p style={S.label}>Produtos adicionados</p>
                {activeList.products.map((p) => (
                  <ProductCard key={p.id} product={p} onDelete={deleteProduct} />
                ))}
              </div>
            )}
          </div>
        ) : view === "list" ? (
          <ListHistory lists={lists} onUpdateList={updateList} onStartConference={() => setView("conference")} />
        ) : (
          <ConferenceView onBack={() => setView("list")} />
        )}
      </div>

      {/* ── Modal Open List ── */}
      <Dialog open={showOpenModal} onOpenChange={setShowOpenModal}>
        <DialogContent className="max-w-sm" style={{ background: "#fff", borderRadius: 20, border: "1px solid hsl(var(--border))" }}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>Nova Lista</DialogTitle>
            <DialogDescription style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>Preencha os dados para começar</DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
            <div>
              <label style={S.label}>Descrição</label>
              <input type="text" placeholder="Ex: Pedido Nike" value={modalTitle} onChange={(e) => setModalTitle(e.target.value)} style={S.inputBase} />
            </div>
            <div>
              <label style={S.label}>Responsável</label>
              <input type="text" placeholder="Ex: João Silva" value={modalPerson} onChange={(e) => setModalPerson(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOpenList()} style={S.inputBase} />
            </div>
          </div>
          <DialogFooter style={{ marginTop: 16 }}>
            <button onClick={handleOpenList} style={{ ...S.btnPrimary, height: 50 }}>
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

