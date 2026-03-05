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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { dispararWebhookConferenciaBaixada } from "@/lib/webhook";
import { z } from "zod";

export type ConferenceStatus = "separado" | "nao_tem" | "nao_tem_tudo" | "pendente";

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
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type Phase = "import" | "ready" | "running" | "finished";

const ConferenceFileSchema = z.object({
  type: z.literal("conference-file"),
  items: z.array(
    z.object({
      codigo: z.string().min(1),
      sku: z.string().optional().default(""),
      quantidade: z.number().int().positive(),
      photo: z.string().nullable().optional(),
    })
  ).min(1),
});

const ConferenceView = ({ onBack }: ConferenceViewProps) => {
  const [items, setItems] = useState<ConferenceItem[]>([]);
  const [phase, setPhase] = useState<Phase>("import");
  const [importError, setImportError] = useState<string | null>(null);
  const [conferente, setConferente] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // -----------------------------------------------------------------
  //  Processa JSON (arquivo .json ou .zip que contém .json)
  // -----------------------------------------------------------------
  const processJsonText = (text: string): boolean => {
    try {
      const raw = JSON.parse(text);
      const result = ConferenceFileSchema.safeParse(raw);
      if (!result.success) {
        setImportError(
          "Arquivo inválido: " + result.error.issues[0]?.message
        );
        return false;
      }

      // <-- lê digitoMap que o cruzador pode ter gravado
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

  // -----------------------------------------------------------------
  //  Processa TXT (ou CSV) do ERP
  // -----------------------------------------------------------------
  const processCsvText = (
    text: string,
    itemsOriginais?: ConferenceItem[]
  ): boolean => {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim());
    if (lines.length === 0) {
      setImportError("Arquivo vazio.");
      return false;
    }

    // mapa do TXT: codigo → { qtdErp, digito }
    const erpMap = new Map<
      string,
      { qtdErp: number; digito: "S" | "M" | null }
    >();
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

      erpMap.set(codigo, {
        qtdErp: parseInt(qtdStr, 10),
        digito,
      });
    });

    if (erpMap.size === 0) {
      setImportError(
        `Nenhum item válido. Formato: CODIGO;QUANTIDADE;S ou CODIGO;QUANTIDADE;M`
      );
      return false;
    }

    if (erros.length > 0) {
      toast({
        title: `${erros.length} linha(s) ignoradas`,
        variant: "destructive",
      });
    }

    // -----------------------------------------------------------------
    //  Se já temos itens do JSON, cruzamos
    // -----------------------------------------------------------------
    if (itemsOriginais && itemsOriginais.length > 0) {
      const parsed: ConferenceItem[] = [];

      itemsOriginais.forEach((item) => {
        const erp = erpMap.get(item.codigo);

        if (!erp) {
          // não veio no TXT → mantém como pendente (mantém digito original)
          parsed.push({ ...item, digito: item.digito ?? null });
          return;
        }

        const { qtdErp, digito } = erp;

        if (qtdErp === 0) {
          // removido
          return;
        } else if (qtdErp >= item.quantidadePedida) {
          // tudo ok
          parsed.push({
            ...item,
            status: "separado",
            quantidadeReal: item.quantidadePedida,
            digito,
          });
        } else {
          // parcial
          parsed.push({
            ...item,
            status: "nao_tem_tudo",
            quantidadeReal: qtdErp,
            digito,
          });
        }
      });

      if (parsed.length === 0) {
        setImportError("Todos os itens foram zerados pelo ERP.");
        return false;
      }

      const removidos = itemsOriginais.length - parsed.length;
      if (removidos > 0) {
        toast({
          title: `${removidos} item(ns) removido(s) por quantidade zero`,
        });
      }

      setItems(parsed);
      setPhase("ready");
      setCurrentIndex(0);
      toast({
        title: `${parsed.length} itens prontos após cruzamento com ERP!`,
      });
      return true;
    }

    // -----------------------------------------------------------------
    //  Caso não exista JSON (TXT puro) → cria itens do zero
    // -----------------------------------------------------------------
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

  // -----------------------------------------------------------------
  //  Importação de arquivos (ZIP, JSON ou TXT)
  // -----------------------------------------------------------------
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    // ---------- ZIP ----------
    if (file.name.endsWith(".zip")) {
      try {
        const zip = await JSZip.loadAsync(file);

        const jsonFileName = Object.keys(zip.files).find((n) => n.endsWith(".json"));
        const txtFileName = Object.keys(zip.files).find((n) => n.endsWith(".txt"));

        // ZIP com JSON + TXT
        if (jsonFileName && txtFileName) {
          // ----- Lê o JSON + digitoMap -----
          const jsonText = await zip.files[jsonFileName].async("string");
          const raw = JSON.parse(jsonText);
          const result = ConferenceFileSchema.safeParse(raw);
          if (!result.success) {
            setImportError("JSON inválido dentro do ZIP.");
            e.target.value = "";
            return;
          }

          // mapa de dígitos (se existir)
          const digitoMap: Record<string, "S" | "M"> = (raw as any)._meta?.digitoMap ?? {};

          // cria itens já com o dígito
          const itemsOriginais: ConferenceItem[] = result.data.items.map(
            (item) => ({
              id: crypto.randomUUID(),
              codigo: item.codigo,
              sku: item.sku ?? "",
              quantidadePedida: item.quantidade,
              quantidadeReal: null,
              status: "pendente" as ConferenceStatus,
              photo: item.photo ?? null,
              digito: digitoMap[item.codigo] ?? null,
            })
          );

          // ----- Cruzamento com o TXT -----
          const txtText = await zip.files[txtFileName].async("string");
          processCsvText(txtText, itemsOriginais);
          e.target.value = "";
          return;
        }

        // ---------- SOMENTE JSON ----------
        if (jsonFileName) {
          const text = await zip.files[jsonFileName].async("string");
          if (!processJsonText(text)) {
            setImportError(
              "O JSON dentro do .zip não é um arquivo de conferência válido."
            );
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

    // ---------- JSON ou TXT fora de ZIP ----------
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith(".json") || text.trim().startsWith("{")) {
          if (processJsonText(text)) return;
        }
        // TXT/CSV sem JSON
        processCsvText(text);
      } catch {
        setImportError("Erro ao ler o arquivo.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // -----------------------------------------------------------------
  //  Controle da conferência (play / finish / status)
  // -----------------------------------------------------------------
  const startConference = () => {
    setPhase("running");
    setCurrentIndex(0);
    setElapsedSeconds(0);
    timerRef.current = setInterval(
      () => setElapsedSeconds((s) => s + 1),
      1000
    );
  };

  const finishConference = () => {
    if (items.some((i) => i.status === "pendente")) {
      toast({
        title: "Todos os itens precisam ter um status",
        variant: "destructive",
      });
      return;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setPhase("finished");
  };

  const setStatus = (
    id: string,
    status: ConferenceStatus,
    quantidadeReal?: number
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (status === "separado")
          return { ...item, status, quantidadeReal: item.quantidadePedida };
        if (status === "nao_tem")
          return { ...item, status, quantidadeReal: 0 };
        if (status === "nao_tem_tudo")
          return { ...item, status, quantidadeReal: quantidadeReal ?? null };
        return { ...item, status, quantidadeReal: quantidadeReal ?? null };
      })
    );
  };

  const handleQuantityChange = (id: string, value: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (value === "") {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, quantidadeReal: null } : i))
      );
      return;
    }
    const num = parseInt(value, 10);
    if (isNaN(num) || !Number.isInteger(num)) return;
    if (num <= 0) {
      toast({
        title: "Quantidade deve ser maior que 0",
        variant: "destructive",
      });
      return;
    }
    if (num >= item.quantidadePedida) {
      toast({
        title: "Use 'Separado' se tem tudo",
        description: `Pedido: ${item.quantidadePedida}`,
        variant: "destructive",
      });
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, quantidadeReal: num, status: "nao_tem_tudo" } : i
      )
    );
  };

  // -----------------------------------------------------------------
  //  UI helpers
  // -----------------------------------------------------------------
  const currentItem = items[currentIndex];
  const isCurrentComplete =
    currentItem &&
    currentItem.status !== "pendente" &&
    (currentItem.status !== "nao_tem_tudo" ||
      (currentItem.quantidadeReal !== null &&
        currentItem.quantidadeReal > 0));
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
      toast({
        title: "Defina o status antes de avançar",
        variant: "destructive",
      });
      return;
    }
    if (!isLastItem) setCurrentIndex((i) => i + 1);
  };
  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };

  const getStatusColor = (status: ConferenceStatus) => {
    switch (status) {
      case "separado":
        return "border-l-4 border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]";
      case "nao_tem":
        return "border-l-4 border-l-destructive bg-destructive/5";
      case "nao_tem_tudo":
        return "border-l-4 border-l-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)]";
      default:
        return "border-l-4 border-l-border bg-card";
    }
  };

  const getStatusLabel = (status: ConferenceStatus) => {
    switch (status) {
      case "separado":
        return {
          text: "Separado",
          icon: CheckCircle2,
          color: "text-[hsl(var(--success))]",
        };
      case "nao_tem":
        return {
          text: "Não tem",
          icon: XCircle,
          color: "text-destructive",
        };
      case "nao_tem_tudo":
        return {
          text: "Parcial",
          icon: AlertTriangle,
          color: "text-[hsl(var(--warning))]",
        };
      default:
        return {
          text: "Pendente",
          icon: AlertTriangle,
          color: "text-muted-foreground",
        };
    }
  };

  // -----------------------------------------------------------------
  //  Exportação PDF (não usa digito, pode ficar como está)
  // -----------------------------------------------------------------
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
      separado: "Separado",
      nao_tem: "Não tem",
      nao_tem_tudo: "Parcial",
      pendente: "Pendente",
    };
    const colorMap: Record<ConferenceStatus, [number, number, number]> = {
      separado: [34, 197, 94],
      nao_tem: [239, 68, 68],
      nao_tem_tudo: [234, 179, 8],
      pendente: [156, 163, 175],
    };

    let y = 56;
    const pageHeight = doc.internal.pageSize.getHeight();
    items.forEach((item, idx) => {
      const itemH = item.photo ? 45 : 25;
      if (y + itemH > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      const [r, g, b] = colorMap[item.status];
      doc.setFillColor(r, g, b);
      doc.rect(14, y - 3, 3, item.photo ? 34 : 14, "F");
      if (item.photo) {
        try {
          doc.addImage(item.photo, "JPEG", 20, y - 2, 28, 28);
        } catch {}
      }
      const tx = item.photo ? 52 : 20;
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`${idx + 1}. ${item.codigo}`, tx, y + 4);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${
          item.quantidadeReal ?? "-"
        } | ${statusMap[item.status]}`,
        tx,
        y + 10
      );
      y += itemH;
    });

    doc.save(`conferencia_${new Date().toISOString().slice(0, 10)}.pdf`);

    // resumo para o webhook
    const resumo = {
      separado: items.filter((i) => i.status === "separado").length,
      naoTem: items.filter((i) => i.status === "nao_tem").length,
      parcial: items.filter((i) => i.status === "nao_tem_tudo").length,
      pendente: items.filter((i) => i.status === "pendente").length,
    };
    dispararWebhookConferenciaBaixada({
      conferente,
      tempo: formatTime(elapsedSeconds),
      totalItens: items.length,
      resumo,
      itens: items.map((i) => ({
        codigo: i.codigo,
        sku: i.sku,
        quantidadePedida: i.quantidadePedida,
        quantidadeReal: i.quantidadeReal,
        status: i.status,
        digito: i.digito ?? null,
      })),
    });
  };

  // -----------------------------------------------------------------
  //  Exportação JSON (AQUI ACRESCENTAMOS `digito`)
  // -----------------------------------------------------------------
  const exportJSON = async () => {
    const statusMap: Record<ConferenceStatus, string> = {
      separado: "separado",
      nao_tem: "nao_tem",
      nao_tem_tudo: "parcial",
      pendente: "pendente",
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
        // <<< A propriedade **digito** agora está incluída no JSON exportado
        digito: i.digito ?? null,
      })),
    };

    const fileName = `conferencia_${new Date()
      .toISOString()
      .slice(0, 10)}`;
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
    toast({ title: "ZIP baixado!", description: "Compartilhe pelo WhatsApp manualmente." });

    // também dispara o webhook (mesma payload do PDF)
    const resumo = {
      separado: items.filter((i) => i.status === "separado").length,
      naoTem: items.filter((i) => i.status === "nao_tem").length,
      parcial: items.filter((i) => i.status === "nao_tem_tudo").length,
      pendente: items.filter((i) => i.status === "pendente").length,
    };
    dispararWebhookConferenciaBaixada({
      conferente,
      tempo: formatTime(elapsedSeconds),
      totalItens: items.length,
      resumo,
      itens: items.map((i) => ({
        codigo: i.codigo,
        sku: i.sku,
        quantidadePedida: i.quantidadePedida,
        quantidadeReal: i.quantidadeReal,
        status: i.status,
        digito: i.digito ?? null,
      })),
    });
  };

  // -----------------------------------------------------------------
  //  Renderização
  // -----------------------------------------------------------------
  if (phase === "import") {
    return (
      <div className="p-4 space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <FileInput className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-foreground font-semibold text-lg mb-1">
            Importar Lista
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            <strong>ZIP</strong>: JSON + TXT do ERP (cruzamento automático)
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            <strong>TXT/CSV</strong>: CODIGO;QUANTIDADE;S ou
            CODIGO;QUANTIDADE;M
          </p>

          <div className="w-full max-w-xs mx-auto mb-4 text-left">
            <label className="text-sm font-semibold text-foreground mb-1.5 block">
              Nome do Conferente
            </label>
            <input
              type="text"
              placeholder="Ex: João Silva"
              value={conferente}
              onChange={(e) => setConferente(e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground text-base font-semibold focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {importError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-4 text-sm text-destructive text-left">
              {importError}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.json,.zip"
            onChange={handleFileImport}
            className="hidden"
          />
          <button
            onClick={() => {
              if (!conferente.trim()) {
                toast({
                  title: "Informe o nome do conferente",
                  variant: "destructive",
                });
                return;
              }
              fileInputRef.current?.click();
            }}
            className="w-full max-w-xs mx-auto h-12 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25"
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
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-[hsl(var(--success)/0.15)] flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
          <p className="text-foreground font-semibold text-lg mb-1">
            Lista Importada!
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            <strong>{items.length}</strong> itens prontos para conferência
          </p>
          <button
            onClick={startConference}
            className="w-full max-w-xs mx-auto h-14 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] rounded-xl font-bold text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-transform shadow-lg"
          >
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
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>

        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-[hsl(var(--success)/0.15)] flex items-center justify-center mx-auto mb-3">
            <Flag className="w-8 h-8 text-[hsl(var(--success))]" />
          </div>
          <p className="text-foreground font-semibold text-lg mb-1">
            Conferência Finalizada!
          </p>
          <p className="text-sm text-muted-foreground mb-1">
            👤 Conferente: <strong>{conferente}</strong>
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
            <Timer className="w-4 h-4" /> Tempo:{" "}
            <strong>{formatTime(elapsedSeconds)}</strong>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-3 space-y-2">
          <p className="text-sm font-bold text-foreground">
            Resumo - {items.length} itens
          </p>
          <div className="flex gap-2 flex-wrap text-xs font-semibold">
            <span className="px-2 py-1 rounded-lg bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]">
              ✅ {separados}
            </span>
            <span className="px-2 py-1 rounded-lg bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]">
              ⚠️ {naoTemTudo}
            </span>
            <span className="px-2 py-1 rounded-lg bg-destructive/10 text-destructive">
              ❌ {naoTem}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={exportPDF}
            className="h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={exportJSON}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            <FileJson className="w-4 h-4" /> JSON
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => {
            const label = getStatusLabel(item.status);
            const StatusIcon = label.icon;
            return (
              <div
                key={item.id}
                className={`rounded-xl p-3 shadow-sm flex gap-3 items-center ${getStatusColor(
                  item.status
                )}`}
              >
                {item.photo && (
                  <img
                    src={item.photo}
                    alt={item.codigo}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    #{idx + 1}
                  </p>
                  <p className="text-sm font-mono font-bold text-foreground">
                    {item.codigo}
                  </p>
                  {item.sku && (
                    <p className="text-xs text-muted-foreground">
                      SKU: {item.sku}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Pedido: <strong>{item.quantidadePedida}</strong> • Real:{" "}
                    <strong>{item.quantidadeReal}</strong>
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1 text-xs font-semibold ${label.color}`}
                >
                  <StatusIcon className="w-4 h-4" /> {label.text}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------
  //  Tela de conferência (em andamento)
  // -----------------------------------------------------------------
  const separados = items.filter((i) => i.status === "separado").length;
  const naoTem = items.filter((i) => i.status === "nao_tem").length;
  const naoTemTudo = items.filter((i) => i.status === "nao_tem_tudo").length;
  const pendentes = items.filter((i) => i.status === "pendente").length;
  const doneCount = items.length - pendentes;
  const label = currentItem ? getStatusLabel(currentItem.status) : null;
  const StatusIcon = label?.icon;

  return (
    <div className="p-4 space-y-3">
      <div class
