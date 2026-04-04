import { useState, useCallback } from "react";
import { Plus, ClipboardList, ScanBarcode, ArrowLeft, Tag, GitCompare, Store, Eye, EyeOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import BarcodeInput from "@/components/BarcodeInput";
import BarcodeScanner from "@/components/BarcodeScanner";
import PhotoCapture from "@/components/PhotoCapture";
import ListHistory from "@/components/ListHistory";
import ConferenceView from "@/components/ConferenceView";
import ProductCard from "@/components/ProductCard";
import { ListFlag } from "@/components/ProductCard";
import { useInventory } from "@/hooks/useInventory";
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
  const [removeTag, setRemoveTag] = useState(false);
  const [view, setView] = useState<"scan" | "list" | "conference">(
    initialTab === "conference" ? "conference" : initialTab === "list" ? "list" : "scan"
  );
  const [showScanner, setShowScanner] = useState(false);
  const [showOpenModal, setShowOpenModal] = useState(false);

  // ── Estado do modal ─────────────────────────────────────────────────────
  const [modalFlag, setModalFlag]         = useState<ListFlag | null>(null);
  const [modalEmpresa, setModalEmpresa]   = useState<Empresa | null>(null);
  const [modalPassword, setModalPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [showPassword, setShowPassword]   = useState(false);
  const [modalTitle, setModalTitle]       = useState("");
  const [modalPerson, setModalPerson]     = useState("");

  const { lists, activeList, openList, closeList, addProduct, updateList, deleteProduct } = useInventory();

  const handleBarcodeDetected = useCallback((code: string) => {
    setBarcode(code);
    setShowScanner(false);
  }, []);

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
    const ok = addProduct({ barcode, sku, photo, quantity: Number(quantity), removeTag });
    if (ok) { setBarcode(""); setSku(""); setPhoto(null); setQuantity(""); setRemoveTag(false); }
  };

  const productCount = activeList?.products.length ?? 0;

  const tabs = [
    { key: "scan"       as const, label: "Escanear",    Icon: ScanBarcode  },
    { key: "list"       as const, label: "Lista",        Icon: ClipboardList },
    { key: "conference" as const, label: "Conferência",  Icon: GitCompare   },
  ];

  // Badge da flag ativa no banner
  const flagBadge = activeList?.flag === "cd"
    ? { bg: "hsl(var(--success)/0.12)", border: "hsl(var(--success)/0.25)", text: "hsl(var(--success))" }
    : { bg: "hsl(var(--primary)/0.10)", border: "hsl(var(--primary)/0.20)", text: "hsl(var(--primary))" };

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
          <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}`}</style>
          <p style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "hsl(var(--foreground))" }}>
            {activeList.title}
            <span style={{ fontWeight: 400, color: "hsl(var(--muted-foreground))" }}> · {activeList.person}</span>
          </p>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", background: flagBadge.bg, border: `1px solid ${flagBadge.border}`, color: flagBadge.text }}>
            {activeList.flag?.toUpperCase() ?? "LOJA"} · {activeList.empresa ? activeList.empresa.split(" ")[0] : ""}
          </span>
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

            {!activeList && (
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

            <div>
              <label style={S.label}>Código de Barras</label>
              <BarcodeInput value={barcode} onChange={setBarcode} onScanPress={() => setShowScanner(true)} />
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

            <button onClick={handleAdd} disabled={!activeList}
              style={{
                ...S.btnPrimary, height: 56, fontSize: 15,
                opacity: activeList ? 1 : 0.45,
                cursor: activeList ? "pointer" : "not-allowed",
              }}
            >
              <Plus style={{ width: 20, height: 20 }} /> Adicionar Produto
            </button>

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
          <ConferenceView onBack={() => setView("list")} empresa={activeList?.empresa} flag={activeList?.flag} />
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
        <DialogContent className="max-w-sm" style={{ background: "#fff", borderRadius: 20, border: "1px solid hsl(var(--border))" }}>
          <div style={{ width: 36, height: 4, background: "hsl(var(--border))", borderRadius: 2, margin: "0 auto 16px" }} />

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

