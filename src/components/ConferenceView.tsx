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
  Lock,
  RefreshCw,
  ClipboardList,
  Database,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import JSZip from "jszip";
import { enviarConferenciaParaClickUp } from "@/lib/webhookRouter";
import {
  validarSenha,
  buscarTasksAnalisado,
  baixarJsonDaTask,
  buscarAttachmentsDaTask,
  deletarTask,
  type ClickUpTask,
  type EmpresaKey,
  type FlagKey,
} from "@/lib/clickupApi";
import { z } from "zod";
import { supabase } from "@/lib/supabase";

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
  estoque_sistema?: number | null;
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

type Phase = "import" | "pickTask" | "ready" | "running" | "finished";

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
  const [empresa, setEmpresa] = useState(empresaProp);
  const [flag, setFlag] = useState(flagProp);
  const [conferenceId] = useState(() => crypto.randomUUID());
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [senha, setSenha] = useState("");
  const [senhaErro, setSenhaErro] = useState(false);
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksErro, setTasksErro] = useState<string | null>(null);
  const [taskSelecionada, setTaskSelecionada] = useState<ClickUpTask | null>(null);
  const [loadingJson, setLoadingJson] = useState(false);
  const [taskOrigemId, setTaskOrigemId] = useState<string | null>(null);
  const [loadingEstoque, setLoadingEstoque] = useState(false);
  const [estoqueAnalisado, setEstoqueAnalisado] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const STORAGE_KEY = "clickup_sent_ids";

  const jaFoiEnviado = (): boolean => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      return ids.includes(conferenceId);
    } catch { return false; }
  };

  const marcarComoEnviado = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      const novos = [...ids, conferenceId].slice(-200);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(novos));
    } catch {}
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const confirmarSenha = async () => {
    const ok = validarSenha(empresa as EmpresaKey, senha);
    if (!ok) { setSenhaErro(true); return; }
    setSenhaErro(false);
    setLoadingTasks(true);
    setTasksErro(null);
    try {
      const lista = await buscarTasksAnalisado(empresa as EmpresaKey, flag as FlagKey);
      setTasks(lista);
      setPhase("pickTask");
    } catch (e: any) {
      setTasksErro(e.message ?? "Erro ao buscar tasks");
    } finally {
      setLoadingTasks(false);
    }
  };

  const recarregarTasks = async () => {
    setLoadingTasks(true);
    setTasksErro(null);
    try {
      const lista = await buscarTasksAnalisado(empresa as EmpresaKey, flag as FlagKey);
      setTasks(lista);
    } catch (e: any) {
      setTasksErro(e.message ?? "Erro ao buscar tasks");
    } finally {
      setLoadingTasks(false);
    }
  };

  const abrirTask = async (task: ClickUpTask) => {
    setLoadingJson(true);
    setTaskSelecionada(task);
    try {
      let attachments = task.attachments;
      if (!attachments || attachments.length === 0) {
        attachments = await buscarAttachmentsDaTask(empresa as EmpresaKey, task.id);
      }
      const taskComAnexos = { ...task, attachments };

      const json = await baixarJsonDaTask(empresa as EmpresaKey, taskComAnexos);
      if (!json) {
        toast({ title: "Nenhum JSON encontrado nesta task", variant: "destructive" });
        setLoadingJson(false);
        setTaskSelecionada(null);
        return;
      }

      const result = ConferenceFileSchema.safeParse(json);
      if (!result.success) {
        toast({ title: "JSON inválido na task", description: result.error.issues[0]?.message, variant: "destructive" });
        setLoadingJson(false);
        setTaskSelecionada(null);
        return;
      }

      if (result.data.empresa) setEmpresa(result.data.empresa);
      if (result.data.flag)    setFlag(result.data.flag);

      const digitoMap: Record<string, "S" | "M"> = (json as any)._meta?.digitoMap ?? {};
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
      setTaskOrigemId(task.id);
      setPhase("ready");
      toast({ title: `${parsed.length} itens carregados da task!` });
    } catch (e: any) {
      toast({ title: "Erro ao carregar task", description: e.message, variant: "destructive" });
      setTaskSelecionada(null);
    } finally {
      setLoadingJson(false);
    }
  };

  const processJsonText = (text: string): boolean => {
    try {
      const raw = JSON.parse(text);
      const result = ConferenceFileSchema.safeParse(raw);
      if (!result.success) {
        setImportError("Arquivo inválido: " + result.error.issues[0]?.message);
        return false;
      }

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

          if (result.data.empresa) {
            setEmpresa(result.data.empresa);
          } else {
            const { empresaDetectada, flagDetectada } = detectarPeloNome(file.name);
            if (empresaDetectada) setEmpresa(empresaDetectada);
            if (flagDetectada)    setFlag(flagDetectada);
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
      photo: i.photo ?? null,
    })),
  });

  const enviarClickUp = async () => {
    if (jaFoiEnviado() || sendStatus === "sent") {
      toast({ title: "⚠️ Já enviado!", description: "Este pedido já foi compartilhado no ClickUp.", variant: "destructive" });
      return;
    }
    if (sendStatus === "sending") return;

    setSendStatus("sending");
    try {
      await enviarConferenciaParaClickUp({
        ...getPayloadClickUp(),
        empresa,
        flag,
        conferenceId,
      });
      marcarComoEnviado();
      setSendStatus("sent");
      toast({ title: "✅ Chegou no ClickUp!", description: `Pedido de ${conferente} enviado com sucesso.` });

      if (taskOrigemId) {
        try {
          await deletarTask(empresa as EmpresaKey, taskOrigemId);
          setTaskOrigemId(null);
          toast({ title: "🗑️ Task de origem removida do Analisado." });
        } catch {
          toast({ title: "⚠️ Não foi possível deletar a task de origem", variant: "destructive" });
        }
      }
    } catch {
      setSendStatus("error");
      toast({ title: "❌ Falha no envio", description: "Verifique sua conexão e tente novamente.", variant: "destructive" });
    }
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
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Conferência de Lista", 14, 12);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`${empresa} · ${flag.toUpperCase()}`, 14, 19);
    doc.text(`Conferente: ${conferente}`, 14, 24);
    doc.text(`Data: ${new Date().toLocaleDateString("pt-BR")}  |  Tempo: ${formatTime(elapsedSeconds)}  |  Total: ${items.length} itens`, pageW - 14, 24, { align: "right" });

    const resumo = getResumo();
    const resumoY = 36;
    const cols = [
      { label: "✅ Separado", val: resumo.separado, r: 34,  g: 197, b: 94  },
      { label: "⚠️ Parcial",  val: resumo.parcial,  r: 234, g: 179, b: 8   },
      { label: "❌ Não tem",  val: resumo.naoTem,   r: 239, g: 68,  b: 68  },
      { label: "⏳ Pendente", val: resumo.pendente, r: 156, g: 163, b: 175 },
    ];
    const colW = (pageW - 28) / 4;
    cols.forEach((c, i) => {
      const x = 14 + i * colW;
      doc.setFillColor(c.r, c.g, c.b);
      doc.roundedRect(x, resumoY, colW - 4, 14, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(String(c.val), x + (colW - 4) / 2, resumoY + 8, { align: "center" });
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text(c.label, x + (colW - 4) / 2, resumoY + 13, { align: "center" });
    });

    const statusColors: Record<ConferenceStatus, [number, number, number]> = {
      separado:     [34,  197, 94 ],
      nao_tem:      [239, 68,  68 ],
      nao_tem_tudo: [234, 179, 8  ],
      pendente:     [156, 163, 175],
    };
    const statusLabels: Record<ConferenceStatus, string> = {
      separado: "SEPARADO", nao_tem: "NÃO TEM", nao_tem_tudo: "PARCIAL", pendente: "PENDENTE",
    };

    let y = resumoY + 22;

    items.forEach((item, idx) => {
      const hasPhoto = !!item.photo;
      const itemH   = hasPhoto ? 36 : 20;

      if (y + itemH > pageH - 14) { doc.addPage(); y = 14; }

      const [r, g, b] = statusColors[item.status];

      if (idx % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(14, y - 2, pageW - 28, itemH, "F");
      }

      doc.setFillColor(r, g, b);
      doc.rect(14, y - 2, 3, itemH, "F");

      if (hasPhoto) {
        try {
          doc.addImage(item.photo!, "JPEG", 20, y, 28, 28);
        } catch {}
      }

      const tx = hasPhoto ? 52 : 20;

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150, 150, 150);
      doc.text(`#${idx + 1}`, tx, y + 4);

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(20, 20, 20);
      doc.text(item.codigo, tx + 8, y + 4);

      if (item.sku) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`SKU: ${item.sku}`, tx, y + 10);
      }

      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(`Pedido: ${item.quantidadePedida}  |  Real: ${item.quantidadeReal ?? "-"}`, tx, y + (item.sku ? 16 : 10));

      doc.setFillColor(r, g, b);
      doc.roundedRect(pageW - 42, y + 2, 28, 8, 2, 2, "F");
      doc.setFontSize(6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(statusLabels[item.status], pageW - 28, y + 7, { align: "center" });

      y += itemH + 2;
    });

    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(240, 240, 240);
      doc.rect(0, pageH - 10, pageW, 10, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(`${empresa} · Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, pageH - 3);
      doc.text(`Página ${i} de ${totalPages}`, pageW - 14, pageH - 3, { align: "right" });
    }

    doc.save(`conferencia_${empresa}_${new Date().toISOString().slice(0, 10)}.pdf`);
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
          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Tipo</p>
            <div className="flex gap-2">
              {flagOptions.map((opt) => (
                <button key={opt.value} onClick={() => setFlag(opt.value)}
                  className="flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                  style={{
                    background: flag === opt.value ? "hsl(var(--primary))" : "hsl(var(--muted))",
                    color: flag === opt.value ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    border: flag === opt.value ? "2px solid hsl(var(--primary))" : "2px solid transparent",
                  }}>{opt.label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-foreground mb-2">Empresa</p>
            <div className="flex gap-2">
              {empresaOptions.map((opt) => (
                <button key={opt.value} onClick={() => { setEmpresa(opt.value); setSenha(""); setSenhaErro(false); }}
                  className="flex-1 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98]"
                  style={{
                    background: empresa === opt.value ? opt.color : "hsl(var(--muted))",
                    color: empresa === opt.value ? "#fff" : "hsl(var(--muted-foreground))",
                    border: empresa === opt.value ? `2px solid ${opt.color}` : "2px solid transparent",
                  }}>{opt.label}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-foreground mb-1.5 block flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Senha
            </label>
            <input
              type="password"
              placeholder="••••"
              value={senha}
              onChange={(e) => { setSenha(e.target.value); setSenhaErro(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && senha.trim()) confirmarSenha(); }}
              className={`w-full h-12 px-4 rounded-xl border bg-card text-foreground text-base font-bold text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-ring transition-all ${senhaErro ? "border-destructive ring-1 ring-destructive" : "border-input"}`}
            />
            {senhaErro && <p className="text-xs text-destructive mt-1">Senha incorreta para {empresa}</p>}
          </div>

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

          <div className="flex justify-center pt-1"><EmpresaBadge /></div>

          {tasksErro && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">{tasksErro}</div>
          )}

          <button
            onClick={() => {
              if (!conferente.trim()) { toast({ title: "Informe o nome do conferente", variant: "destructive" }); return; }
              if (!senha.trim())      { toast({ title: "Informe a senha",               variant: "destructive" }); return; }
              confirmarSenha();
            }}
            disabled={loadingTasks}
            className="w-full h-13 bg-primary text-primary-foreground rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-primary/25 disabled:opacity-60"
          >
            {loadingTasks
              ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Buscando...</>
              : <><ClipboardList className="w-5 h-5" /> Buscar Pedidos do ClickUp</>}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">ou</span>
            <div className="flex-1 h-px bg-border" />
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
            className="w-full h-11 bg-muted text-muted-foreground rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border border-border"
          >
            <FileInput className="w-4 h-4" /> Selecionar Arquivo Manualmente
          </button>
        </div>
      </div>
    );
  }

  if (phase === "pickTask") {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setPhase("import")} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>
          <button onClick={recarregarTasks} disabled={loadingTasks}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTasks ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-foreground">Pedidos — Analisado</p>
            <p className="text-xs text-muted-foreground">{tasks.length} task(s) encontrada(s)</p>
          </div>
          <EmpresaBadge />
        </div>

        {tasksErro && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">{tasksErro}</div>
        )}

        {loadingTasks && (
          <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
            <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Carregando tasks...</span>
          </div>
        )}

        {!loadingTasks && tasks.length === 0 && (
          <div className="text-center py-10">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-muted-foreground">Nenhuma task no status Analisado</p>
            <p className="text-xs text-muted-foreground mt-1">Verifique o ClickUp ou aguarde novas listas</p>
          </div>
        )}

        <div className="space-y-2">
          {tasks.map((task) => {
            const isLoading = loadingJson && taskSelecionada?.id === task.id;
            const data = task.date_created
              ? new Date(Number(task.date_created)).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "";
            return (
              <button
                key={task.id}
                onClick={() => abrirTask(task)}
                disabled={loadingJson}
                className="w-full text-left rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3 active:scale-[0.99] transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{task.name}</p>
                  {data && <p className="text-xs text-muted-foreground mt-0.5">{data}</p>}
                </div>
                {isLoading
                  ? <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  : <Play className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            );
          })}
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

    const analisarEstoqueNoSupabase = async () => {
      setLoadingEstoque(true);
      try {
        const codigosParaBuscar = items.map(i => i.codigo);
        const { data, error } = await supabase
          .from('estoque')
          .select('codigo, quantidade')
          .in('codigo', codigosParaBuscar);

        if (error) throw error;

        const mapaEstoque = new Map<string, number>();
        if (data) {
          data.forEach((row: any) => {
            mapaEstoque.set(row.codigo, Number(row.quantidade));
          });
        }

        setItems((prev) =>
          prev.map(item => ({
            ...item,
            estoque_sistema: mapaEstoque.get(item.codigo) ?? 0
          }))
        );

        setEstoqueAnalisado(true);
        toast({ title: "✅ Análise concluída!", description: "Estoques cruzados com o banco de dados." });
      } catch (error: any) {
        toast({ title: "❌ Erro na análise", description: "Falha ao conectar com o Supabase.", variant: "destructive" });
      } finally {
        setLoadingEstoque(false);
      }
    };

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

        {/* BOTÃO ANALISAR ESTOQUE */}
        <button
          onClick={analisarEstoqueNoSupabase}
          disabled={loadingEstoque || estoqueAnalisado}
          className={`w-full h-14 rounded-xl font-bold text-base flex items-center justify-center gap-3 active:scale-[0.98] transition-all border shadow-lg ${
            estoqueAnalisado
              ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)] shadow-none"
              : "bg-primary text-primary-foreground border-primary shadow-primary/25 hover:opacity-90"
          }`}
        >
          {loadingEstoque ? (
            <><span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Buscando no Banco...</>
          ) : estoqueAnalisado ? (
            <><CheckCircle2 className="w-5 h-5" /> Estoque Analisado</>
          ) : (
            <><Database className="w-5 h-5" /> Analisar Estoque do Sistema</>
          )}
        </button>

        <div className="grid grid-cols-3 gap-2">
          <button onClick={exportPDF} className="h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={exportJSON} className="h-11 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
            <FileJson className="w-4 h-4" /> JSON
          </button>
          <button
            onClick={enviarClickUp}
            disabled={sendStatus === "sending" || sendStatus === "sent"}
            className="h-11 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            style={{
              background:
                sendStatus === "sent"    ? "hsl(var(--success))"     :
                sendStatus === "error"   ? "hsl(var(--destructive))"  :
                sendStatus === "sending" ? "hsl(var(--muted))"        :
                "hsl(var(--primary))",
              color:
                sendStatus === "sent"    ? "hsl(var(--success-foreground))"     :
                sendStatus === "error"   ? "hsl(var(--destructive-foreground))" :
                sendStatus === "sending" ? "hsl(var(--muted-foreground))"       :
                "hsl(var(--primary-foreground))",
            }}
          >
            {sendStatus === "sending" && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {sendStatus === "sent"    && <CheckCircle2 className="w-4 h-4" />}
            {sendStatus === "error"   && <XCircle className="w-4 h-4" />}
            {sendStatus === "idle"    && <Share2 className="w-4 h-4" />}
            {sendStatus === "sending" ? "Enviando…" : sendStatus === "sent" ? "Enviado!" : sendStatus === "error" ? "Tentar de novo" : "ClickUp"}
          </button>
        </div>

        {/* LISTA COM CORES VERDE/VERMELHO APÓS ANÁLISE */}
        <div className="space-y-2">
          {items.map((item, idx) => {
            const label = getStatusLabel(item.status);
            const StatusIcon = label.icon;

            let corFundo = getStatusColor(item.status);
            if (estoqueAnalisado) {
              if (item.estoque_sistema !== undefined && item.estoque_sistema > 0) {
                corFundo = "border-l-4 border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]";
              } else {
                corFundo = "border-l-4 border-l-destructive bg-destructive/10";
              }
            }

            return (
              <div key={item.id} className={`rounded-xl p-3 shadow-sm flex gap-3 items-center transition-colors duration-300 ${corFundo}`}>
                {item.photo && <img src={item.photo} alt={item.codigo} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                  <p className="text-sm font-mono font-bold text-foreground">{item.codigo}</p>
                  {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  <p className="text-xs text-muted-foreground">
                    Pedido: <strong>{item.quantidadePedida}</strong> • Real: <strong>{item.quantidadeReal}</strong>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className={`flex items-center gap-1 text-[11px] font-bold ${label.color} bg-background/50 px-2 py-0.5 rounded-full`}>
                    <StatusIcon className="w-3.5 h-3.5" /> {label.text}
                  </div>
                  {estoqueAnalisado && (
                    <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${item.estoque_sistema! > 0 ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]" : "bg-destructive text-destructive-foreground"}`}>
                      <Database className="w-3 h-3" /> Sis: {item.estoque_sistema}
                    </div>
                  )}
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