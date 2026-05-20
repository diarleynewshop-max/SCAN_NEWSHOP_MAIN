import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Check, ImageOff, BarChart3, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";
import {
  type EmpresaKey, type FlagKey, type RelatorioDiario,
  type RelatorioDataOption, type RelatorioSalvo,
  listarDatasRelatorio, listarRelatoriosSalvos,
  salvarRelatorioDashboard, buscarRelatorioSalvo,
  buscarTasksCompras,
} from "@/lib/clickupApi";
import { buscarProdutoVarejoFacil } from "@/lib/varejoFacilIntegration";
import { blobToDataUrl, isDataPhotoUrl } from "@/lib/photoUtils";
import { useAuth } from "@/hooks/useAuth";

// ── helpers ────────────────────────────────────────────────────────────────────

async function fetchErpImageDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (isDataPhotoUrl(src)) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const d = await res.json();
      return typeof d?.dataUrl === "string" ? d.dataUrl : null;
    }
    if (!ct.startsWith("image/")) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function ptBrToDateKey(label: string): string {
  const [d, m, y] = label.split("/");
  return `${y}-${m}-${d}`;
}

function dateKeyToPtBr(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function labelDia(key: string): string {
  return key.slice(5).replace("-", "/");
}

const STATUS_PRIORITY: Record<string, number> = { nao_tem: 4, parcial: 3, pendente: 2, separado: 1 };

function statusLabel(s: string) {
  return s === "nao_tem" ? "Não tem" : s === "parcial" ? "Parcial" : s === "pendente" ? "Pendente" : "Separado";
}

const COR = {
  separado: "#22c55e",
  naoTem: "#ef4444",
  parcial: "#eab308",
  pendente: "#9ca3af",
};

type TipoGrafico = "rosca" | "barra" | "barra100" | "pareto" | "linha" | "unidades";
type ModoSeletor = "dia" | "periodo" | "mes";

function extrairCodigoCompras(taskName: string): string | null {
  // NEWSHOP: "🛒 7908782215243 — NOME — 19/05/2026"
  const m1 = taskName.match(/🛒\s+(\S+)/);
  if (m1) return m1[1];
  // SF (SOYE/FACIL): "Compras SOYE: 7908782215243 - NOME - 19/05/2026"
  const m2 = taskName.match(/^Compras\s+\w+:\s+(\S+)/i);
  if (m2) return m2[1];
  return null;
}

interface ItemFrequencia {
  codigo: string;
  sku: string;
  secao: string;
  photo?: string | null;
  vezes: number;
  diasOcorrencia: string[];
  totalPedido: number;
  totalReal: number;
  statusDominante: string;
  ocorrencias: Array<{ data: string; status: string; pedido: number; real: number | null }>;
}

// ── componente ─────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const navigate = useNavigate();
  const { loginSalvo } = useAuth();
  const { toast } = useToast();

  // ── permissões por login ────────────────────────────────────────────────────
  const empresasPermitidas = useMemo<EmpresaKey[]>(() => {
    const role = loginSalvo?.role;
    const userEmpresa = loginSalvo?.empresa as EmpresaKey | undefined;
    if (role === "admin" || role === "super") return ["NEWSHOP", "SOYE", "FACIL"];
    // SF = SOYE ou FACIL → vê as duas
    if (userEmpresa === "SOYE" || userEmpresa === "FACIL") return ["SOYE", "FACIL"];
    return [userEmpresa ?? "NEWSHOP"];
  }, [loginSalvo]);

  const flagsPermitidas = useMemo<FlagKey[]>(() => {
    const role = loginSalvo?.role;
    if (role === "admin" || role === "super") return ["loja", "cd"];
    return [(loginSalvo?.flag as FlagKey) ?? "loja"];
  }, [loginSalvo]);

  const [empresa, setEmpresa] = useState<EmpresaKey>(
    () => (loginSalvo?.empresa as EmpresaKey) ?? "NEWSHOP"
  );
  const [flag, setFlag] = useState<FlagKey>(
    () => (loginSalvo?.flag as FlagKey) ?? "loja"
  );

  // Corrige empresa/flag se não estiverem na lista permitida
  useEffect(() => {
    if (!empresasPermitidas.includes(empresa)) setEmpresa(empresasPermitidas[0]);
  }, [empresasPermitidas]);

  useEffect(() => {
    if (!flagsPermitidas.includes(flag)) setFlag(flagsPermitidas[0]);
  }, [flagsPermitidas]);

  // datas disponíveis e relatórios salvos
  const [datasDisponiveis, setDatasDisponiveis] = useState<RelatorioDataOption[]>([]);
  const [relatoriosSalvos, setRelatoriosSalvos] = useState<RelatorioSalvo[]>([]);
  const [carregandoDatas, setCarregandoDatas] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [gerandoTodos, setGerandoTodos] = useState(false);
  const [progressoGerar, setProgressoGerar] = useState({ atual: 0, total: 0 });

  // seletor de período
  const [modoSeletor, setModoSeletor] = useState<ModoSeletor>("dia");
  const [diaUnico, setDiaUnico] = useState<string | null>(null);
  const [periodoInicio, setPeriodoInicio] = useState<string | null>(null);
  const [periodoFim, setPeriodoFim] = useState<string | null>(null);
  const [mesSelecionado, setMesSelecionado] = useState(() => new Date().toISOString().slice(0, 7));

  // relatórios carregados para o período
  const [relatoriosPeriodo, setRelatoriosPeriodo] = useState<RelatorioDiario[]>([]);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  const [progressoPeriodo, setProgressoPeriodo] = useState({ atual: 0, total: 0 });

  // charts e filtros
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>("rosca");
  const [filtroStatus, setFiltroStatus] = useState<Set<string>>(
    () => new Set(["nao_tem", "parcial", "pendente", "separado"])
  );
  const [filtroItens, setFiltroItens] = useState<"criticos" | "todos">("criticos");
  const [filtroDia, setFiltroDia] = useState<string | null>(null);
  const [filtroDuplicadas, setFiltroDuplicadas] = useState(false);
  const [filtroSecao, setFiltroSecao] = useState<string | null>(null);
  const [filtroTexto, setFiltroTexto] = useState("");
  type Ordenacao = "mais-pedido" | "menos-pedido" | "mais-saiu" | "menos-saiu";
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("mais-pedido");

  // status de compras
  const [statusComprasMap, setStatusComprasMap] = useState<Record<string, string>>({});
  const [carregandoStatusCompras, setCarregandoStatusCompras] = useState(false);

  // fotos ERP
  const [fotosErp, setFotosErp] = useState<Record<string, string | null>>({});
  const [carregandoFotosErp, setCarregandoFotosErp] = useState(false);
  const [progressoFotos, setProgressoFotos] = useState({ atual: 0, total: 0 });
  const [itemModalIdx, setItemModalIdx] = useState<number | null>(null);

  // paginação da lista de itens
  const PAGE_SIZE = 10;
  const [paginaAtual, setPaginaAtual] = useState(1);

  // ── carrega datas + salvos ──────────────────────────────────────────────────
  const carregarDados = useCallback(async () => {
    setCarregandoDatas(true);
    setRelatoriosPeriodo([]);
    setFotosErp({});
    try {
      const [datas, salvos] = await Promise.all([
        listarDatasRelatorio(empresa, flag),
        listarRelatoriosSalvos(empresa, flag),
      ]);
      setDatasDisponiveis(datas);
      setRelatoriosSalvos(salvos);
    } catch (err: any) {
      toast({ title: "Erro ao carregar datas", description: err.message, variant: "destructive" });
    } finally {
      setCarregandoDatas(false);
    }
  }, [empresa, flag]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const getSalvo = (dateKey: string) => relatoriosSalvos.find((r) => r.data === dateKey);

  // ── gerar + salvar ──────────────────────────────────────────────────────────
  const handleGerarSalvar = async (dateKey: string) => {
    setGerando(dateKey);
    try {
      const report = await salvarRelatorioDashboard(empresa, flag, dateKey);
      setRelatoriosPeriodo([report]);
      setDiaUnico(dateKey);
      setFotosErp({});
      const salvos = await listarRelatoriosSalvos(empresa, flag);
      setRelatoriosSalvos(salvos);
      toast({ title: "Relatório gerado", description: `${dateKey} salvo no ClickUp` });
    } catch (err: any) {
      toast({ title: "Erro ao gerar", description: err.message, variant: "destructive" });
    } finally {
      setGerando(null);
    }
  };

  // ── gerar todos os pendentes ────────────────────────────────────────────────
  const handleGerarTodos = async () => {
    const salvadosSet = new Set(relatoriosSalvos.map((r) => r.data));
    const pendentes = datasDisponiveis.filter((d) => !salvadosSet.has(d.data));
    if (pendentes.length === 0) {
      toast({ title: "Todos os relatórios já foram gerados" });
      return;
    }
    setGerandoTodos(true);
    setProgressoGerar({ atual: 0, total: pendentes.length });
    let sucesso = 0;
    let falhas = 0;
    for (const d of pendentes) {
      setGerando(d.data);
      try {
        await salvarRelatorioDashboard(empresa, flag, d.data);
        sucesso++;
      } catch {
        falhas++;
      }
      setProgressoGerar((p) => ({ ...p, atual: p.atual + 1 }));
    }
    setGerando(null);
    setGerandoTodos(false);
    const salvos = await listarRelatoriosSalvos(empresa, flag);
    setRelatoriosSalvos(salvos);
    toast({
      title: "Geração concluída",
      description: `${sucesso} gerado(s)${falhas > 0 ? `, ${falhas} erro(s)` : ""}`,
    });
  };

  // ── datas do período a carregar ─────────────────────────────────────────────
  const datesDoPeriodo = useMemo<string[]>(() => {
    if (modoSeletor === "dia") return diaUnico ? [diaUnico] : [];
    if (modoSeletor === "periodo") {
      if (!periodoInicio || !periodoFim) return [];
      const ini = periodoInicio <= periodoFim ? periodoInicio : periodoFim;
      const fim = periodoInicio <= periodoFim ? periodoFim : periodoInicio;
      return relatoriosSalvos.filter((r) => r.data >= ini && r.data <= fim).map((r) => r.data);
    }
    // mes
    return relatoriosSalvos.filter((r) => r.data.startsWith(mesSelecionado)).map((r) => r.data);
  }, [modoSeletor, diaUnico, periodoInicio, periodoFim, mesSelecionado, relatoriosSalvos]);

  // ── carregar período ────────────────────────────────────────────────────────
  const carregarPeriodo = useCallback(async () => {
    if (datesDoPeriodo.length === 0) {
      toast({ title: "Nenhuma data com relatório salvo no período", variant: "destructive" });
      return;
    }
    setCarregandoPeriodo(true);
    setRelatoriosPeriodo([]);
    setFotosErp({});
    setProgressoPeriodo({ atual: 0, total: datesDoPeriodo.length });

    const reports: RelatorioDiario[] = [];
    const CONC = 4;
    let concluidos = 0;

    for (let i = 0; i < datesDoPeriodo.length; i += CONC) {
      const lote = datesDoPeriodo.slice(i, i + CONC);
      const results = await Promise.all(
        lote.map((d) => buscarRelatorioSalvo(empresa, flag, d).catch(() => null))
      );
      results.forEach((r) => { if (r) reports.push(r); });
      concluidos += lote.length;
      setProgressoPeriodo({ atual: concluidos, total: datesDoPeriodo.length });
    }

    setRelatoriosPeriodo(reports);
    setCarregandoPeriodo(false);
  }, [datesDoPeriodo, empresa, flag]);

  // auto-carrega quando dia único muda
  useEffect(() => {
    if (modoSeletor === "dia" && diaUnico) carregarPeriodo();
  }, [diaUnico]);

  // ── dados agregados ─────────────────────────────────────────────────────────
  const dados = useMemo(() => {
    if (relatoriosPeriodo.length === 0) return null;
    const sorted = [...relatoriosPeriodo].sort((a, b) => a.data.localeCompare(b.data));

    const resumo = sorted.reduce(
      (acc, r) => ({
        separado: acc.separado + r.resumo.separado,
        naoTem: acc.naoTem + r.resumo.naoTem,
        parcial: acc.parcial + r.resumo.parcial,
        pendente: acc.pendente + r.resumo.pendente,
        totalItens: acc.totalItens + r.resumo.totalItens,
      }),
      { separado: 0, naoTem: 0, parcial: 0, pendente: 0, totalItens: 0 }
    );

    const porDia = sorted.map((r) => {
      const total = r.resumo.totalItens || 1;
      const itens = r.itens ?? r.itensCriticos;
      const pedidoDia = itens.reduce((s, i) => s + (i.pedido ?? 0), 0);
      const realDia   = itens.reduce((s, i) => s + (i.real   ?? 0), 0);
      const pctDifDia = pedidoDia > 0 ? +(((pedidoDia - realDia) / pedidoDia) * 100).toFixed(1) : 0;
      return {
        label: labelDia(r.data),
        "Separado": r.resumo.separado,
        "Não tem": r.resumo.naoTem,
        "Parcial": r.resumo.parcial,
        "Pendente": r.resumo.pendente,
        total: r.resumo.totalItens,
        "pctSeparado": +((r.resumo.separado / total) * 100).toFixed(1),
        "pctNão tem": +((r.resumo.naoTem / total) * 100).toFixed(1),
        "pctParcial": +((r.resumo.parcial / total) * 100).toFixed(1),
        "pctPendente": +((r.resumo.pendente / total) * 100).toFixed(1),
        "Pedido": pedidoDia,
        "Real": realDia,
        "% Diferença": pctDifDia,
      };
    });

    // frequência de itens
    const itemMap = new Map<string, ItemFrequencia>();
    for (const r of sorted) {
      const itens = r.itens ?? r.itensCriticos;
      for (const item of itens) {
        const ex = itemMap.get(item.codigo);
        if (!ex) {
          itemMap.set(item.codigo, {
            codigo: item.codigo, sku: item.sku, secao: item.secao, photo: item.photo,
            vezes: 1, diasOcorrencia: [r.data],
            totalPedido: item.pedido, totalReal: item.real ?? 0,
            statusDominante: item.status,
            ocorrencias: [{ data: r.data, status: item.status, pedido: item.pedido, real: item.real }],
          });
        } else {
          ex.vezes += 1;
          if (!ex.diasOcorrencia.includes(r.data)) ex.diasOcorrencia.push(r.data);
          ex.totalPedido += item.pedido;
          ex.totalReal += item.real ?? 0;
          if (!ex.photo && item.photo) ex.photo = item.photo;
          const np = STATUS_PRIORITY[item.status] ?? 1;
          const cp = STATUS_PRIORITY[ex.statusDominante] ?? 1;
          if (np > cp) ex.statusDominante = item.status;
          ex.ocorrencias.push({ data: r.data, status: item.status, pedido: item.pedido, real: item.real });
        }
      }
    }

    const frequencia = Array.from(itemMap.values()).sort((a, b) => b.vezes - a.vezes);

    // Pareto (top 20)
    let cum = 0;
    const totalFreq = frequencia.reduce((s, i) => s + i.vezes, 0);
    const pareto = frequencia.slice(0, 20).map((i) => {
      cum += i.vezes;
      return {
        codigo: i.codigo.slice(-8),
        vezes: i.vezes,
        cumulativo: totalFreq > 0 ? Math.round((cum / totalFreq) * 100) : 0,
      };
    });

    // rosca / pie
    const pizza = [
      { name: "Separado", value: resumo.separado, color: COR.separado },
      { name: "Não tem", value: resumo.naoTem, color: COR.naoTem },
      { name: "Parcial", value: resumo.parcial, color: COR.parcial },
      { name: "Pendente", value: resumo.pendente, color: COR.pendente },
    ].filter((d) => d.value > 0);

    // totais de unidades do período
    const totalPedido = frequencia.reduce((s, i) => s + i.totalPedido, 0);
    const totalReal   = frequencia.reduce((s, i) => s + i.totalReal,   0);
    const pctDif = totalPedido > 0 ? +(((totalPedido - totalReal) / totalPedido) * 100).toFixed(1) : 0;

    return { resumo, porDia, frequencia, pareto, pizza, totalPedido, totalReal, pctDif };
  }, [relatoriosPeriodo]);

  // ── carregar status de compras do ClickUp ───────────────────────────────────
  const carregarStatusCompras = useCallback(async () => {
    if (carregandoStatusCompras) return;
    setCarregandoStatusCompras(true);
    try {
      const tasks = await buscarTasksCompras(empresa);
      // Para cada código, guarda o status mais "avançado" (não-to-do tem prioridade)
      const mapa: Record<string, { status: string; updated: number }> = {};
      for (const task of tasks) {
        const codigo = extrairCodigoCompras(task.name);
        if (!codigo) continue;
        const updated = Number(task.date_updated) || 0;
        const statusNorm = task.status.toLowerCase().trim();
        const existing = mapa[codigo];
        // Prefere qualquer status diferente de "to do" / "a fazer"; em empate, o mais recente
        const incumbentIsTodo = !existing || existing.status.toLowerCase().trim() === "to do" || existing.status.toLowerCase().trim() === "a fazer";
        const incomingIsTodo = statusNorm === "to do" || statusNorm === "a fazer";
        if (!existing || (!incomingIsTodo && incumbentIsTodo) || (incomingIsTodo === incumbentIsTodo && updated > existing.updated)) {
          mapa[codigo] = { status: task.status, updated };
        }
      }
      const resultado: Record<string, string> = {};
      for (const [cod, val] of Object.entries(mapa)) resultado[cod] = val.status;
      setStatusComprasMap(resultado);
      toast({ title: "Status de compras carregado", description: `${Object.keys(resultado).length} produto(s)` });
    } catch (err: any) {
      toast({ title: "Erro ao carregar compras", description: err.message, variant: "destructive" });
    } finally {
      setCarregandoStatusCompras(false);
    }
  }, [carregandoStatusCompras, empresa]);

  // ── itens filtrados ─────────────────────────────────────────────────────────
  const secoesDisponiveis = useMemo(() => {
    if (!dados) return [];
    const s = new Set(dados.frequencia.map((i) => i.secao).filter(Boolean));
    return [...s].sort();
  }, [dados]);

  const itensFiltrados = useMemo(() => {
    if (!dados) return [];
    let lista =
      filtroItens === "criticos"
        ? dados.frequencia.filter((i) => i.statusDominante === "nao_tem" || i.statusDominante === "parcial")
        : dados.frequencia;
    lista = lista.filter((i) => filtroStatus.has(i.statusDominante));
    if (filtroDia) lista = lista.filter((i) => i.diasOcorrencia.includes(filtroDia));
    if (filtroDuplicadas) lista = lista.filter((i) => i.vezes > 1);
    if (filtroSecao) lista = lista.filter((i) => i.secao === filtroSecao);
    if (filtroTexto.trim()) {
      const t = filtroTexto.toLowerCase();
      lista = lista.filter((i) =>
        i.codigo.toLowerCase().includes(t) || (i.sku || "").toLowerCase().includes(t)
      );
    }
    lista = [...lista].sort((a, b) => {
      if (ordenacao === "menos-pedido") return a.vezes - b.vezes;
      if (ordenacao === "mais-saiu")    return b.totalReal - a.totalReal;
      if (ordenacao === "menos-saiu")  return a.totalReal - b.totalReal;
      return b.vezes - a.vezes; // mais-pedido (default)
    });
    return lista;
  }, [dados, filtroItens, filtroStatus, filtroDia, filtroDuplicadas, filtroSecao, filtroTexto, ordenacao]);

  // ── fotos ERP — carrega página atual primeiro, depois resto em background ────
  const fotosCancelRef = useRef(false);

  const carregarFotosErp = useCallback(async (itensPrioritarios?: typeof itensFiltrados) => {
    if (carregandoFotosErp || !dados) return;

    // Monta lista: prioritários primeiro (página atual), depois o resto
    const todos = dados.frequencia.filter((i) => !i.photo && !fotosErp[i.codigo]);
    const prioCods = new Set((itensPrioritarios ?? []).map((i) => i.codigo));
    const prio = todos.filter((i) => prioCods.has(i.codigo));
    const resto = todos.filter((i) => !prioCods.has(i.codigo));
    const ordem = [...prio, ...resto];

    if (ordem.length === 0) return;

    fotosCancelRef.current = false;
    setCarregandoFotosErp(true);
    setProgressoFotos({ atual: 0, total: ordem.length });
    let done = 0;

    for (let i = 0; i < ordem.length; i += 4) {
      if (fotosCancelRef.current) break;
      const lote = ordem.slice(i, i + 4);
      const batch: Record<string, string | null> = {};
      await Promise.all(lote.map(async (item) => {
        try {
          const prod = await buscarProdutoVarejoFacil(item.codigo, { empresa, flag });
          batch[item.codigo] = prod?.imagem ? await fetchErpImageDataUrl(prod.imagem) : null;
        } catch { batch[item.codigo] = null; }
        done++;
        setProgressoFotos({ atual: done, total: ordem.length });
      }));
      setFotosErp((p) => ({ ...p, ...batch }));
    }
    setCarregandoFotosErp(false);
  }, [carregandoFotosErp, dados, empresa, flag, fotosErp, itensFiltrados]);

  const toggleFiltroStatus = (s: string) =>
    setFiltroStatus((prev) => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });

  // ── modal helpers ───────────────────────────────────────────────────────────
  const itemModal = itemModalIdx !== null ? itensFiltrados[itemModalIdx] ?? null : null;
  const fotoModal = itemModal ? (itemModal.photo || fotosErp[itemModal.codigo] || null) : null;

  const irPara = (idx: number) => {
    if (idx >= 0 && idx < itensFiltrados.length) setItemModalIdx(idx);
  };

  // reset filtros extras quando o período muda
  useEffect(() => {
    setFiltroDia(null);
    setFiltroDuplicadas(false);
    setFiltroSecao(null);
    setFiltroTexto("");
    setOrdenacao("mais-pedido");
  }, [relatoriosPeriodo]);

  // reset de página quando filtros ou dados mudam
  useEffect(() => { setPaginaAtual(1); }, [itensFiltrados]);

  // itens da página atual
  const totalPaginas = Math.max(1, Math.ceil(itensFiltrados.length / PAGE_SIZE));
  const itensPagina = itensFiltrados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);

  // auto-carrega fotos: página atual primeiro, depois resto em background
  useEffect(() => {
    if (!dados || carregandoFotosErp) return;
    const semFotoNaPagina = itensPagina.filter((i) => !i.photo && !fotosErp[i.codigo]);
    const semFotoTotal = dados.frequencia.filter((i) => !i.photo && !fotosErp[i.codigo]);
    if (semFotoTotal.length === 0) return;
    carregarFotosErp(semFotoNaPagina.length > 0 ? itensPagina : undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, paginaAtual]);

  // ── render ──────────────────────────────────────────────────────────────────
  const salvosKeys = new Set(relatoriosSalvos.map((r) => r.data));

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" />Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Relatórios de conferência</p>
          </div>
        </div>

        {/* Empresa / flag — filtrados por permissão */}
        <div className="flex gap-2 mb-5 flex-wrap items-center">
          {empresasPermitidas.map((e) => (
            <Button key={e} size="sm" variant={empresa === e ? "default" : "outline"} onClick={() => setEmpresa(e)}>{e}</Button>
          ))}
          {flagsPermitidas.length > 1 && <div className="w-px h-6 bg-border mx-1" />}
          {flagsPermitidas.map((f) => (
            <Button key={f} size="sm" variant={flag === f ? "default" : "outline"} onClick={() => setFlag(f)}>{f.toUpperCase()}</Button>
          ))}
          <Button variant="outline" size="sm" onClick={carregarDados} disabled={carregandoDatas} className="ml-auto">
            <RefreshCw className={`h-3 w-3 mr-1 ${carregandoDatas ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── PAINEL ESQUERDO ── */}
          <div className="lg:col-span-1 space-y-3">

            {/* Seletor de período */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Período</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Modo */}
                <div className="flex gap-1">
                  {(["dia", "periodo", "mes"] as ModoSeletor[]).map((m) => (
                    <Button key={m} size="sm" variant={modoSeletor === m ? "default" : "outline"}
                      className="flex-1 text-xs h-7"
                      onClick={() => { setModoSeletor(m); setRelatoriosPeriodo([]); setFotosErp({}); }}>
                      {m === "dia" ? "Dia" : m === "periodo" ? "Período" : "Mês"}
                    </Button>
                  ))}
                </div>

                {/* Dia único — select */}
                {modoSeletor === "dia" && (
                  <select
                    className="w-full text-sm border rounded p-1.5 bg-background"
                    value={diaUnico ?? ""}
                    onChange={(e) => setDiaUnico(e.target.value || null)}
                  >
                    <option value="">— selecione um dia —</option>
                    {relatoriosSalvos.map((r) => (
                      <option key={r.data} value={r.data}>{r.label}</option>
                    ))}
                  </select>
                )}

                {/* Período de → até */}
                {modoSeletor === "periodo" && (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">De</p>
                      <select className="w-full text-sm border rounded p-1.5 bg-background"
                        value={periodoInicio ?? ""}
                        onChange={(e) => setPeriodoInicio(e.target.value || null)}>
                        <option value="">— data inicial —</option>
                        {relatoriosSalvos.map((r) => <option key={r.data} value={r.data}>{r.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Até</p>
                      <select className="w-full text-sm border rounded p-1.5 bg-background"
                        value={periodoFim ?? ""}
                        onChange={(e) => setPeriodoFim(e.target.value || null)}>
                        <option value="">— data final —</option>
                        {relatoriosSalvos.map((r) => <option key={r.data} value={r.data}>{r.label}</option>)}
                      </select>
                    </div>
                    <Button size="sm" className="w-full" onClick={carregarPeriodo} disabled={carregandoPeriodo || !periodoInicio || !periodoFim}>
                      {carregandoPeriodo ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />{progressoPeriodo.atual}/{progressoPeriodo.total}</> : "Carregar período"}
                    </Button>
                  </div>
                )}

                {/* Mês */}
                {modoSeletor === "mes" && (
                  <div className="space-y-2">
                    <input type="month" value={mesSelecionado}
                      onChange={(e) => setMesSelecionado(e.target.value)}
                      className="w-full text-sm border rounded p-1.5 bg-background" />
                    <Button size="sm" className="w-full" onClick={carregarPeriodo} disabled={carregandoPeriodo}>
                      {carregandoPeriodo ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />{progressoPeriodo.atual}/{progressoPeriodo.total}</> : "Carregar mês"}
                    </Button>
                    <p className="text-xs text-muted-foreground">{relatoriosSalvos.filter(r => r.data.startsWith(mesSelecionado)).length} relatório(s) disponível(is)</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lista de datas disponíveis */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span>Datas com conferências</span>
                  {(() => {
                    const pendentes = datasDisponiveis.filter((d) => !salvosKeys.has(d.data)).length;
                    return (
                      <Button
                        size="sm" variant="outline"
                        className="h-6 text-xs px-2 shrink-0"
                        disabled={gerandoTodos || pendentes === 0}
                        onClick={handleGerarTodos}
                      >
                        {gerandoTodos
                          ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />{progressoGerar.atual}/{progressoGerar.total}</>
                          : `Gerar todos (${pendentes})`}
                      </Button>
                    );
                  })()}
                </CardTitle>
                <CardDescription className="text-xs">Status Complete no ClickUp</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {carregandoDatas && <p className="p-4 text-sm text-center text-muted-foreground">Carregando...</p>}
                {!carregandoDatas && datasDisponiveis.length === 0 && <p className="p-4 text-sm text-center text-muted-foreground">Nenhuma data</p>}
                <div className="divide-y max-h-64 overflow-y-auto">
                  {datasDisponiveis.map((d) => {
                    const salvo = salvosKeys.has(d.data);
                    const ativo = relatoriosPeriodo.some((r) => r.data === d.data);
                    return (
                      <div key={d.data}
                        className={`flex items-center justify-between px-3 py-2 transition-colors ${salvo ? "cursor-pointer hover:bg-muted/50" : ""} ${ativo ? "bg-muted" : ""}`}
                        onClick={() => salvo && modoSeletor === "dia" && setDiaUnico(d.data)}>
                        <div>
                          <p className="text-sm font-medium">{d.label}</p>
                          <p className="text-xs text-muted-foreground">{d.total} conferência(s)</p>
                        </div>
                        {salvo ? (
                          <Badge variant="secondary" className="text-xs gap-1 shrink-0"><Check className="h-3 w-3" />Salvo</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="text-xs h-7 shrink-0"
                            disabled={gerando === d.data}
                            onClick={(e) => { e.stopPropagation(); handleGerarSalvar(d.data); }}>
                            {gerando === d.data ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Gerando</> : "Gerar"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── PAINEL DIREITO ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Placeholder */}
            {relatoriosPeriodo.length === 0 && !carregandoPeriodo && (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-25" />
                  <p className="text-sm">Selecione um dia, período ou mês para visualizar</p>
                </CardContent>
              </Card>
            )}

            {carregandoPeriodo && (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin opacity-40" />
                  <p className="text-sm">Carregando {progressoPeriodo.atual}/{progressoPeriodo.total} relatório(s)...</p>
                </CardContent>
              </Card>
            )}

            {dados && !carregandoPeriodo && (
              <>
                {/* Cards resumo */}
                {/* Cards status */}
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { label: "Total SKUs", value: dados.resumo.totalItens },
                    { label: "Separado",   value: dados.resumo.separado },
                    { label: "Não tem",    value: dados.resumo.naoTem },
                    { label: "Parcial",    value: dados.resumo.parcial },
                    { label: "Pendente",   value: dados.resumo.pendente },
                  ].map((c) => (
                    <Card key={c.label}>
                      <CardContent className="p-3 text-center">
                        <p className="text-xl font-bold">{c.value}</p>
                        <p className="text-xs text-muted-foreground leading-tight">{c.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Cards unidades */}
                <div className="grid grid-cols-3 gap-2">
                  <Card className="border-blue-200 dark:border-blue-900">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-bold text-blue-600">{dados.totalPedido.toLocaleString("pt-BR")}</p>
                      <p className="text-xs text-muted-foreground">Unid. Pedidas</p>
                    </CardContent>
                  </Card>
                  <Card className="border-green-200 dark:border-green-900">
                    <CardContent className="p-3 text-center">
                      <p className="text-xl font-bold text-green-600">{dados.totalReal.toLocaleString("pt-BR")}</p>
                      <p className="text-xs text-muted-foreground">Unid. Enviadas</p>
                    </CardContent>
                  </Card>
                  <Card className={dados.pctDif > 20 ? "border-red-300 dark:border-red-900" : "border-yellow-200 dark:border-yellow-900"}>
                    <CardContent className="p-3 text-center">
                      <p className={`text-xl font-bold ${dados.pctDif > 20 ? "text-red-600" : "text-yellow-600"}`}>
                        {dados.pctDif}%
                      </p>
                      <p className="text-xs text-muted-foreground">% Diferença</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Seletor de tipo de gráfico */}
                <div className="flex gap-1 flex-wrap">
                  {([
                    { key: "rosca",    label: "Rosca" },
                    { key: "barra",    label: "Barra" },
                    { key: "barra100", label: "Barra 100%" },
                    { key: "pareto",   label: "Pareto" },
                    { key: "linha",    label: "Linha" },
                    { key: "unidades", label: "Unidades" },
                  ] as { key: TipoGrafico; label: string }[]).map(({ key, label }) => (
                    <Button key={key} size="sm"
                      variant={tipoGrafico === key ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => setTipoGrafico(key)}>
                      {label}
                    </Button>
                  ))}
                </div>

                {/* Área de gráfico */}
                <Card>
                  <CardContent className="pt-4">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">

                        {/* ROSCA */}
                        {tipoGrafico === "rosca" ? (
                          <PieChart>
                            <Pie data={dados.pizza} cx="50%" cy="50%"
                              innerRadius={55} outerRadius={90}
                              dataKey="value" paddingAngle={2}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}>
                              {dados.pizza.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>

                        /* BARRA simples */
                        ) : tipoGrafico === "barra" ? (
                          <BarChart data={dados.porDia} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend iconSize={10} />
                            <Bar dataKey="Separado" fill={COR.separado} stackId="a" />
                            <Bar dataKey="Parcial"  fill={COR.parcial}  stackId="a" />
                            <Bar dataKey="Não tem"  fill={COR.naoTem}   stackId="a" />
                            <Bar dataKey="Pendente" fill={COR.pendente} stackId="a" />
                          </BarChart>

                        /* BARRA 100% */
                        ) : tipoGrafico === "barra100" ? (
                          <BarChart data={dados.porDia} stackOffset="expand" barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                            <Legend iconSize={10} />
                            <Bar dataKey="Separado" fill={COR.separado} stackId="a" />
                            <Bar dataKey="Parcial"  fill={COR.parcial}  stackId="a" />
                            <Bar dataKey="Não tem"  fill={COR.naoTem}   stackId="a" />
                            <Bar dataKey="Pendente" fill={COR.pendente} stackId="a" />
                          </BarChart>

                        /* PARETO */
                        ) : tipoGrafico === "pareto" ? (
                          <ComposedChart data={dados.pareto}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="codigo" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" height={50} />
                            <YAxis yAxisId="esq" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="dir" orientation="right" domain={[0, 100]}
                              tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend iconSize={10} />
                            <Bar yAxisId="esq" dataKey="vezes" name="Ocorrências" fill="#8b5cf6" />
                            <Line yAxisId="dir" dataKey="cumulativo" name="% Acumulado"
                              stroke="#f97316" type="monotone" dot={false} strokeWidth={2} />
                          </ComposedChart>

                        /* LINHA */
                        ) : tipoGrafico === "linha" ? (
                          <LineChart data={dados.porDia}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend iconSize={10} />
                            <Line dataKey="Separado" stroke={COR.separado} strokeWidth={2} dot={{ r: 3 }} />
                            <Line dataKey="Parcial"  stroke={COR.parcial}  strokeWidth={2} dot={{ r: 3 }} />
                            <Line dataKey="Não tem"  stroke={COR.naoTem}   strokeWidth={2} dot={{ r: 3 }} />
                            <Line dataKey="Pendente" stroke={COR.pendente} strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>

                        /* UNIDADES — pedido vs real + % diferença */
                        ) : (
                          <ComposedChart data={dados.porDia}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="esq" tick={{ fontSize: 10 }} />
                            <YAxis yAxisId="dir" orientation="right" domain={[0, 100]}
                              tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                            <Tooltip
                              formatter={(value: number, name: string) =>
                                name === "% Diferença" ? [`${value}%`, name] : [value.toLocaleString("pt-BR"), name]
                              }
                            />
                            <Legend iconSize={10} />
                            <Bar yAxisId="esq" dataKey="Pedido" fill="#3b82f6" radius={[3,3,0,0]} />
                            <Bar yAxisId="esq" dataKey="Real"   fill="#22c55e" radius={[3,3,0,0]} />
                            <Line yAxisId="dir" dataKey="% Diferença" stroke="#ef4444"
                              type="monotone" strokeWidth={2} dot={{ r: 3 }} />
                          </ComposedChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Filtros de status */}
                <div className="flex gap-1 flex-wrap items-center">
                  <span className="text-xs text-muted-foreground mr-1">Status:</span>
                  {[
                    { key: "nao_tem",  label: "Não tem",  bg: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
                    { key: "parcial",  label: "Parcial",  bg: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
                    { key: "pendente", label: "Pendente", bg: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
                    { key: "separado", label: "Separado", bg: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300" },
                  ].map(({ key, label, bg }) => (
                    <button key={key}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-opacity ${filtroStatus.has(key) ? bg : "bg-muted text-muted-foreground opacity-40"}`}
                      onClick={() => toggleFiltroStatus(key)}>
                      {label}
                    </button>
                  ))}
                  <button
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ml-1 ${
                      filtroDuplicadas
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground border-border"
                    }`}
                    onClick={() => setFiltroDuplicadas((v) => !v)}>
                    Duplicadas
                  </button>
                </div>

                {/* Filtro por dia — só exibe quando há mais de 1 dia carregado */}
                {relatoriosPeriodo.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Dia:</span>
                    <select
                      className="text-xs border rounded px-2 py-0.5 bg-background"
                      value={filtroDia ?? ""}
                      onChange={(e) => setFiltroDia(e.target.value || null)}
                    >
                      <option value="">Todos os dias</option>
                      {relatoriosPeriodo
                        .slice()
                        .sort((a, b) => a.data.localeCompare(b.data))
                        .map((r) => (
                          <option key={r.data} value={r.data}>{dateKeyToPtBr(r.data)}</option>
                        ))}
                    </select>
                    {filtroDia && (
                      <button
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setFiltroDia(null)}>
                        limpar
                      </button>
                    )}
                  </div>
                )}

                {/* Filtros: busca por item, seção, ordenação */}
                {dados && (
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="text"
                      placeholder="Buscar código / SKU..."
                      value={filtroTexto}
                      onChange={(e) => setFiltroTexto(e.target.value)}
                      className="text-xs border rounded px-2 py-1 bg-background flex-1 min-w-[140px]"
                    />
                    <select
                      value={filtroSecao ?? ""}
                      onChange={(e) => setFiltroSecao(e.target.value || null)}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      <option value="">Todas as seções</option>
                      {secoesDisponiveis.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      value={ordenacao}
                      onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      <option value="mais-pedido">+ Pedido</option>
                      <option value="menos-pedido">− Pedido</option>
                      <option value="mais-saiu">+ Saiu</option>
                      <option value="menos-saiu">− Saiu</option>
                    </select>
                    {(filtroTexto || filtroSecao || ordenacao !== "mais-pedido") && (
                      <button
                        className="text-xs text-muted-foreground underline"
                        onClick={() => { setFiltroTexto(""); setFiltroSecao(null); setOrdenacao("mais-pedido"); }}
                      >
                        limpar
                      </button>
                    )}
                  </div>
                )}

                {/* Lista de itens com frequência */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                      <span>
                        Itens {relatoriosPeriodo.length > 1 ? `(${relatoriosPeriodo.length} dias)` : ""}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        <Button size="sm" variant={filtroItens === "criticos" ? "default" : "outline"}
                          className="h-6 text-xs px-2"
                          onClick={() => setFiltroItens("criticos")}>
                          Críticos ({dados.frequencia.filter(i => i.statusDominante === "nao_tem" || i.statusDominante === "parcial").length})
                        </Button>
                        <Button size="sm" variant={filtroItens === "todos" ? "default" : "outline"}
                          className="h-6 text-xs px-2"
                          onClick={() => setFiltroItens("todos")}>
                          Todos ({dados.frequencia.length})
                        </Button>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1"
                          disabled={carregandoFotosErp}
                          onClick={carregarFotosErp}>
                          {carregandoFotosErp
                            ? <><RefreshCw className="h-3 w-3 animate-spin" />{progressoFotos.atual}/{progressoFotos.total}</>
                            : <><ImageOff className="h-3 w-3" />Fotos ERP</>}
                        </Button>
                        <Button size="sm"
                          variant={Object.keys(statusComprasMap).length > 0 ? "default" : "outline"}
                          className="h-6 text-xs px-2 gap-1"
                          disabled={carregandoStatusCompras}
                          onClick={carregarStatusCompras}>
                          {carregandoStatusCompras
                            ? <><RefreshCw className="h-3 w-3 animate-spin" />Compras...</>
                            : "Status Compras"}
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {itensFiltrados.length === 0 && (
                      <p className="p-4 text-sm text-center text-muted-foreground">Nenhum item com o filtro selecionado</p>
                    )}
                    <div className="divide-y">
                      {itensPagina.map((item, i) => {
                        const idxGlobal = (paginaAtual - 1) * PAGE_SIZE + i;
                        const foto = item.photo || fotosErp[item.codigo] || null;
                        return (
                          <div key={item.codigo}
                            className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setItemModalIdx(idxGlobal)}>
                            {/* Foto */}
                            {foto ? (
                              <img src={foto} alt={item.codigo}
                                className="w-14 h-14 object-cover rounded shrink-0 mt-0.5" />
                            ) : (
                              <div className="w-14 h-14 bg-muted rounded flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-muted-foreground text-xs text-center leading-tight px-1">sem foto</span>
                              </div>
                            )}

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="font-mono font-bold text-sm leading-tight">{item.codigo}</p>
                              {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                              {item.secao && <p className="text-xs text-indigo-500">{item.secao}</p>}

                              {/* Dias de ocorrência */}
                              {relatoriosPeriodo.length > 1 && (
                                <div className="flex gap-1 flex-wrap mt-1">
                                  {item.diasOcorrencia.map((d) => (
                                    <span key={d} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                      {dateKeyToPtBr(d)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Quantidades + status + frequência */}
                            <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                              {relatoriosPeriodo.length > 1 && (
                                <span className="text-lg font-bold leading-none">{item.vezes}x</span>
                              )}
                              <Badge
                                variant={item.statusDominante === "nao_tem" ? "destructive" : item.statusDominante === "separado" ? "secondary" : "outline"}
                                className="text-xs">
                                {statusLabel(item.statusDominante)}
                              </Badge>
                              {statusComprasMap[item.codigo] && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-medium capitalize">
                                  {["to do", "a fazer"].includes(statusComprasMap[item.codigo].toLowerCase().trim())
                                    ? "Aguardando Análise"
                                    : statusComprasMap[item.codigo]}
                                </span>
                              )}
                              <div className="text-xs flex gap-2">
                                <span className="text-muted-foreground">
                                  Ped: <strong>{item.totalPedido}</strong>
                                </span>
                                <span className="text-muted-foreground">
                                  Real: <strong>{item.totalReal}</strong>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Paginação */}
                    {totalPaginas > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <span className="text-xs text-muted-foreground">
                          {(paginaAtual - 1) * PAGE_SIZE + 1}–{Math.min(paginaAtual * PAGE_SIZE, itensFiltrados.length)} de {itensFiltrados.length}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                            disabled={paginaAtual === 1}
                            onClick={() => setPaginaAtual((p) => p - 1)}>
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                            .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - paginaAtual) <= 1)
                            .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                              if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                              acc.push(p);
                              return acc;
                            }, [])
                            .map((p, idx) =>
                              p === "…" ? (
                                <span key={`e${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                              ) : (
                                <Button key={p} size="sm"
                                  variant={p === paginaAtual ? "default" : "outline"}
                                  className="h-7 w-7 p-0 text-xs"
                                  onClick={() => setPaginaAtual(p as number)}>
                                  {p}
                                </Button>
                              )
                            )}
                          <Button size="sm" variant="outline" className="h-7 w-7 p-0"
                            disabled={paginaAtual === totalPaginas}
                            onClick={() => setPaginaAtual((p) => p + 1)}>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── MODAL DE ITEM ── */}
      {itemModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setItemModalIdx(null)}
        >
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Foto */}
            <div className="relative bg-muted w-full aspect-square">
              {fotoModal ? (
                <img src={fotoModal} alt={itemModal.codigo} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                  sem foto
                </div>
              )}
              {/* Fechar */}
              <button
                className="absolute top-2 right-2 bg-background/80 rounded-full p-1 hover:bg-background"
                onClick={() => setItemModalIdx(null)}
              >
                <X className="h-4 w-4" />
              </button>
              {/* Contador */}
              <span className="absolute bottom-2 right-2 bg-background/80 text-xs px-2 py-0.5 rounded-full">
                {(itemModalIdx ?? 0) + 1} / {itensFiltrados.length}
              </span>
            </div>

            {/* Conteúdo */}
            <div className="p-4 space-y-3">
              {/* Codigo + status */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-mono font-bold text-lg leading-tight break-all">{itemModal.codigo}</p>
                <Badge
                  variant={itemModal.statusDominante === "nao_tem" ? "destructive" : itemModal.statusDominante === "separado" ? "secondary" : "outline"}
                  className="shrink-0 text-xs mt-0.5"
                >
                  {statusLabel(itemModal.statusDominante)}
                </Badge>
              </div>

              {itemModal.sku && (
                <p className="text-sm text-muted-foreground">SKU: {itemModal.sku}</p>
              )}
              {itemModal.secao && (
                <p className="text-sm text-indigo-500 font-medium">{itemModal.secao}</p>
              )}

              {/* Quantidades */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-2 text-center">
                  <p className="text-xl font-bold text-blue-600">{itemModal.totalPedido}</p>
                  <p className="text-xs text-muted-foreground">Pedido</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-2 text-center">
                  <p className="text-xl font-bold text-green-600">{itemModal.totalReal}</p>
                  <p className="text-xs text-muted-foreground">Real</p>
                </div>
                <div className="bg-muted rounded-lg p-2 text-center">
                  <p className="text-xl font-bold">
                    {itemModal.totalPedido > 0
                      ? `${(((itemModal.totalPedido - itemModal.totalReal) / itemModal.totalPedido) * 100).toFixed(0)}%`
                      : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">Dif.</p>
                </div>
              </div>

              {/* Ocorrências por dia */}
              {itemModal.ocorrencias.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">
                    {itemModal.vezes > 1 ? `${itemModal.vezes}x no período` : "Ocorrência"}
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {itemModal.ocorrencias.map((oc, j) => (
                      <div key={j} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">{dateKeyToPtBr(oc.data)}</span>
                        <span className="font-medium">{statusLabel(oc.status)}</span>
                        <span>Ped: {oc.pedido} | Real: {oc.real ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Navegação */}
            <div className="flex border-t">
              <button
                className="flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-30"
                disabled={itemModalIdx === 0}
                onClick={() => irPara((itemModalIdx ?? 0) - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> Anterior
              </button>
              <div className="w-px bg-border" />
              <button
                className="flex-1 flex items-center justify-center gap-1 py-3 text-sm font-medium hover:bg-muted/50 transition-colors disabled:opacity-30"
                disabled={itemModalIdx === itensFiltrados.length - 1}
                onClick={() => irPara((itemModalIdx ?? 0) + 1)}
              >
                Próximo <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
