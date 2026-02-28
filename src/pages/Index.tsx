import { useState, useCallback } from "react";
import {
  Plus,
  ClipboardList,
  ScanBarcode,
  ArrowLeft,
  Lock,
  Tag,
  GitCompare,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import PhotoCapture from "@/components/PhotoCapture";
import { Product, ListData } from "@/components/ProductCard";
import ListHistory from "@/components/ListHistory";
import ConferenceView from "@/components/ConferenceView";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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

  // All lists (history)
  const [lists, setLists] = useState<ListData[]>([]);
  // Currently open list ID
  const [activeListId, setActiveListId] = useState<string | null>(null);

  const { toast } = useToast();

  const activeList = lists.find((l) => l.id === activeListId && l.status === "open") || null;

  const handleBarcodeDetected = useCallback((code: string) => {
    setBarcode(code);
    setShowScanner(false);
    toast({ title: "Código lido!", description: code });
  }, [toast]);

  const handleOpenList = () => {
    if (!modalTitle.trim()) {
      toast({ title: "Informe a descrição", variant: "destructive" });
      return;
    }
    if (!modalPerson.trim()) {
      toast({ title: "Informe o nome", variant: "destructive" });
      return;
    }
    const newList: ListData = {
      id: crypto.randomUUID(),
      title: modalTitle.trim(),
      person: modalPerson.trim(),
      products: [],
      createdAt: new Date(),
      status: "open",
    };
    setLists((prev) => [...prev, newList]);
    setActiveListId(newList.id);
    setShowOpenModal(false);
    setModalTitle("");
    setModalPerson("");
    toast({ title: "Lista aberta!", description: `${newList.title} • ${newList.person}` });
  };

  const handleCloseList = () => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeListId ? { ...l, status: "yellow" as const, closedAt: new Date() } : l
      )
    );
    setActiveListId(null);
    setView("list");
    toast({ title: "Lista fechada!", description: "Disponível no histórico." });
  };

  const handleAdd = () => {
    if (!activeList) {
      toast({ title: "Abra uma lista primeiro", variant: "destructive" });
      return;
    }
    if (!barcode.trim()) {
      toast({ title: "Preencha o código de barras", variant: "destructive" });
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      toast({ title: "Informe a quantidade", variant: "destructive" });
      return;
    }

    const newProduct: Product = {
      id: crypto.randomUUID(),
      barcode: barcode.trim(),
      sku: sku.trim(),
      photo,
      quantity: Number(quantity),
      removeTag,
      createdAt: new Date(),
    };

    setLists((prev) =>
      prev.map((l) =>
        l.id === activeListId ? { ...l, products: [...l.products, newProduct] } : l
      )
    );
    setBarcode("");
    setSku("");
    setPhoto(null);
    setQuantity("");
    toast({ title: "Produto adicionado!", description: newProduct.barcode });
  };

  const handleDeleteProduct = (productId: string) => {
    if (!activeListId) return;
    setLists((prev) =>
      prev.map((l) =>
        l.id === activeListId
          ? { ...l, products: l.products.filter((p) => p.id !== productId) }
          : l
      )
    );
  };

  const handleUpdateList = (updated: ListData) => {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const productCount = activeList?.products.length || 0;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-4 py-4 safe-top">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ScanBarcode className="w-7 h-7" />
          <div>
            <h1 className="text-lg font-bold leading-tight">SCAN NEWSHOP</h1>
            <p className="text-xs opacity-80">
              {activeList
                ? `${activeList.title} • ${productCount} produto(s)`
                : "Sistema de inventário"}
            </p>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex bg-card border-b border-border">
        <button
          onClick={() => setView("scan")}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === "scan" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
          }`}
        >
          <ScanBarcode className="w-4 h-4" />
          Escanear
        </button>
        <button
          onClick={() => setView("list")}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === "list" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Lista
        </button>
        <button
          onClick={() => setView("conference")}
          className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            view === "conference" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
          }`}
        >
          <GitCompare className="w-4 h-4" />
          Conferência
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "scan" ? (
          <div className="p-4 space-y-4">
            {/* Open list button / Active list banner */}
            {activeList ? (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-3">
                <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-primary font-bold truncate">{activeList.title}</p>
                  <p className="text-xs text-primary/70">
                    👤 {activeList.person} • {productCount} produto(s)
                  </p>
                </div>
                <button
                  onClick={handleCloseList}
                  className="h-9 px-3 bg-destructive text-destructive-foreground rounded-xl font-semibold text-xs flex items-center gap-1.5 active:scale-[0.98] transition-transform"
                >
                  <Lock className="w-3.5 h-3.5" /> Fechar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowOpenModal(true)}
                className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
              >
                <ClipboardList className="w-5 h-5" />
                Abrir Lista
              </button>
            )}

            {!activeList && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive font-medium">
                  Abra uma lista para adicionar produtos
                </p>
              </div>
            )}

            {/* Barcode */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Código de Barras</label>
              <BarcodeInput value={barcode} onChange={setBarcode} onScanPress={() => setShowScanner(true)} />
            </div>

            {/* SKU */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">SKU</label>
              <input
                type="text"
                placeholder="Ex: BM-5050"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            {/* Photo */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Foto do Produto</label>
              <PhotoCapture photo={photo} onCapture={setPhoto} onRemove={() => setPhoto(null)} />
            </div>

            {/* Quantity */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block">Quantidade</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="Ex: 10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            {/* Remove tag toggle */}
            <div>
              <label className="text-sm font-semibold text-foreground mb-1.5 block flex items-center gap-1.5">
                <Tag className="w-4 h-4" /> Tira Etiqueta?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRemoveTag(true)}
                  className={`h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border ${
                    removeTag
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  SIM
                </button>
                <button
                  onClick={() => setRemoveTag(false)}
                  className={`h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border ${
                    !removeTag
                      ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  NÃO
                </button>
              </div>
            </div>




            {/* Add product button */}
            <button
              onClick={handleAdd}
              disabled={!activeList}
              className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25 disabled:opacity-50 disabled:pointer-events-none"
            >
              <Plus className="w-5 h-5" />
              Adicionar Produto
            </button>
          </div>
        ) : view === "list" ? (
          <ListHistory
            lists={lists}
            onUpdateList={handleUpdateList}
            onStartConference={() => setView("conference")}
          />
        ) : (
          <ConferenceView onBack={() => setView("list")} />
        )}
      </div>

      {/* Open List Modal */}
      <Dialog open={showOpenModal} onOpenChange={setShowOpenModal}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Abrir Nova Lista</DialogTitle>
            <DialogDescription>Preencha os dados para iniciar</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">Descrição</label>
              <input
                type="text"
                placeholder="Ex: Pedido Nike"
                value={modalTitle}
                onChange={(e) => setModalTitle(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-foreground mb-1 block">Nome</label>
              <input
                type="text"
                placeholder="Ex: João Silva"
                value={modalPerson}
                onChange={(e) => setModalPerson(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOpenList()}
                className="w-full h-11 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={handleOpenList}
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
