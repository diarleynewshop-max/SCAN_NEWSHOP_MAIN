import { useEffect, useMemo, useRef, useState } from "react";
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
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  carregarItensDoPedido,
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
    <div className={`rounded-xl border px-3 py-2 ${props.classes}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
        {props.label}
      </div>
      <div className="mt-1 text-lg font-bold">{props.value}</div>
    </div>
  );
}

export default function MeusPedidos() {
  const { loginSalvo } = useAuth();
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
  const [itemModal, setItemModal] = useState<{ item: PedidoFilaItem; nomePedido: string } | null>(null);

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

  const empresa = loginSalvo?.empresa ?? "NEWSHOP";
  const flag = loginSalvo?.flag ?? "loja";

  const temFiltro = Boolean(produtoBusca || pessoaBusca || dataInicio || dataFim);

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-8">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              Pedidos concluidos
            </div>
            <h1 className="mt-2 text-2xl font-black text-foreground md:text-3xl">
              Todos os pedidos finalizados
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {empresa} | {flag.toUpperCase()} — filtre por produto, pessoa ou periodo.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void carregar(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Produto</span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={produtoBusca}
                onChange={(e) => setProdutoBusca(e.target.value)}
                placeholder="Codigo, nome ou SKU"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pessoa</span>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              <User className="h-4 w-4 text-muted-foreground" />
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Pedidos
            </div>
            <div className="mt-2 text-3xl font-black text-foreground">{stats.total}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Itens
            </div>
            <div className="mt-2 text-3xl font-black text-sky-700">{stats.itens}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Nao tem
            </div>
            <div className="mt-2 text-3xl font-black text-rose-700">{stats.naoTem}</div>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading && pedidos.length === 0 ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-4 w-full animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : pedidos.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-10 text-center shadow-sm md:col-span-2 xl:col-span-3">
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
            const aberto = expandido.has(pedido.id);
            const itens = itensPorPedido[pedido.id];
            const carregando = carregandoItens.has(pedido.id);

            return (
              <article key={pedido.id} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <User className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <h2 className="truncate text-lg font-black text-foreground">{nome}</h2>
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                        Concluido
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
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

                  <div className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      Itens
                    </div>
                    <div className="mt-1 text-2xl font-black text-foreground">{pedido.totalItens}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                  <div className="rounded-xl border border-border bg-background px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Conferente
                    </div>
                    <div className="mt-1 text-sm font-bold text-foreground">{pedido.conferente || "-"}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void toggleItens(pedido.id)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-accent"
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
                            className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2"
                          >
                            {foto ? (
                              <img
                                src={foto}
                                alt={descricao}
                                className="h-12 w-12 shrink-0 rounded-lg object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
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
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-xs text-muted-foreground">
                                Ped: <span className="font-bold text-foreground">{item.quantidadePedida}</span>
                                {item.quantidadeReal != null && ` · Real: ${item.quantidadeReal}`}
                              </div>
                              <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.classes}`}>
                                {st.label}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setItemModal({ item, nomePedido: nome })}
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
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent"
          >
            Carregar mais ({pedidos.length - visiveis} restantes)
          </button>
        </div>
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
      />
    </div>
  );
}
