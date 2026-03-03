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
    { key: "list" as const, label: "Lista", Icon: ClipboardList },
    { key: "conference" as const, label: "Conferência", Icon: GitCompare },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      <header className="bg-primary text-primary-foreground px-4 py-4 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ScanBarcode className="w-7 h-7" />
          <div>
            <h1 className="text-lg font-bold leading-tight">SCAN NEWSHOP</h1>
            <p className="text-xs opacity-80">
              {activeList ? `${activeList.title} • ${productCount} produto(s)` : "Sistema de inventário"}
            </p>
          </div>
        </div>
      </header>

      <div className="flex bg-card border-b border-border">
        {tabs.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setView(key)}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
              view === key ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {view === "scan" ? (
          <div className="p-4 space-y-4">
            {activeList ? (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary font-bold truncate">{activeList.title}</p>
                  <p className="text-xs text-primary/70">👤 {activeList.person} • {productCount} produto(s)</p>
                </div>
                <button onClick={() => {
                                        if (window.confirm(`Fechar a lista "${activeList?.title}"? Ela irá para o histórico.`)) {
                                         closeList();
                                                      }
                                        }}
                  className="h-9 px-3 bg-destructive text-destructive-foreground rounded-xl font-semibold text-xs flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Lock className="w-3.5 h-3.5" /> Fechar
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setShowOpenModal(true)}
                  className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
                >
                  <ClipboardList className="w-5 h-5" /> Abrir Lista
                </button>
                <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-destructive" />
                  <p className="text-sm text-destructive font-medium">Abra uma lista para adicionar produtos</p>
                </div>
              </>
            )}

            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Código de Barras</label>
              <BarcodeInput value={barcode} onChange={setBarcode} onScanPress={() => setShowScanner(true)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">SKU</label>
              <input type="text" placeholder="Ex: BM-5050" value={sku} onChange={(e) => setSku(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Foto do Produto</label>
              <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Quantidade</label>
              <input type="number" inputMode="numeric" min="1" placeholder="Ex: 10" value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                <Tag className="w-4 h-4" /> Tira Etiqueta?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([true, false] as const).map((val) => (
                  <button key={String(val)} onClick={() => setRemoveTag(val)}
                    className={`h-12 rounded-xl font-semibold text-sm flex items-center justify-center transition-all border ${
                      removeTag === val
                        ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                        : "bg-card text-muted-foreground border-border"
                    }`}
                  >
                    {val ? "SIM" : "NÃO"}
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleAdd} disabled={!activeList}
              className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus className="w-5 h-5" /> Adicionar Produto
            </button>

            {/* preview of current products */}
            {activeList && activeList.products.length > 0 && (
              <div className="space-y-2 mt-4">
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

      <Dialog open={showOpenModal} onOpenChange={setShowOpenModal}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Abrir Nova Lista</DialogTitle>
            <DialogDescription>Preencha os dados para iniciar</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">Descrição</label>
              <input type="text" placeholder="Ex: Pedido Nike" value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">Nome</label>
              <input type="text" placeholder="Ex: João Silva" value={modalPerson}
                onChange={(e) => setModalPerson(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOpenList()}
                className="w-full h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={handleOpenList}
              className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
            >
              <ClipboardList className="w-5 h-5" /> Abrir Lista
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showScanner && (
        <BarcodeScanner onDetected={handleBarcodeDetected} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
};

export default Index;