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
  Database // 👈 Ícone novo para o banco de dados
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

// 👈 1. IMPORTANDO O SUPABASE
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
  estoque_sistema?: number | null; // 👈 2. CAMPO NOVO PARA GUARDAR O ESTOQUE
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
  
  // 👈 3. ESTADOS DA ANÁLISE DO SUPABASE
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

  // ... (Funções do ClickUp omitidas por brevidade, permanecem idênticas)
  const confirmarSenha = async () => { /* igual */
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

  const recarregarTasks = async () => { /* igual */
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

  const abrirTask = async (task: ClickUpTask) => { /* igual */
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

  const processJsonText = (text: string): boolean => { /* igual */
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

  const processCsvText = (text: string, itemsOriginais?: ConferenceItem[]): boolean => { /* igual */
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

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => { /* igual */
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

  // 👈 4. LÓGICA DE BUSCA DO SUPABASE AQUI
  const analisarEstoqueNoSupabase = async () => {
    setLoadingEstoque(true);
    try {
      // Pega todos os códigos da lista
      const codigosParaBuscar = items.map(i => i.codigo);

      // Faz a consulta no Supabase na tabela 'estoque'
      const { data, error } = await supabase
        .from('estoque')
        .select('codigo, quantidade')
        .in('codigo', codigosParaBuscar);

      if (error) throw error;

      // Cria um mapa para achar a quantidade rapidinho
      const mapaEstoque = new Map<string, number>();
      if (data) {
        data.forEach((row: any) => {
          mapaEstoque.set(row.codigo, Number(row.quantidade));
        });
      }

      // Atualiza o estado dos itens adicionando o campo 'estoque_sistema'
      setItems((prev) => 
        prev.map(item => ({
          ...item,
          estoque_sistema: mapaEstoque.get(item.codigo) ?? 0 // Se não achar, diz que é 0
        }))
      );

      setEstoqueAnalisado(true);
      toast({ title: "Análise concluída!", description: "Os estoques do sistema foram carregados." });
    } catch (error: any) {
      console.error(error);
      toast({ title: "Erro na análise", description: "Verifique sua conexão com o banco de dados.", variant: "destructive" });
    } finally {
      setLoadingEstoque(false);
    }
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

  const handleQuantityChange = (id: string, value: string) => { /* igual */
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

  const enviarClickUp = async () => { /* igual */
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

  const getStatusColor = (status: ConferenceStatus) => { /* igual */
    switch (status) {
      case "separado": return "border-l-4 border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.08)]";
      case "nao_tem": return "border-l-4 border-l-destructive bg-destructive/5";
      case "nao_tem_tudo": return "border-l-4 border-l-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.08)]";
      default: return "border-l-4 border-l-border bg-card";
    }
  };

  const getStatusLabel = (status: ConferenceStatus) => { /* igual */
    switch (status) {
      case "separado": return { text: "Separado", icon: CheckCircle2, color: "text-[hsl(var(--success))]" };
      case "nao_tem": return { text: "Não tem", icon: XCircle, color: "text-destructive" };
      case "nao_tem_tudo": return { text: "Parcial", icon: AlertTriangle, color: "text-[hsl(var(--warning))]" };
      default: return { text: "Pendente", icon: AlertTriangle, color: "text-muted-foreground" };
    }
  };

  const exportPDF = () => { /* igual */
    // [CÓDIGO OMITIDO AQUI APENAS POR ESPAÇO, MAS COLOQUE O SEU CÓDIGO JS_PDF EXATAMENTE COMO ESTAVA ANTES]
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

  const exportJSON = async () => { /* igual */
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

  const EmpresaBadge = () => { /* igual */
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

  // RENDERS
  if (phase === "import") { /* igual ... omitido apenas texto */ }
  if (phase === "pickTask") { /* igual ... omitido apenas texto */ }
  if (phase === "ready") { /* igual ... omitido apenas texto */ }

  // 👈 TELA FINISHED - ONDE ACONTECE A MÁGICA DA ANÁLISE!
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

        {/* 👈 BOTÃO DE ANÁLISE DO SUPABASE AQUI! */}
        {!estoqueAnalisado && (
          <button 
            onClick={analisarEstoqueNoSupabase}
            disabled={loadingEstoque}
            className="w-full h-12 rounded-xl bg-secondary text-secondary-foreground font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform border border-border"
          >
            {loadingEstoque ? (
              <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Database className="w-5 h-5" /> Analisar Estoque no Sistema</>
            )}
          </button>
        )}

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
            {sendStatus === "sending" ? "Enviando…" :
             sendStatus === "sent"    ? "Enviado!" :
             sendStatus === "error"   ? "Tentar de novo" :
             "ClickUp"}
          </button>
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => {
            const label = getStatusLabel(item.status);
            const StatusIcon = label.icon;
            
            // 👈 LÓGICA DE CORES DA ANÁLISE
            let corFundo = getStatusColor(item.status);
            if (estoqueAnalisado) {
              if (item.estoque_sistema !== undefined && item.estoque_sistema > 0) {
                corFundo = "border-l-4 border-l-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]"; // Fundo verde
              } else {
                corFundo = "border-l-4 border-l-destructive bg-destructive/10"; // Fundo vermelho
              }
            }

            return (
              <div key={item.id} className={`rounded-xl p-3 shadow-sm flex gap-3 items-center ${corFundo} transition-colors`}>
                {item.photo && <img src={item.photo} alt={item.codigo} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                  <p className="text-sm font-mono font-bold text-foreground">{item.codigo}</p>
                  {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  <p className="text-xs text-muted-foreground">
                    Pedido: <strong>{item.quantidadePedida}</strong> • Real: <strong>{item.quantidadeReal}</strong>
                  </p>
                </div>
                
                {/* Lado Direito: Status e Estoque */}
                <div className="flex flex-col items-end gap-1">
                  <div className={`flex items-center gap-1 text-xs font-semibold ${label.color}`}>
                    <StatusIcon className="w-4 h-4" /> {label.text}
                  </div>
                  
                  {/* Badge de estoque após análise */}
                  {estoqueAnalisado && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.estoque_sistema! > 0 ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]" : "bg-destructive text-destructive-foreground"}`}>
                      Sis: {item.estoque_sistema}
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

  // RESTO DO CÓDIGO (Running) FICA IGUAL...
  const pendentes = items.filter((i) => i.status === "pendente").length;
  const doneCount = items.length - pendentes;
  const label = currentItem ? getStatusLabel(currentItem.status) : null;
  const StatusIcon = label?.icon;

  return (
     // [COLOQUE AQUI O RESTANTE DO SEU CÓDIGO ORIGINAL DA TELA DE CONFERÊNCIA QUE COMEÇA EM "<div className="p-4 space-y-3">..."]
  );
};

export default ConferenceView;