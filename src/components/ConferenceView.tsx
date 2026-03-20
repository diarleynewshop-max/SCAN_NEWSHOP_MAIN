import { useState, useRef, useEffect } from "react";
import {
  FileInput,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Play,
  Flag,
  Timer,
  ChevronLeft,
  ChevronRight,
  Package,
  FileInput as FileJson,
  Share2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { enviarConferenciaParaClickUp } from "@/lib/webhookRouter";
import { z } from "zod";

export type ConferenceStatus =
  | "separado"
  | "nao_tem"
  | "nao_tem_tudo"
  | "pendente";

export interface ConferenceItem {
  id: string;
  codigo: string;
  sku: string;
  quantidadePedida: number;
  quantidadeReal: number | null;
  status: ConferenceStatus;
  photo?: string | null;
  digito?: "S" | "M" | null;
}

interface ConferenceViewProps {
  onBack: () => void;
  empresa?: string;
  flag?: string;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Phase = "import" | "ready" | "running" | "finished";

const ConferenceFileSchema = z.object({
  type: z.literal("conference-file"),
  empresa: z.string().optional(),
  flag: z.string().optional(),
  items: z.array(
    z.object({
      codigo: z.string().min(1),
      sku: z.string().optional().default(""),
      quantidade: z.number().int().positive(),
      photo: z.string().nullable().optional(),
    })
  ).min(1),
});

const ConferenceView = ({ onBack, empresa: empresaProp = "NEWSHOP", flag: flagProp = "loja" }: ConferenceViewProps) => {
  const [items, setItems] = useState<ConferenceItem[]>([]);
  const [phase, setPhase] = useState<Phase>("import");
  const [importError, setImportError] = useState<string | null>(null);
  const [conferente, setConferente] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // empresa/flag podem vir da prop (activeList) ou ser sobrescritos pelo arquivo importado
  const [empresa, setEmpresa] = useState(empresaProp);
  const [flag, setFlag] = useState(flagProp);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const processJsonText = (text: string): boolean => {
    try {
      const raw = JSON.parse(text);
      const result = ConferenceFileSchema.safeParse(raw);
      if (!result.success) {
        setImportError("Arquivo inválido: " + result.error.issues[0]?.message);
        return false;
      }

      // Sobrescreve empresa/flag se o arquivo tiver essa informação
      if (result.data.empresa) setEmpresa(result.data.empresa);
      if (result.data.flag)    setFlag(result.data.flag);

      const digitoMap: Record<string, "S" | "M"> = raw._meta?.digitoMap ?? {};

      const parsed: ConferenceItem[] = result.data.items.map((item) => ({
        id: crypto.randomUUID(),
        codigo: item.codigo,
        sku: item.sku ?? "",
        quantidadePedida: item.quantidade,
        quantidadeReal: null,
        status: "pendente" as ConferenceStatus,
        photo: item.photo ?? null,
        digito: digitoMap[item.codigo] ?? null,
      }));

      setItems(parsed);
      setPhase("ready");
      setCurrentIndex(0);
      toast({ title: `${parsed.length} itens importados!` });
      return true;
    } catch {
      return false;
    }
  };

  const processCsvText = (text: string, itemsOriginais?: ConferenceItem[]): boolean => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) { setImportError("Arquivo vazio."); return false; }

    const erpMap = new Map<string, { qtdErp: number; digito: "S" | "M" | null }>();
    const erros: string[] = [];

    lines.forEach((line, i) => {
      const parts = line.split(";");
      const codigo = parts[0]?.trim() ?? "";
      const qtdStr = parts[1]?.trim() ?? "";
      const digitoRaw = parts[2]?.trim().toUpperCase() ?? "";

      if (!codigo || !/^\d+$/.test(qtdStr)) {
        erros.push(`Linha ${i + 1}: formato inválido`);
        return;
      }

      const digito: "S" | "M" | null =
        digitoRaw === "S" ? "S" : digitoRaw === "M" ? "M" : null;

      erpMap.set(codigo, { qtdErp: parseInt(qtdStr, 10), digito });
    });

    if (erpMap.size === 0) {
      setImportError("Nenhum item válido. Formato: CODIGO;QUANTIDADE;S ou CODIGO;QUANTIDADE;M");
      return false;
    }

    if (erros.length > 0) {
      toast({ title: `${erros.length} linha(s) ignoradas`, variant: "destructive" });
    }

    if (itemsOriginais && itemsOriginais.length > 0) {
      const parsed: ConferenceItem[] = [];

      itemsOriginais.forEach((item) => {
        const erp = erpMap.get(item.codigo);

        if (!erp) {
          parsed.push({ ...item, digito: item.digito ?? null });
          return;
        }

        const { qtdErp, digito } = erp;

        if (qtdErp === 0) {
          return;
        } else if (qtdErp >= item.quantidadePedida) {
          parsed.push({ ...item, status: "separado", quantidadeReal: item.quantidadePedida, digito });
        } else {
          parsed.push({ ...item, status: "nao_tem_tudo", quantidadeReal: qtdErp, digito });
        }
      });

      if (parsed.length === 0) {
        setImportError("Todos os itens foram zerados pelo ERP.");
        return false;
      }

      const removidos = itemsOriginais.length - parsed.length;
      if (removidos > 0) {
        toast({ title: `${removidos} item(ns) removido(s) por quantidade zero` });
      }

      setItems(parsed);
      setPhase("ready");
      setCurrentIndex(0);
      toast({ title: `${parsed.length} itens prontos após cruzamento com ERP!` });
      return true;
    }

    const parsed: ConferenceItem[] = [];
    erpMap.forEach(({ qtdErp, digito }, codigo) => {
      if (qtdErp === 0) return;
      parsed.push({
        id: crypto.randomUUID(),
        codigo,
        sku: "",
        quantidadePedida: qtdErp,
        quantidadeReal: null,
        status: "pendente",
        photo: null,
        digito,
      });
    });

    if (parsed.length === 0) {
      setImportError("Todos os itens estão com quantidade zero.");
      return false;
    }

    setItems(parsed);
    setPhase("ready");
    setCurrentIndex(0);
    toast({ title: `${parsed.length} itens importados!` });
    return true;
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    // ── Detecta empresa/flag pelo nome do arquivo (fallback se JSON não tiver) ──
    const detectarPeloNome = (nome: string) => {
      const n = nome.toUpperCase();
      let empresaDetectada: string | null = null;
      let flagDetectada: string | null = null;

      if (n.includes("NEWSHOP")) empresaDetectada = "NEWSHOP";
      else if (n.includes("FACIL"))   empresaDetectada = "FACIL";
      else if (n.includes("SOYE"))    empresaDetectada = "SOYE";

      if (n.includes("_CD_") || n.startsWith("CD_") || n.endsWith("_CD") || n.includes("-CD-"))
        flagDetectada = "cd";
      else if (n.includes("_LOJA_") || n.startsWith("LOJA_") || n.endsWith("_LOJA") || n.includes("-LOJA-"))
        flagDetectada = "loja";

      return { empresaDetectada, flagDetectada };
    };

    if (file.name.endsWith(".zip")) {
      try {
        const zip = await JSZip.loadAsync(file);
        const jsonFileName = Object.keys(zip.files).find((n) => n.endsWith(".json"));
        const txtFileName = Object.keys(zip.files).find((n) => n.endsWith(".txt"));

        if (jsonFileName && txtFileName) {
          const jsonText = await zip.files[jsonFileName].async("string");
          const raw = JSON.parse(jsonText);
          const result = ConferenceFileSchema.safeParse(raw);

          if (!result.success) {
            setImportError("JSON inválido dentro do ZIP.");
            e.target.value = "";
            return;
          }

          // Prioridade 1: campos dentro do JSON
          if (result.data.empresa) {
            setEmpresa(result.data.empresa);
          } else {
            // Prioridade 2: nome do arquivo ZIP
            const { empresaDetectada, flagDetectada } = detectarPeloNome(file.name);
            if (empresaDetectada) setEmpresa(empresaDetectada);
            if (flagDetectada)    setFlag(flagDetectada);
            // Prioridade 3: seleção manual já está no state (não faz nada)
          }
          if (result.data.flag) setFlag(result.data.flag);

          const digitoMap: Record<string, "S" | "M"> = (raw as any)._meta?.digitoMap ?? {};

          const itemsOriginais: ConferenceItem[] = result.data.items.map((item) => ({
            id: crypto.randomUUID(),
            codigo: item.codigo,
            sku: item.sku ?? "",
            quantidadePedida: item.quantidade,
            quantidadeReal: null,
            status: "pendente" as ConferenceStatus,
            photo: item.photo ?? null,
            digito: digitoMap[item.codigo] ?? null,
          }));

          const txtText = await zip.files[txtFileName].async("string");
          processCsvText(txtText, itemsOriginais);
          e.target.value = "";
          return;
        }

        if (jsonFileName) {
          const text = await zip.files[jsonFileName].async("string");
          // Tenta ler do nome do ZIP antes de processar
          const { empresaDetectada, flagDetectada } = detectarPeloNome(file.name);
          if (empresaDetectada) setEmpresa(empresaDetectada);
          if (flagDetectada)    setFlag(flagDetectada);
          if (!processJsonText(text)) {
            setImportError("O JSON dentro do .zip não é um arquivo de conferência válido.");
          }
          e.target.value = "";
          return;
        }

        setImportError("Nenhum arquivo .json encontrado dentro do .zip");
      } catch {
        setImportError("Erro ao descompactar o arquivo .zip");
      }
      e.target.value = "";
      return;
    }

    // Para JSON/TXT/CSV direto, tenta ler pelo nome do arquivo também
    const { empresaDetectada, flagDetectada } = detectarPeloNome(file.name);
    if (empresaDetectada) setEmpresa(empresaDetectada);
    if (flagDetectada)    setFlag(flagDetectada);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith(".json") || text.trim().startsWith("{")) {
          if (processJsonText(text)) return;
        }
        processCsvText(text);
      } catch {
        setImportError("Erro ao ler o arquivo.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const startConference = () => {
    setPhase("running");
    setCurrentIndex(0);
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  };

  const finishConference = () => {
    if (items.some((i) => i.status === "pendente")) {
      toast({ title: "Todos os itens precisam ter um status", variant: "destructive" });
      return;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setPhase("finished");
  };

  const setStatus = (id: string, status: ConferenceStatus, quantidadeReal?: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (status === "separado") return { ...item, status, quantidadeReal: item.quantidadePedida };
        if (status === "nao_tem") return { ...item, status, quantidadeReal: 0 };
        if (status === "nao_tem_tudo") return { ...item, status, quantidadeReal: quantidadeReal ?? null };
        return { ...item, status, quantidadeReal: quantidadeReal ?? null };
      })
    );
  };

  const handleQuantityChange = (id: string, value: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (value === "") {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantidadeReal: null } : i)));
      return;
    }
    const num = parseInt(value, 10);
    if (isNaN(num) || !Number.isInteger(num)) return;
    if (num <= 0) {
      toast({ title: "Quantidade deve ser maior que 0", variant: "destructive" });
      return;
    }
    if (num >= item.quantidadePedida) {
      toast({ title: "Use 'Separado' se tem tudo", description: `Pedido: ${item.quantidadePedida}`, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantidadeReal: num, status: "nao_tem_tudo" } : i)));
  };

  const getResumo = () => ({
    separado: items.filter((i) => i.status === "separado").length,
    naoTem: items.filter((i) => i.status === "nao_tem").length,
    parcial: items.filter((i) => i.status === "nao_tem_tudo").length,
    pendente: items.filter((i) => i.status === "pendente").length,
  });

  const getPayloadClickUp = () => ({
    conferente,
    tempo: formatTime(elapsedSeconds),
    totalItens: items.length,
    resumo: getResumo(),
    itens: items.map((i) => ({
      codigo: i.codigo,
      sku: i.sku,
      quantidadePedida: i.quantidadePedida,
      quantidadeReal: i.quantidadeReal,
      status: i.status,
      digito: i.digito ?? null,
    })),
  });

  const enviarClickUp = () => {
    enviarConferenciaParaClickUp({
      ...getPayloadClickUp(),
      empresa,
      flag,
    });
    toast({ title: "✅ Enviado para o ClickUp!" });
  };

  const currentItem = items[currentIndex];
  const isCurrentComplete =
    currentItem &&
    currentItem.status !== "pendente" &&
    (currentItem.status !== "nao_tem_tudo" ||
      (currentItem.quantidadeReal !== null && currentItem.quantidadeReal > 0));
  const isLastItem = currentIndex === items.length - 1;
  const allDone =
    items.length > 0 &&
    items.every(
      (i) =>
        i.status !== "pendente" &&
        (i.status !== "nao_tem_tudo" ||
          (i.quantidadeReal !== null && i.quantidadeReal > 0))
    );

  const goNext = () => {
    if (!isCurrentComplete) {
      toast({ title: "Defina o status antes de avançar", variant: "destructive" });
      return;
    }
    if (!isLastItem) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => { if (currentIndex > 0) setCurrentIndex((i) => i - 1); };

  const getStatusColor = (status: ConferenceStatus) => {
    switch (status) {
      case "separado": return "border-l-4 border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]";
      case "nao_tem": return "border-l-4 border-l-destructive bg-destructive/5";
      case "nao_tem_tudo": return "border-l-4 border-l-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)]";
      default: return "border-l-4 border-l-border bg-card";
    }
  };

  const getStatusLabel = (status: ConferenceStatus) => {
    switch (status) {
      case "separado": return { text: "Separado", icon: CheckCircle2, color: "text-[hsl(var(--success))]" };
      case "nao_tem": return { text: "Não tem", icon: XCircle, color: "text-destructive" };
      case "nao_tem_tudo": return { text: "Parcial", icon: AlertTriangle, color: "text-[hsl(var(--warning))]" };
      default: return { text: "Pendente", icon: AlertTriangle, color: "text-muted-foreground" };
    }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Conferencia de Lista", 14, 20);
    doc.setFontSize(10);
    doc.text(`Conferente: ${conferente}`, 14, 28);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}`, 14, 34);
    doc.text(`Tempo: ${formatTime(elapsedSeconds)}`, 14, 40);
    doc.text(`Total: ${items.length} item(ns)`, 14, 46);

    const statusMap: Record<ConferenceStatus, string> = {
      separado: "Separado", nao_tem: "Não tem", nao_tem_tudo: "Parcial", pendente: "Pendente",
    };
    const colorMap: Record<ConferenceStatus, [number, number, number]> = {
      separado: [34, 197, 94], nao_tem: [239, 68, 68], nao_tem_tudo: [234, 179, 8], pendente: [156, 163, 175],
    };

    let y = 56;
    const pageHeight = doc.internal.pageSize.getHeight();
    items.forEach((item, idx) => {
      const itemH = item.photo ? 45 : 25;
      if (y + itemH > pageHeight - 20) { doc.addPage(); y = 20; }
      const [r, g, b] = colorMap[item.status];
      doc.setFillColor(r, g, b);
      doc.rect(14, y - 3, 3, item.photo ? 34 : 14, "F");
      if (item.photo) { try { doc.addImage(item.photo, "JPEG", 20, y - 2, 28, 28); } catch {} }
      const tx = item.photo ? 52 : 20;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${idx + 1}. ${item.codigo}`, tx, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? "-"} | ${statusMap[item.status]}`, tx, y + 10);
      y += itemH;
    });

    doc.save(`conferencia_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: "PDF exportado!" });
  };

  const exportJSON = async () => {
    const statusMap: Record<ConferenceStatus, string> = {
      separado: "separado", nao_tem: "nao_tem", nao_tem_tudo: "parcial", pendente: "pendente",
    };

    const data = {
      type: "conference-file",
      conferente,
      data: new Date().toISOString(),
      tempo: formatTime(elapsedSeconds),
      items: items.map((i) => ({
        codigo: i.codigo,
        sku: i.sku,
        quantidade: i.quantidadePedida,
        quantidadeReal: i.quantidadeReal,
        status: statusMap[i.status],
        photo: i.photo || null,
      })),
    };

    const fileName = `conferencia_${new Date().toISOString().slice(0, 10)}`;
    const zip = new JSZip();
    zip.file(`${fileName}.json`, JSON.stringify(data, null, 2));
    const zipBlob = await zip.generateAsync({ type: "blob" });

    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: "ZIP baixado!" });

    const zipFile = new File([zipBlob], `${fileName}.zip`, { type: "application/zip" });
    if (navigator.share) {
      try { await navigator.share({ files: [zipFile], title: `Conferência - ${conferente}` }); } catch {}
    }
  };

  // ── Badge de empresa/flag ─────────────────────────────────────────────────
  const EmpresaBadge = () => {
    const empresaColors: Record<string, { bg: string; border: string; text: string }> = {
      NEWSHOP: { bg: "hsl(var(--primary)/0.12)", border: "hsl(var(--primary)/0.4)", text: "hsl(var(--primary))" },
      SOYE:    { bg: "hsl(142 72% 29%/0.12)",    border: "hsl(142 72% 29%/0.4)",    text: "hsl(142 72% 29%)"    },
      FACIL:   { bg: "hsl(30 95% 50%/0.12)",     border: "hsl(30 95% 50%/0.4)",     text: "hsl(30 95% 50%)"    },
    };
    const colors = empresaColors[empresa] ?? empresaColors["NEWSHOP"];
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, background: colors.bg, border: `1px solid ${colors.border}`, fontSize: 12, fontWeight: 700, color: colors.text, fontFamily: "var(--font-mono)" }}>
        <span style={{ opacity: 0.7 }}>{flag.toUpperCase()}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>{empresa}</span>
      </div>
    );
  };

  if (phase === "import") {
    const flagOptions: { value: string; label: string }[] = [
      { value: "loja", label: "LOJA" },
      { value: "cd",   label: "CD"   },
    ];
    const empresaOptions: { value: string; label: string; color: string }[] = [
      { value: "NEWSHOP", label: "NEWSHOP", color: "hsl(var(--primary))"  },
      { value: "SOYE",    label: "SOYE",    color: "hsl(142 72% 29%)"     },
      { value: "FACIL",   label: "FACIL",   color: "hsl(30 95% 50%)"      },
    ];

    return (
      <div className="p-4 space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="space-y-4 pt-2">
          {/* Tipo */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Tipo</p>
            <div className="flex gap-2">
              {flagOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFlag(opt.value)}
                  className="flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                  style={{
                    background: flag === opt.value ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    color: flag === opt.value ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    border: flag === opt.value ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Empresa */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Empresa</p>
            <div className="flex gap-2">
              {empresaOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setEmpresa(opt.value)}
                  className="flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                  style={{
                    background: empresa === opt.value ? opt.color : "hsl(var(--muted))",
                    color: empresa === opt.value ? "#fff" : "hsl(var(--muted-foreground))",
                    border: empresa === opt.value ? `2px solid ${opt.color}` : "2px solid transparent",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conferente */}
          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block">Nome do Conferente</label>
            <input
              type="text"
              placeholder="Ex: João Silva"
              value={conferente}
              onChange={(e) => setConferente(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          <div className="flex justify-center pt-1">
            <EmpresaBadge />
          </div>

          {importError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">{importError}</div>
          )}

          <input ref={fileInputRef} type="file" accept=".csv,.txt,.json,.zip" onChange={handleFileImport} className="hidden" />
          <button
            onClick={() => {
              if (!conferente.trim()) { toast({ title: "Informe o nome do conferente", variant: "destructive" }); return; }
              fileInputRef.current?.click();
            }}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
          >
            <FileInput className="w-5 h-5" /> Selecionar Arquivo
          </button>
        </div>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <div className="p-4 space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="text-center py-10">
          <div className="mb-3"><EmpresaBadge /></div>
          <div className="w-16 h-16 rounded-full bg-[hsl(var(--success)/0.15)] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
          <p className="text-foreground font-semibold text-lg mb-1">Lista Importada!</p>
          <p className="text-sm text-muted-foreground mb-4"><strong>{items.length}</strong> itens prontos para conferência</p>
          <button onClick={startConference} className="w-full max-w-xs mx-auto h-14 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] rounded-xl font-bold text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-lg">
            <Play className="w-6 h-6" /> Começar
          </button>
        </div>
      </div>
    );
  }

  if (phase === "finished") {
    const separados = items.filter((i) => i.status === "separado").length;
    const naoTem = items.filter((i) => i.status === "nao_tem").length;
    const naoTemTudo = items.filter((i) => i.status === "nao_tem_tudo").length;
    return (
      <div className="p-4 space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-[hsl(var(--success)/0.15)] flex items-center justify-center mx-auto mb-3">
            <Flag className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
          <p className="text-foreground font-semibold text-lg mb-1">Conferência Finalizada!</p>
          <p className="text-sm text-muted-foreground mb-1">👤 Conferente: <strong>{conferente}</strong></p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
            <Timer className="w-4 h-4" /> Tempo: <strong>{formatTime(elapsedSeconds)}</strong>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border p-3 space-y-2">
          <p className="text-sm font-bold text-foreground">Resumo - {items.length} itens</p>
          <div className="flex gap-2 flex-wrap text-xs font-semibold">
            <span className="px-2 py-1 rounded-lg bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]">✅ {separados}</span>
            <span className="px-2 py-1 rounded-lg bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]">⚠️ {naoTemTudo}</span>
            <span className="px-2 py-1 rounded-lg bg-destructive/10 text-destructive">❌ {naoTem}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={exportPDF} className="h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={exportJSON} className="h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <FileJson className="w-4 h-4" /> JSON
          </button>
          <button onClick={enviarClickUp} className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <Share2 className="w-4 h-4" /> ClickUp
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const label = getStatusLabel(item.status);
            const StatusIcon = label.icon;
            return (
              <div key={item.id} className={`rounded-xl p-3 shadow-sm flex gap-3 items-center ${getStatusColor(item.status)}`}>
                {item.photo && <img src={item.photo} alt={item.codigo} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                  <p className="text-sm font-mono font-bold text-foreground">{item.codigo}</p>
                  {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  <p className="text-xs text-muted-foreground">
                    Pedido: <strong>{item.quantidadePedida}</strong> • Real: <strong>{item.quantidadeReal}</strong>
                  </p>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold ${label.color}`}>
                  <StatusIcon className="w-4 h-4" /> {label.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const separados = items.filter((i) => i.status === "separado").length;
  const naoTem = items.filter((i) => i.status === "nao_tem").length;
  const naoTemTudo = items.filter((i) => i.status === "nao_tem_tudo").length;
  const pendentes = items.filter((i) => i.status === "pendente").length;
  const doneCount = items.length - pendentes;
  const label = currentItem ? getStatusLabel(currentItem.status) : null;
  const StatusIcon = label?.icon;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex items-center gap-2 text-sm font-mono font-bold text-foreground bg-card border border-border rounded-lg px-3 py-1.5">
          <Timer className="w-4 h-4 text-primary" />
          {formatTime(elapsedSeconds)}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-foreground">Item {currentIndex + 1} de {items.length}</span>
          <span className="text-muted-foreground">{doneCount}/{items.length} conferidos</span>
        </div>
        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(doneCount / items.length) * 100}%` }} />
        </div>
        <div className="flex gap-2 flex-wrap text-xs font-semibold">
          <span className="px-2 py-0.5 rounded-lg bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]">✅ {separados}</span>
          <span className="px-2 py-0.5 rounded-lg bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]">⚠️ {naoTemTudo}</span>
          <span className="px-2 py-0.5 rounded-lg bg-destructive/10 text-destructive">❌ {naoTem}</span>
          {pendentes > 0 && <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">⏳ {pendentes}</span>}
        </div>
      </div>

      {currentItem && (
        <div className={`rounded-xl p-4 space-y-4 shadow-md ${getStatusColor(currentItem.status)}`}>
          {currentItem.photo ? (
            <div className="flex justify-center">
              <img src={currentItem.photo} alt={currentItem.codigo} className="w-40 h-40 rounded-xl object-cover shadow-sm border border-border" />
            </div>
          ) : (
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-xl bg-muted/50 flex items-center justify-center border border-border">
                <Package className="w-10 h-10 text-muted-foreground/50" />
              </div>
            </div>
          )}
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground font-semibold">ITEM {currentIndex + 1}</p>
            <p className="text-2xl font-mono font-black text-foreground tracking-wider">{currentItem.codigo}</p>
            {currentItem.sku && <p className="text-sm text-muted-foreground">SKU: <strong className="text-foreground">{currentItem.sku}</strong></p>}
            <p className="text-sm text-muted-foreground">
              Quantidade pedida: <strong className="text-foreground text-lg">{currentItem.quantidadePedida}</strong>
            </p>
          </div>
          {currentItem.status !== "pendente" && label && StatusIcon && (
            <div className={`flex items-center justify-center gap-2 text-sm font-bold ${label.color}`}>
              <StatusIcon className="w-5 h-5" /> {label.text}
              {currentItem.quantidadeReal !== null && currentItem.status === "nao_tem_tudo" && (
                <span className="text-foreground ml-1">({currentItem.quantidadeReal})</span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => setStatus(currentItem.id, "separado")}
              className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ${
                currentItem.status === "separado"
                  ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] ring-2 ring-[hsl(var(--success))] ring-offset-2"
                  : "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.25)]"
              }`}>
              <CheckCircle2 className="w-4 h-4" /> Separado
            </button>
            <button onClick={() => setStatus(currentItem.id, "nao_tem")}
              className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ${
                currentItem.status === "nao_tem"
                  ? "bg-destructive text-destructive-foreground ring-2 ring-destructive ring-offset-2"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20"
              }`}>
              <XCircle className="w-4 h-4" /> Não tem
            </button>
            <button onClick={() => setStatus(currentItem.id, "nao_tem_tudo")}
              className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all ${
                currentItem.status === "nao_tem_tudo"
                  ? "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] ring-2 ring-[hsl(var(--warning))] ring-offset-2"
                  : "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning)/0.25)]"
              }`}>
              <AlertTriangle className="w-4 h-4" /> Parcial
            </button>
          </div>
          {currentItem.status === "nao_tem_tudo" && (
            <div className="flex items-center gap-3 bg-card/50 rounded-lg p-3 border border-border">
              <label className="text-sm text-muted-foreground whitespace-nowrap">Qtd disponível:</label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max={currentItem.quantidadePedida - 1}
                placeholder="Qtd"
                value={currentItem.quantidadeReal ?? ""}
                onChange={(e) => handleQuantityChange(currentItem.id, e.target.value)}
                className="flex-1 h-10 px-3 rounded-lg border border-input bg-card text-foreground text-base font-bold text-center focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={goPrev} disabled={currentIndex === 0}
          className="h-12 px-4 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-1 active:scale-[0.98] transition-transform disabled:opacity-30">
          <ChevronLeft className="w-5 h-5" /> Anterior
        </button>
        {isLastItem ? (
          <button onClick={finishConference} disabled={!allDone}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25 disabled:opacity-40">
            <Flag className="w-5 h-5" /> Finalizar
          </button>
        ) : (
          <button onClick={goNext} disabled={!isCurrentComplete}
            className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25 disabled:opacity-40">
            Próximo <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ConferenceView;
