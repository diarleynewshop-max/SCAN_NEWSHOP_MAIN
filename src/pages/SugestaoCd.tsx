import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Barcode,
  Boxes,
  CheckCircle2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import BarcodeInput from "@/components/BarcodeInput";
import { obterLoginSalvo } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  buscarEstoquesConferenciaVarejoFacil,
  buscarProdutoVarejoFacil,
} from "@/lib/varejoFacilIntegration";
import {
  gerarListaConferenciaSugestaoCd,
  listarSugestaoCdItens,
  removerSugestaoCdItem,
  subscribeSugestaoCdItens,
  type SugestaoCdEmpresa,
  type SugestaoCdItem,
  upsertSugestaoCdItem,
} from "@/lib/sugestaoCdSupabase";

const BarcodeScanner = lazy(() => import("@/components/BarcodeScanner"));

function formatarSecao(secao: string | null | undefined): string {
  const limpa = String(secao ?? "").trim();
  return limpa || "Sem secao";
}

function toInt(value: string | number | null | undefined, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.trunc(num));
}

export default function SugestaoCd() {
  const login = obterLoginSalvo();
  const { toast } = useToast();
  const empresa = (login?.empresa ?? "NEWSHOP") as SugestaoCdEmpresa;
  const nomePessoa = login?.nomePessoa?.trim() || login?.login?.trim() || "Sem nome";

  const [codigo, setCodigo] = useState("");
  const [scannerAberto, setScannerAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [salvandoCodigo, setSalvandoCodigo] = useState(false);
  const [gerandoLista, setGerandoLista] = useState(false);
  const [filtroSecao, setFiltroSecao] = useState("todos");
  const [itens, setItens] = useState<SugestaoCdItem[]>([]);
  const [editandoDesejadaId, setEditandoDesejadaId] = useState<string | null>(null);
  const [valorDesejada, setValorDesejada] = useState("1");
  const [ajustandoId, setAjustandoId] = useState<string | null>(null);
  const [draftContada, setDraftContada] = useState<Record<string, string>>({});
  const carregouRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const aplicarItemLocal = useCallback((itemAtualizado: SugestaoCdItem) => {
    setItens((prev) => {
      const semDuplicado = prev.filter(
        (item) => item.id !== itemAtualizado.id && item.produtoKey !== itemAtualizado.produtoKey
      );
      return [itemAtualizado, ...semDuplicado];
    });
  }, []);

  const atualizarItemLocal = useCallback((id: string, patch: Partial<SugestaoCdItem>) => {
    setItens((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const carregar = useCallback(async (silencioso = false) => {
    const usarRefreshSilencioso = silencioso || carregouRef.current;
    if (usarRefreshSilencioso) setAtualizando(true);
    else setLoading(true);

    try {
      setItens(await listarSugestaoCdItens(empresa));
    } catch (err) {
      toast({
        title: "Erro ao carregar",
        description: err instanceof Error ? err.message : "Nao foi possivel carregar a sugestao do CD.",
        variant: "destructive",
      });
    } finally {
      carregouRef.current = true;
      setLoading(false);
      setAtualizando(false);
    }
  }, [empresa, toast]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    return subscribeSugestaoCdItens(empresa, () => {
      if (refreshTimerRef.current != null) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        void carregar(true);
      }, 350);
    });
  }, [carregar, empresa]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const secoes = useMemo(
    () => ["todos", ...new Set(itens.map((item) => formatarSecao(item.secao)).sort((a, b) => a.localeCompare(b)))],
    [itens]
  );

  const itensFiltrados = useMemo(() => {
    if (filtroSecao === "todos") return itens;
    return itens.filter((item) => formatarSecao(item.secao) === filtroSecao);
  }, [filtroSecao, itens]);

  const itensProntos = useMemo(() => itens.filter((item) => (item.qtdDesejada ?? 0) > 0), [itens]);
  const totalDesejado = useMemo(
    () => itensProntos.reduce((acc, item) => acc + (item.qtdDesejada ?? 0), 0),
    [itensProntos]
  );

  const adicionarCodigo = useCallback(async (codigoInformado = codigo) => {
    const codigoLimpo = codigoInformado.trim();
    if (!codigoLimpo) {
      toast({ title: "Informe o codigo", description: "Digite ou escaneie um codigo." });
      return;
    }

    setSalvandoCodigo(true);
    setCodigo(codigoLimpo);
    try {
      const [produto, estoques] = await Promise.all([
        buscarProdutoVarejoFacil(codigoLimpo, { empresa, flag: "cd" }),
        buscarEstoquesConferenciaVarejoFacil(codigoLimpo, { empresa, flag: "cd" }),
      ]);

      if (!produto) {
        toast({ title: "Produto nao encontrado", description: "O ERP nao retornou esse codigo.", variant: "destructive" });
        return;
      }

      const loja = estoques.find((item) => item.loja === "Loja")?.quantidade ?? 0;
      const cd = estoques.find((item) => item.loja === "CD")?.quantidade ?? 0;
      const deposito = estoques.find((item) => item.loja === "Deposito")?.quantidade ?? 0;

      const salvo = await upsertSugestaoCdItem({
        empresa,
        codigo: produto.codigo_barras || codigoLimpo,
        descricao: produto.descricao,
        secao: produto.secao ?? null,
        fotoUrl: produto.imagem ?? null,
        qtdErpLoja: loja,
        qtdErpCd: cd,
        qtdErpDeposito: deposito,
        qtdContadaDelta: 1,
        createdBy: nomePessoa,
      });

      aplicarItemLocal(salvo);
      setCodigo("");
      toast({ title: "Item adicionado", description: `${produto.descricao || produto.codigo_barras} entrou na sugestao do CD.` });
    } catch (err) {
      toast({
        title: "Falha ao consultar ERP",
        description: err instanceof Error ? err.message : "Nao foi possivel adicionar o item.",
        variant: "destructive",
      });
    } finally {
      setSalvandoCodigo(false);
    }
  }, [aplicarItemLocal, codigo, empresa, nomePessoa, toast]);

  const atualizarContada = useCallback(async (item: SugestaoCdItem, novaQtd: number) => {
    const qtdContada = toInt(novaQtd, item.qtdContada);
    if (qtdContada === item.qtdContada) {
      setDraftContada((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }

    setAjustandoId(item.id);
    atualizarItemLocal(item.id, { qtdContada });
    setDraftContada((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    try {
      const salvo = await upsertSugestaoCdItem({
        empresa: item.empresa,
        codigo: item.codigo,
        sku: item.sku,
        descricao: item.descricao,
        secao: item.secao,
        fotoUrl: item.fotoUrl,
        qtdErpLoja: item.qtdErpLoja,
        qtdErpCd: item.qtdErpCd,
        qtdErpDeposito: item.qtdErpDeposito,
        qtdContada,
        qtdDesejada: item.qtdDesejada,
        createdBy: item.createdBy ?? nomePessoa,
      });
      aplicarItemLocal(salvo);
    } catch (err) {
      atualizarItemLocal(item.id, { qtdContada: item.qtdContada });
      toast({
        title: "Falha ao salvar",
        description: err instanceof Error ? err.message : "Nao foi possivel atualizar a quantidade contada.",
        variant: "destructive",
      });
    } finally {
      setAjustandoId(null);
    }
  }, [aplicarItemLocal, atualizarItemLocal, nomePessoa, toast]);

  const confirmarDraftContada = useCallback((item: SugestaoCdItem) => {
    const valor = draftContada[item.id];
    if (valor == null) return;
    void atualizarContada(item, toInt(valor, item.qtdContada));
  }, [atualizarContada, draftContada]);

  const abrirQuero = useCallback((item: SugestaoCdItem) => {
    setEditandoDesejadaId(item.id);
    setValorDesejada(String(item.qtdDesejada ?? item.qtdContada ?? 1));
  }, []);

  const confirmarQuero = useCallback(async (item: SugestaoCdItem) => {
    const qtdDesejada = toInt(valorDesejada, 0);
    if (qtdDesejada <= 0) {
      toast({ title: "Quantidade desejada invalida", description: "Preencha uma quantidade maior que zero.", variant: "destructive" });
      return;
    }

    setAjustandoId(item.id);
    atualizarItemLocal(item.id, { qtdDesejada });
    try {
      const salvo = await upsertSugestaoCdItem({
        empresa: item.empresa,
        codigo: item.codigo,
        sku: item.sku,
        descricao: item.descricao,
        secao: item.secao,
        fotoUrl: item.fotoUrl,
        qtdErpLoja: item.qtdErpLoja,
        qtdErpCd: item.qtdErpCd,
        qtdErpDeposito: item.qtdErpDeposito,
        qtdContada: item.qtdContada,
        qtdDesejada,
        createdBy: item.createdBy ?? nomePessoa,
      });
      aplicarItemLocal(salvo);
      setEditandoDesejadaId(null);
      setValorDesejada("1");
      toast({ title: "Marcado como quero", description: `Quantidade desejada: ${qtdDesejada}.` });
    } catch (err) {
      atualizarItemLocal(item.id, { qtdDesejada: item.qtdDesejada });
      toast({
        title: "Falha ao salvar",
        description: err instanceof Error ? err.message : "Nao foi possivel salvar a quantidade desejada.",
        variant: "destructive",
      });
    } finally {
      setAjustandoId(null);
    }
  }, [aplicarItemLocal, atualizarItemLocal, nomePessoa, toast, valorDesejada]);

  const naoQuero = useCallback(async (item: SugestaoCdItem) => {
    setAjustandoId(item.id);
    setItens((prev) => prev.filter((atual) => atual.id !== item.id));
    try {
      await removerSugestaoCdItem(item.id);
      toast({ title: "Removido", description: `${item.codigo} saiu da sugestao.` });
    } catch (err) {
      aplicarItemLocal(item);
      toast({
        title: "Falha ao remover",
        description: err instanceof Error ? err.message : "Nao foi possivel remover o item.",
        variant: "destructive",
      });
    } finally {
      setAjustandoId(null);
    }
  }, [aplicarItemLocal, toast]);

  const gerarLista = useCallback(async () => {
    if (itensProntos.length === 0) {
      toast({ title: "Nada para enviar", description: "Preencha ao menos um item em Quero.", variant: "destructive" });
      return;
    }

    setGerandoLista(true);
    try {
      const resultado = await gerarListaConferenciaSugestaoCd({
        empresa,
        pessoa: nomePessoa,
        itens: itensProntos,
      });
      toast({
        title: "Lista gerada",
        description: `${resultado.totalItens} item(ns) enviados para a conferencia da loja.`,
      });
    } catch (err) {
      toast({
        title: "Falha ao gerar lista",
        description: err instanceof Error ? err.message : "Nao foi possivel gerar a lista de conferencia.",
        variant: "destructive",
      });
    } finally {
      setGerandoLista(false);
    }
  }, [empresa, itensProntos, nomePessoa, toast]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Gestao</p>
              <h1 className="mt-1 text-2xl font-black text-foreground">Sugestao do CD</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Escaneie os itens do estoque, compare ERP x contado e monte a lista para mandar para a loja.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResumoBox label="Itens" valor={String(itens.length)} />
              <ResumoBox label="Filtrados" valor={String(itensFiltrados.length)} />
              <ResumoBox label="Quero" valor={String(itensProntos.length)} />
              <ResumoBox label="Qtd desejada" valor={String(totalDesejado)} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Barcode className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Adicionar item</h2>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px_220px_180px_190px]">
            <BarcodeInput
              value={codigo}
              onChange={setCodigo}
              onScanPress={() => setScannerAberto(true)}
              onEnterPress={() => void adicionarCodigo()}
            />

            <button
              onClick={() => void adicionarCodigo()}
              disabled={salvandoCodigo || !codigo.trim()}
              className="h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {salvandoCodigo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </span>
            </button>

            <select
              value={filtroSecao}
              onChange={(event) => setFiltroSecao(event.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            >
              {secoes.map((secao) => (
                <option key={secao} value={secao}>
                  {secao === "todos" ? "Todas as secoes" : secao}
                </option>
              ))}
            </select>

            <button
              onClick={() => void carregar()}
              disabled={loading || atualizando}
              className="h-12 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground hover:bg-accent disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${loading || atualizando ? "animate-spin" : ""}`} />
                Atualizar
              </span>
            </button>

            <button
              onClick={() => void gerarLista()}
              disabled={gerandoLista || itensProntos.length === 0}
              className="h-12 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              <span className="inline-flex items-center gap-2">
                {gerandoLista ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Gerar lista ({itensProntos.length})
              </span>
            </button>
          </div>

          {salvandoCodigo && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
              Consultando ERP e adicionando item...
            </div>
          )}

          {atualizando && !loading && (
            <div className="rounded-2xl border border-border bg-muted/40 px-4 py-2 text-xs font-bold text-muted-foreground">
              Atualizando em segundo plano...
            </div>
          )}
        </section>

        <section className="space-y-4">
          {loading ? (
            <div className="rounded-3xl border border-border bg-card p-10 text-center text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />
              Carregando sugestoes...
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card p-10 text-center">
              <Boxes className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-base font-bold text-foreground">Nenhum item na sugestao</p>
              <p className="mt-1 text-sm text-muted-foreground">Escaneie um produto do CD para começar.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {itensFiltrados.map((item) => {
                const totalErp = item.qtdErpLoja + item.qtdErpCd + item.qtdErpDeposito;
                const editando = editandoDesejadaId === item.id;
                const busy = ajustandoId === item.id;
                const valorContada = draftContada[item.id] ?? String(item.qtdContada);

                return (
                  <article key={item.id} className={`rounded-3xl border bg-card p-4 shadow-sm ${busy ? "border-primary/30" : "border-border"}`}>
                    <div className="flex gap-4">
                      {item.fotoUrl ? (
                        <img src={item.fotoUrl} alt={item.codigo} className="h-24 w-24 rounded-2xl object-cover border border-border" />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-border bg-muted/40">
                          <Package className="h-8 w-8 text-muted-foreground/50" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                          {formatarSecao(item.secao)}
                        </p>
                        <h3 className="mt-1 line-clamp-2 text-base font-black text-foreground">
                          {item.descricao || item.codigo}
                        </h3>
                        <p className="mt-2 text-sm font-mono text-muted-foreground">{item.codigo}</p>
                        {item.qtdDesejada ? (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Quero {item.qtdDesejada}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <InfoBloco titulo="ERP total" valor={String(totalErp)} destaque />
                      <InfoBloco titulo="Contado" valor={String(item.qtdContada)} />
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <InfoBloco titulo="Loja" valor={String(item.qtdErpLoja)} pequeno />
                      <InfoBloco titulo="CD" valor={String(item.qtdErpCd)} pequeno />
                      <InfoBloco titulo="Deposito" valor={String(item.qtdErpDeposito)} pequeno />
                    </div>

                    <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-3">
                      <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Quantidade contada</p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => void atualizarContada(item, Math.max(0, toInt(valorContada, item.qtdContada) - 1))}
                          disabled={busy}
                          className="h-10 w-10 rounded-xl border border-border bg-background text-lg font-black text-foreground disabled:opacity-50"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={valorContada}
                          onChange={(event) => {
                            const valor = event.target.value;
                            setDraftContada((prev) => ({ ...prev, [item.id]: valor }));
                          }}
                          onBlur={() => confirmarDraftContada(item)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              event.currentTarget.blur();
                            }
                            if (event.key === "Escape") {
                              setDraftContada((prev) => {
                                const next = { ...prev };
                                delete next[item.id];
                                return next;
                              });
                              event.currentTarget.blur();
                            }
                          }}
                          className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-center text-base font-black text-foreground"
                        />
                        <button
                          onClick={() => void atualizarContada(item, toInt(valorContada, item.qtdContada) + 1)}
                          disabled={busy}
                          className="h-10 w-10 rounded-xl border border-border bg-background text-lg font-black text-foreground disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {editando && (
                      <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-3">
                        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-primary/80">Quantidade desejada para a loja</p>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            value={valorDesejada}
                            onChange={(event) => setValorDesejada(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void confirmarQuero(item);
                              }
                              if (event.key === "Escape") {
                                setEditandoDesejadaId(null);
                                setValorDesejada("1");
                              }
                            }}
                            className="h-11 flex-1 rounded-xl border border-primary/20 bg-background px-3 text-center text-base font-black text-foreground"
                          />
                          <button
                            onClick={() => void confirmarQuero(item)}
                            disabled={busy}
                            className="h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => abrirQuero(item)}
                        disabled={busy}
                        className="h-11 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
                      >
                        Quero
                      </button>
                      <button
                        onClick={() => void naoQuero(item)}
                        disabled={busy}
                        className="h-11 rounded-xl border border-destructive/30 bg-destructive/10 text-sm font-bold text-destructive disabled:opacity-60"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Trash2 className="h-4 w-4" />
                          Nao quero
                        </span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {scannerAberto && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-background p-6 text-sm">Carregando scanner...</div>}>
          <BarcodeScanner
            onDetected={(valor) => {
              setScannerAberto(false);
              setCodigo(valor);
              void adicionarCodigo(valor);
            }}
            onClose={() => setScannerAberto(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

function ResumoBox({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-black text-foreground">{valor}</p>
    </div>
  );
}

function InfoBloco({
  titulo,
  valor,
  destaque = false,
  pequeno = false,
}: {
  titulo: string;
  valor: string;
  destaque?: boolean;
  pequeno?: boolean;
}) {
  return (
    <div className={`rounded-2xl border px-3 py-3 ${destaque ? "border-primary/20 bg-primary/5" : "border-border bg-background"}`}>
      <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{titulo}</p>
      <p className={`mt-1 font-black text-foreground ${pequeno ? "text-lg" : "text-2xl"}`}>{valor}</p>
    </div>
  );
}
