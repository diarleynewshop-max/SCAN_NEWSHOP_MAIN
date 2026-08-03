import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  MoreVertical,
  Package,
  PackageCheck,
  RefreshCw,
  Search,
  ScanBarcode,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  carregarItensDoPedido,
  formatarTituloPedido,
  listarPedidos,
  type MeuPedidoResumo,
  type PedidoFilaItem,
} from "@/lib/pedidosFila";
import {
  buscarCatalogoItens,
  produtoKey,
  type CatalogoItemInfo,
} from "@/lib/comprasSupabase";
import { ItemPedidoModal } from "@/components/ItemPedidoModal";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";
import {
  listarRecomendacoesPendentesPorDestinatario,
  responderRecomendacaoSubstituicao,
  type RecomendacaoSubstituicao,
} from "@/lib/recomendacoesSubstituicao";

const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));

const SCANNER_FALLBACK = (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 text-sm font-semibold text-white">
    Abrindo scanner...
  </div>
);

const ITEM_STATUS_META: Record<string, { label: string; classes: string }> = {
  separado: { label: "Separado", classes: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  nao_tem: { label: "Nao tem", classes: "border-rose-200 bg-rose-50 text-rose-700" },
  nao_tem_tudo: { label: "Parcial", classes: "border-amber-200 bg-amber-50 text-amber-700" },
  pendente: { label: "Pendente", classes: "border-slate-200 bg-slate-50 text-slate-600" },
};

function itemStatusMeta(status: string) {
  return ITEM_STATUS_META[status] ?? ITEM_STATUS_META.pendente;
}

// Nome de quem fez o pedido: prioriza pessoa/listeiro; nas conferencias antigas
// (migradas) so existe o conferente, entao ele e o fallback.
function nomePessoaPedido(pedido: MeuPedidoResumo): string {
  return (
    String(pedido.pessoa ?? "").trim() ||
    String(pedido.listeiro ?? "").trim() ||
    String(pedido.conferente ?? "").trim() ||
    String(pedido.titulo ?? "").trim() ||
    "Sem nome"
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function ResumoChip(props: { label: string; value: number; classes: string }) {
  return (
    <div className={`rounded-lg border px-2 py-2 sm:rounded-xl sm:px-3 ${props.classes}`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em] opacity-80 sm:text-[11px] sm:tracking-[0.14em]">
        {props.label}
      </div>
      <div className="mt-1 text-base font-bold sm:text-lg">{props.value}</div>
    </div>
  );
}

export default function MeusPedidos() {
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const [pedidos, setPedidos] = useState<MeuPedidoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carregamentoRef = useRef(0);
  const carregarRef = useRef<(silent?: boolean) => Promise<void>>(async () => undefined);

  // Filtros da tela
  const [produtoBusca, setProdutoBusca] = useState("");
  const [pessoaBusca, setPessoaBusca] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [scannerAberto, setScannerAberto] = useState(false);

  // Render incremental: todos os pedidos ficam carregados/filtraveis, mas so
  // renderizamos um lote por vez (concluidos podem passar de 1000).
  const LOTE = 60;
  const [visiveis, setVisiveis] = useState(LOTE);

  // Itens de cada pedido, carregados sob demanda ao expandir o card.
  const [expandido, setExpandido] = useState<Set<string>>(new Set());
  const [itensPorPedido, setItensPorPedido] = useState<Record<string, PedidoFilaItem[]>>({});
  const [carregandoItens, setCarregandoItens] = useState<Set<string>>(new Set());
  // Catalogo (foto + vezes_pedido + status de compra) por produto_key, compartilhado.
  const [catalogo, setCatalogo] = useState<Record<string, CatalogoItemInfo>>({});
  // Item aberto no modal de tela cheia.
  const [itemModal, setItemModal] = useState<{
    item: PedidoFilaItem;
    pedidoId: string;
    nomePedido: string;
  } | null>(null);
  const [recomendacoesPendentes, setRecomendacoesPendentes] = useState<RecomendacaoSubstituicao[]>([]);
  const [popupRecomendacaoAberto, setPopupRecomendacaoAberto] = useState(false);
  const [respondendoRecomendacaoId, setRespondendoRecomendacaoId] = useState<string | null>(null);

  const toggleItens = async (pedidoId: string) => {
    const abrindo = !expandido.has(pedidoId);
    setExpandido((prev) => {
      const next = new Set(prev);
      if (abrindo) next.add(pedidoId);
      else next.delete(pedidoId);
      return next;
    });

    if (!abrindo || itensPorPedido[pedidoId]) return;

    setCarregandoItens((prev) => new Set(prev).add(pedidoId));
    try {
      const itens = await carregarItensDoPedido(pedidoId);
      setItensPorPedido((prev) => ({ ...prev, [pedidoId]: itens }));

      // Enriquece com foto + info de Compras (as fotos nao ficam em pedido_itens).
      const keys = itens.map((it) => produtoKey(it.codigo, it.sku)).filter(Boolean);
      const info = await buscarCatalogoItens(empresa, keys);
      if (info.size > 0) {
        setCatalogo((prev) => {
          const next = { ...prev };
          info.forEach((valor, chave) => { next[chave] = valor; });
          return next;
        });
      }
    } catch (err) {
      console.error("[MeusPedidos] Falha ao carregar itens do pedido:", err);
      setItensPorPedido((prev) => ({ ...prev, [pedidoId]: [] }));
    } finally {
      setCarregandoItens((prev) => {
        const next = new Set(prev);
        next.delete(pedidoId);
        return next;
      });
    }
  };

  const navegarItemModal = (direcao: -1 | 1) => {
    setItemModal((atual) => {
      if (!atual) return null;
      const itens = itensPorPedido[atual.pedidoId] ?? [];
      if (itens.length < 2) return atual;
      const indiceAtual = itens.findIndex((item) => item.id === atual.item.id);
      const proximoIndice = (Math.max(indiceAtual, 0) + direcao + itens.length) % itens.length;
      return { ...atual, item: itens[proximoIndice] };
    });
  };

  const empresa = loginSalvo?.empresa ?? "NEWSHOP";
  const flag = loginSalvo?.flag ?? "loja";

  const temFiltro = Boolean(produtoBusca || pessoaBusca || dataInicio || dataFim);

  const carregarRecomendacoesPendentes = async () => {
    if (!loginSalvo?.nomePessoa || !isSupabaseConfigured) {
      setRecomendacoesPendentes([]);
      return;
    }

    try {
      const data = await listarRecomendacoesPendentesPorDestinatario(empresa, flag, loginSalvo.nomePessoa);
      setRecomendacoesPendentes(data);
    } catch (err) {
      console.error("[MeusPedidos] Falha ao carregar recomendacoes:", err);
    }
  };

  const carregar = async (silent = false) => {
    const requestId = ++carregamentoRef.current;

    if (!loginSalvo) {
      setPedidos([]);
      setError("Login nao encontrado.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!isSupabaseConfigured) {
      setPedidos([]);
      setError("Supabase nao configurado neste ambiente.");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      // Todos os pedidos CONCLUIDOS (o antigo "complete" do ClickUp), de todas as
      // pessoas, filtraveis por produto / pessoa / periodo.
      const data = await listarPedidos({
        empresa,
        flag,
        status: "concluido",
        produtoBusca: produtoBusca.trim(),
        pessoaBusca: pessoaBusca.trim(),
        dataInicio,
        dataFim,
      });
      if (requestId !== carregamentoRef.current) return;
      setPedidos(data);
      setError(null);
    } catch (err) {
      if (requestId !== carregamentoRef.current) return;
      console.error("[MeusPedidos] Falha ao listar pedidos:", err);
      setError("Nao foi possivel carregar os pedidos agora.");
    } finally {
      if (requestId === carregamentoRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  carregarRef.current = carregar;

  // Recarrega quando muda empresa/flag ou os filtros (com debounce leve nos filtros).
  useEffect(() => {
    const t = setTimeout(() => {
      void carregar();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, flag, loginSalvo, produtoBusca, pessoaBusca, dataInicio, dataFim]);

  useEffect(() => {
    if (!loginSalvo || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`pedidos-concluidos:${empresa}:${flag}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `empresa=eq.${empresa}` },
        () => {
          void carregarRef.current(true);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [empresa, flag, loginSalvo]);

  useEffect(() => {
    void carregarRecomendacoesPendentes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, flag, loginSalvo?.nomePessoa]);

  useEffect(() => {
    if (!loginSalvo?.nomePessoa || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`recomendacoes-destinatario:${empresa}:${flag}:${loginSalvo.nomePessoa}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recomendacoes_substituicao",
          filter: `empresa=eq.${empresa}`,
        },
        () => {
          void carregarRecomendacoesPendentes();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [empresa, flag, loginSalvo?.nomePessoa]);

  useEffect(() => {
    if (recomendacoesPendentes.length === 0) {
      setPopupRecomendacaoAberto(false);
      return;
    }

    const t = setTimeout(() => {
      setPopupRecomendacaoAberto(true);
    }, 5000);
    return () => clearTimeout(t);
  }, [recomendacoesPendentes.length]);

  const stats = useMemo(
    () => ({
      total: pedidos.length,
      itens: pedidos.reduce((acc, p) => acc + (p.totalItens || 0), 0),
      naoTem: pedidos.reduce((acc, p) => acc + (p.resumoNaoTem || 0), 0),
    }),
    [pedidos]
  );

  // Volta pro primeiro lote sempre que a lista muda (novo filtro/refresh).
  useEffect(() => {
    setVisiveis(LOTE);
  }, [pedidos]);

  const limparFiltros = () => {
    setProdutoBusca("");
    setPessoaBusca("");
    setDataInicio("");
    setDataFim("");
  };

  const aplicarCodigoEscaneado = (codigo: string) => {
    const code = codigo.trim();
    setScannerAberto(false);
    if (!code) return;
    setProdutoBusca(code);
    setVisiveis(LOTE);
    toast({ title: "Codigo escaneado", description: code });
  };

  const responderRecomendacao = async (
    recomendacao: RecomendacaoSubstituicao,
    decisao: "aceita" | "recusada"
  ) => {
    if (!loginSalvo?.nomePessoa) return;

    setRespondendoRecomendacaoId(recomendacao.id);
    try {
      await responderRecomendacaoSubstituicao(recomendacao.id, decisao, loginSalvo.nomePessoa);
      setRecomendacoesPendentes((prev) => prev.filter((item) => item.id !== recomendacao.id));
      toast({
        title: decisao === "aceita" ? "Troca aprovada" : "Troca recusada",
        description: `${recomendacao.codigoOriginal} -> ${recomendacao.codigoSugerido}`,
      });
    } catch (err) {
      toast({
        title: "Falha ao responder recomendacao",
        description: err instanceof Error ? err.message : "Nao foi possivel responder agora.",
        variant: "destructive",
      });
    } finally {
      setRespondendoRecomendacaoId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-2 pb-8 sm:gap-4 sm:px-0">
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:text-xs sm:tracking-[0.2em]">
              <ClipboardList className="h-4 w-4" />
              Pedidos concluidos
            </div>
            <h1 className="mt-1.5 text-xl font-black text-foreground sm:mt-2 sm:text-2xl md:text-3xl">
              Todos os pedidos finalizados
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground sm:mt-2 sm:text-sm">
              {empresa} | {flag.toUpperCase()} — filtre por produto, pessoa ou periodo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void carregar(true)}
            disabled={loading || refreshing}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {recomendacoesPendentes.length > 0 && (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 sm:mt-4 sm:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                  Recomendacao interna
                </div>
                <div className="mt-1 text-sm font-bold text-amber-950">
                  Voce tem {recomendacoesPendentes.length} troca(s) pendente(s) para aprovar ou recusar.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPopupRecomendacaoAberto(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-bold text-white"
              >
                Ver recomendacoes
              </button>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="mt-3 grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Produto</span>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={produtoBusca}
                  onChange={(e) => setProdutoBusca(e.target.value)}
                  placeholder="Codigo, nome ou SKU"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerAberto(true)}
                className="inline-flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition active:scale-[0.98] sm:w-auto sm:px-4"
                aria-label="Escanear codigo de barras"
                title="Escanear codigo de barras"
              >
                <ScanBarcode className="h-5 w-5" />
                <span className="ml-2 hidden text-sm font-bold sm:inline">Scan</span>
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pessoa</span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={pessoaBusca}
                onChange={(e) => setPessoaBusca(e.target.value)}
                placeholder="Nome do listeiro/pessoa"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">De</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Ate</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
            />
          </label>
        </div>

        {temFiltro && (
          <button
            type="button"
            onClick={limparFiltros}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-accent"
          >
            <X className="h-3.5 w-3.5" />
            Limpar filtros
          </button>
        )}

        <div className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:gap-3">
          <div className="rounded-xl border border-border bg-background px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">
              Pedidos
            </div>
            <div className="mt-1 text-2xl font-black text-foreground sm:mt-2 sm:text-3xl">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">
              Itens
            </div>
            <div className="mt-1 text-2xl font-black text-sky-700 sm:mt-2 sm:text-3xl">{stats.itens}</div>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2 sm:rounded-2xl sm:px-4 sm:py-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">
              Nao tem
            </div>
            <div className="mt-1 text-2xl font-black text-rose-700 sm:mt-2 sm:text-3xl">{stats.naoTem}</div>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </section>
      )}

      <section className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading && pedidos.length === 0 ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:rounded-3xl sm:p-5">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : pedidos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-8 text-center shadow-sm sm:rounded-3xl sm:px-6 sm:py-10 md:col-span-2 xl:col-span-3">
            <PackageCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-bold text-foreground">Nenhum pedido encontrado</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {temFiltro
                ? "Nenhum pedido concluido bate com os filtros aplicados."
                : "Ainda nao ha pedidos concluidos para esta empresa."}
            </p>
          </div>
        ) : (
          pedidos.slice(0, visiveis).map((pedido) => {
            const nome = nomePessoaPedido(pedido);
            const tituloPedido = formatarTituloPedido(pedido.titulo || nome, pedido.numeroPedido);
            const aberto = expandido.has(pedido.id);
            const itens = itensPorPedido[pedido.id];
            const carregando = carregandoItens.has(pedido.id);

            return (
              <article key={pedido.id} className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:rounded-3xl sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <User className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" />
                      <h2 className="max-w-[calc(100vw-9rem)] truncate text-base font-black text-foreground sm:max-w-none sm:text-lg">{tituloPedido}</h2>
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 sm:px-3 sm:py-1 sm:text-xs">
                        Concluido
                      </span>
                    </div>

                    <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground sm:mt-3 sm:gap-2 sm:text-sm">
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4" />
                        Criado em {formatDateTime(pedido.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Conferido em {formatDateTime(pedido.dataConferencia)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-xl border border-border bg-background px-3 py-2 text-sm sm:rounded-2xl sm:px-4 sm:py-3">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.16em]">
                      Itens
                    </div>
                    <div className="mt-1 text-xl font-black text-foreground sm:text-2xl">{pedido.totalItens}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-4 sm:grid-cols-3 sm:gap-3">
                  <ResumoChip
                    label="Separado"
                    value={pedido.resumoSeparado}
                    classes="border-emerald-200 bg-emerald-50 text-emerald-800"
                  />
                  <ResumoChip
                    label="Nao tem"
                    value={pedido.resumoNaoTem}
                    classes="border-rose-200 bg-rose-50 text-rose-800"
                  />
                  <ResumoChip
                    label="Parcial"
                    value={pedido.resumoParcial}
                    classes="border-amber-200 bg-amber-50 text-amber-800"
                  />
                  <ResumoChip
                    label="Pendente"
                    value={pedido.resumoPendente}
                    classes="border-slate-200 bg-slate-50 text-slate-800"
                  />
                  <div className="col-span-4 rounded-lg border border-border bg-background px-2 py-2 sm:col-span-1 sm:rounded-xl sm:px-3">
                    <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:text-[11px] sm:tracking-[0.14em]">
                      Conferente
                    </div>
                    <div className="mt-1 text-sm font-bold text-foreground">{pedido.conferente || "-"}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void toggleItens(pedido.id)}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition hover:bg-accent sm:mt-4"
                >
                  <Package className="h-4 w-4" />
                  {aberto ? "Ocultar itens" : `Ver itens (${pedido.totalItens})`}
                  {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {aberto && (
                  <div className="mt-3 space-y-2">
                    {carregando && !itens ? (
                      <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                        Carregando itens...
                      </div>
                    ) : itens && itens.length > 0 ? (
                      itens.map((item) => {
                        const st = itemStatusMeta(item.status);
                        const info = catalogo[produtoKey(item.codigo, item.sku)];
                        const foto = item.photo || info?.fotoUrl || null;
                        const descricao = item.descricao || info?.descricao || item.sku || item.codigo;
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 rounded-xl border border-border bg-background px-2 py-2 sm:items-center sm:gap-3 sm:px-3"
                          >
                            {foto ? (
                              <img
                                src={foto}
                                alt={descricao}
                                className="h-14 w-14 shrink-0 rounded-lg object-cover sm:h-12 sm:w-12"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground sm:h-12 sm:w-12">
                                sem foto
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-foreground">
                                {descricao}
                              </div>
                              <div className="truncate font-mono text-xs text-muted-foreground">
                                {item.codigo}
                                {item.sku ? ` · ${item.sku}` : ""}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 sm:hidden">
                                <span className="text-xs text-muted-foreground">
                                  Ped: <span className="font-bold text-foreground">{item.quantidadePedida}</span>
                                  {item.quantidadeReal != null && ` | Real: ${item.quantidadeReal}`}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.classes}`}>
                                  {st.label}
                                </span>
                              </div>
                            </div>
                            <div className="hidden shrink-0 text-right sm:block">
                              <div className="text-xs text-muted-foreground">
                                Ped: <span className="font-bold text-foreground">{item.quantidadePedida}</span>
                                {item.quantidadeReal != null && ` | Real: ${item.quantidadeReal}`}
                              </div>
                              <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.classes}`}>
                                {st.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setItemModal({ item, pedidoId: pedido.id, nomePedido: nome })}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent"
                              aria-label="Mais informacoes do item"
                              title="Mais informacoes"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-xl border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
                        Este pedido nao tem itens gravados.
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>

      {pedidos.length > visiveis && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setVisiveis((v) => v + LOTE)}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent sm:w-auto"
          >
            Carregar mais ({pedidos.length - visiveis} restantes)
          </button>
        </div>
      )}

      {scannerAberto && (
        <Suspense fallback={SCANNER_FALLBACK}>
          <BarcodeScanner onDetected={aplicarCodigoEscaneado} onClose={() => setScannerAberto(false)} />
        </Suspense>
      )}

      <ItemPedidoModal
        item={itemModal?.item ?? null}
        info={itemModal ? catalogo[produtoKey(itemModal.item.codigo, itemModal.item.sku)] ?? null : null}
        nomePedido={itemModal?.nomePedido ?? ""}
        fotoUrl={
          itemModal
            ? itemModal.item.photo || catalogo[produtoKey(itemModal.item.codigo, itemModal.item.sku)]?.fotoUrl || null
            : null
        }
        onClose={() => setItemModal(null)}
        onPrevious={() => navegarItemModal(-1)}
        onNext={() => navegarItemModal(1)}
        currentPosition={
          itemModal
            ? Math.max(
                1,
                (itensPorPedido[itemModal.pedidoId] ?? []).findIndex((item) => item.id === itemModal.item.id) + 1
              )
            : 0
        }
        totalItems={itemModal ? (itensPorPedido[itemModal.pedidoId] ?? []).length : 0}
      />

      {popupRecomendacaoAberto && recomendacoesPendentes.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPopupRecomendacaoAberto(false)}
        >
          <div
            className="w-full max-w-3xl rounded-3xl border border-border bg-card p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Recomendacao de item
                </div>
                <h2 className="mt-1 text-2xl font-black text-foreground">
                  Pendencias para decidir
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPopupRecomendacaoAberto(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {recomendacoesPendentes.map((item) => (
                <article key={item.id} className="rounded-2xl border border-border bg-background p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start">
                    <div className="flex-1">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Pedido
                      </div>
                      <div className="mt-1 text-sm font-bold text-foreground">
                        {item.pedidoPessoa || item.destinatario}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Recomendado por {item.sugeridoPor}
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700">
                            Original
                          </div>
                          <div className="mt-2 text-sm font-bold text-rose-950">{item.codigoOriginal}</div>
                          <div className="mt-1 text-xs text-rose-800">
                            {item.descricaoOriginal || item.skuOriginal || "-"}
                          </div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Sugerido
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-950">{item.codigoSugerido}</div>
                          <div className="mt-1 text-xs text-emerald-800">
                            {item.descricaoSugerida || item.skuSugerido || "-"}
                          </div>
                          <div className="mt-1 text-xs text-emerald-800">
                            Quantidade sugerida: {item.quantidadeSugerida}
                          </div>
                        </div>
                      </div>
                      {item.observacao && (
                        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                          {item.observacao}
                        </div>
                      )}
                    </div>

                    <div className="flex w-full gap-2 md:w-52 md:flex-col">
                      <button
                        type="button"
                        onClick={() => void responderRecomendacao(item, "aceita")}
                        disabled={respondendoRecomendacaoId === item.id}
                        className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                      >
                        Aprovar troca
                      </button>
                      <button
                        type="button"
                        onClick={() => void responderRecomendacao(item, "recusada")}
                        disabled={respondendoRecomendacaoId === item.id}
                        className="flex-1 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800 disabled:opacity-60"
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
