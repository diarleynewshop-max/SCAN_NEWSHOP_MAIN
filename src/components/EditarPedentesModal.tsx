import { useEffect, useState } from "react";
import { X, Trash2, Pencil, Search, Layers, RefreshCw, ArrowLeft, CheckSquare, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  listarTasksPendentes,
  editarPendente,
  excluirPendente,
  juntarPendentes,
  analisarPendentes,
  aplicarAnalisePendentes,
  type EmpresaKey,
  type FlagKey,
  type PendenteTask,
  type PendenteItem,
  type AnaliseResultado,
} from "@/lib/clickupApi";

interface EditarPedentesModalProps {
  empresa: EmpresaKey;
  flag: FlagKey;
  onClose: () => void;
  onChanged: () => void;
}

type Tela = "lista" | "editor" | "analise";

function dateKeyParaPtBr(dateKey: string | null): string {
  if (!dateKey) return "-";
  const [ano, mes, dia] = dateKey.split("-");
  return `${dia}/${mes}/${ano}`;
}

const EditarPedentesModal = ({ empresa, flag, onClose, onChanged }: EditarPedentesModalProps) => {
  const { toast } = useToast();
  const [tela, setTela] = useState<Tela>("lista");
  const [pendentes, setPendentes] = useState<PendenteTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [processando, setProcessando] = useState(false);
  const [houveAlteracao, setHouveAlteracao] = useState(false);

  const [taskEditando, setTaskEditando] = useState<PendenteTask | null>(null);
  const [itensEditando, setItensEditando] = useState<PendenteItem[]>([]);

  const [analiseTaskIds, setAnaliseTaskIds] = useState<string[]>([]);
  const [analiseItemCodigos, setAnaliseItemCodigos] = useState<Record<string, string[]> | undefined>(undefined);
  const [analiseResultados, setAnaliseResultados] = useState<AnaliseResultado[] | null>(null);
  const [analiseLoading, setAnaliseLoading] = useState(false);
  const [analiseErro, setAnaliseErro] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const lista = await listarTasksPendentes(empresa, flag);
      setPendentes(lista);
      setSelecionadas(new Set());
    } catch (e: any) {
      setErro(e.message ?? "Erro ao buscar listas pendentes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tela !== "analise" || analiseTaskIds.length === 0) return;
    const carregarAnalise = async () => {
      setAnaliseLoading(true);
      setAnaliseErro(null);
      setAnaliseResultados(null);
      try {
        const resultados = await analisarPendentes(empresa, flag, analiseTaskIds, analiseItemCodigos);
        setAnaliseResultados(resultados);
      } catch (e: any) {
        setAnaliseErro(e.message ?? "Erro ao analisar listas pendentes");
      } finally {
        setAnaliseLoading(false);
      }
    };
    carregarAnalise();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tela, analiseTaskIds, analiseItemCodigos]);

  const fecharModal = () => {
    if (houveAlteracao) onChanged();
    onClose();
  };

  const toggleSelecionada = (id: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const todasSelecionadas = pendentes.length > 0 && selecionadas.size === pendentes.length;

  const alternarSelecionarTodas = () => {
    setSelecionadas((prev) => (prev.size === pendentes.length ? new Set() : new Set(pendentes.map((p) => p.id))));
  };

  const abrirEditor = (task: PendenteTask) => {
    setTaskEditando(task);
    setItensEditando(task.itens.map((item) => ({ ...item })));
    setTela("editor");
  };

  const excluirLista = async (task: PendenteTask) => {
    if (!confirm(`Excluir a lista pendente "${task.name}"?`)) return;
    setProcessando(true);
    try {
      await excluirPendente(empresa, task.id);
      setHouveAlteracao(true);
      toast({ title: "Lista excluida" });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao excluir lista", description: e.message, variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  const juntarSelecionadas = async () => {
    const taskIds = Array.from(selecionadas);
    if (taskIds.length < 2) return;
    if (!confirm(`Juntar ${taskIds.length} listas em uma so? As listas originais serao excluidas.`)) return;
    setProcessando(true);
    try {
      const resultado = await juntarPendentes(empresa, taskIds);
      setHouveAlteracao(true);
      toast({ title: "Listas unificadas", description: `${resultado.created.name} (${resultado.created.totalItens} item(ns))` });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao juntar listas", description: e.message, variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  const analisarSelecionadas = () => {
    const taskIds = Array.from(selecionadas);
    if (taskIds.length === 0) return;
    setAnaliseTaskIds(taskIds);
    setAnaliseItemCodigos(undefined);
    setAnaliseResultados(null);
    setTela("analise");
  };

  const analisarItemUnico = (task: PendenteTask, item: PendenteItem) => {
    setAnaliseTaskIds([task.id]);
    setAnaliseItemCodigos({ [task.id]: [item.codigo] });
    setAnaliseResultados(null);
    setTela("analise");
  };

  // ── Editor de itens ────────────────────────────────────────────────────────

  const atualizarItem = (idx: number, campo: keyof PendenteItem, valor: string) => {
    setItensEditando((prev) => {
      const next = [...prev];
      const item = { ...next[idx] };
      if (campo === "quantidadePedida") {
        item.quantidadePedida = Number(valor.replace(/\D/g, "")) || 0;
      } else if (campo === "codigo") {
        item.codigo = valor;
      } else if (campo === "sku") {
        item.sku = valor;
      }
      next[idx] = item;
      return next;
    });
  };

  const removerItem = (idx: number) => {
    setItensEditando((prev) => prev.filter((_, i) => i !== idx));
  };

  const salvarEdicao = async () => {
    if (!taskEditando) return;

    const itensValidos = itensEditando.filter((item) => item.codigo.trim() && item.quantidadePedida > 0);

    if (itensValidos.length === 0) {
      if (!confirm("Todos os itens foram removidos. A lista pendente sera excluida. Continuar?")) return;
    }

    setProcessando(true);
    try {
      const resultado = await editarPendente(empresa, taskEditando.id, itensValidos);
      setHouveAlteracao(true);
      if (resultado.deleted) {
        toast({ title: "Lista excluida (sem itens)" });
      } else {
        toast({ title: "Lista atualizada", description: `${resultado.totalItens} item(ns)` });
      }
      setTaskEditando(null);
      setTela("lista");
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  // ── Analise ────────────────────────────────────────────────────────────────

  const aplicarExclusaoEncontrados = async () => {
    if (!analiseResultados) return;
    const resultados = analiseResultados
      .filter((r) => r.encontrados.length > 0)
      .map((r) => ({ taskId: r.taskId, codigosParaRemover: r.encontrados.map((e) => e.codigo) }));

    if (resultados.length === 0) return;
    if (!confirm("Excluir os itens localizados das listas pendentes?")) return;

    setProcessando(true);
    try {
      const processados = await aplicarAnalisePendentes(empresa, resultados);
      setHouveAlteracao(true);
      const excluidas = processados.filter((p) => p.deleted).length;
      const atualizadas = processados.filter((p) => !p.deleted).length;
      toast({
        title: "Analise aplicada",
        description: `${excluidas} lista(s) excluida(s), ${atualizadas} lista(s) atualizada(s)`,
      });
      setAnaliseResultados(null);
      setTela("lista");
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao aplicar analise", description: e.message, variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 p-3 md:p-6 overflow-auto">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-4">
          <div>
            <p className="text-lg font-black text-foreground">Editar Pedentes</p>
            <p className="text-xs text-muted-foreground">
              {tela === "lista" && "Gerencie as listas de itens pendentes"}
              {tela === "editor" && taskEditando?.name}
              {tela === "analise" && "Cruzamento com pedidos concluidos"}
            </p>
          </div>
          <button onClick={fecharModal} className="h-8 px-3 rounded-lg bg-muted text-muted-foreground text-xs font-bold flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Fechar
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* ── Tela: Lista de pendentes ───────────────────────────────────── */}
          {tela === "lista" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{pendentes.length} lista(s) pendente(s)</p>
                <div className="flex items-center gap-3">
                  {pendentes.length > 0 && (
                    <button onClick={alternarSelecionarTodas} className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      {todasSelecionadas ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      {todasSelecionadas ? "Desmarcar tudo" : "Selecionar tudo"}
                    </button>
                  )}
                  <button onClick={carregar} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
                  </button>
                </div>
              </div>

              {selecionadas.size > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2">
                  <span className="text-xs font-semibold text-foreground flex-1">{selecionadas.size} selecionada(s)</span>
                  <button
                    onClick={juntarSelecionadas}
                    disabled={processando || selecionadas.size < 2}
                    className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Layers className="w-3.5 h-3.5" /> Juntar listas
                  </button>
                  <button
                    onClick={analisarSelecionadas}
                    disabled={processando}
                    className="h-8 px-3 rounded-lg bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Search className="w-3.5 h-3.5" /> Analisar
                  </button>
                </div>
              )}

              {loading && (
                <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                  <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Buscando listas...</span>
                </div>
              )}

              {erro && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">{erro}</div>}

              {!loading && !erro && pendentes.length === 0 && (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Nenhuma lista pendente encontrada.
                </div>
              )}

              <div className="space-y-2 max-h-[60vh] overflow-auto">
                {pendentes.map((task) => (
                  <div key={task.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selecionadas.has(task.id)}
                        onChange={() => toggleSelecionada(task.id)}
                        className="mt-1 w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{task.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {task.dataFormatada || "sem data"} · {task.conferente}
                          {task.listeiro ? ` · ${task.listeiro}` : ""} · {task.totalItens} item(ns)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirEditor(task)}
                        disabled={processando}
                        className="h-8 px-3 rounded-lg bg-muted text-foreground text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => excluirLista(task)}
                        disabled={processando}
                        className="h-8 px-3 rounded-lg bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Tela: Editor de itens ──────────────────────────────────────── */}
          {tela === "editor" && taskEditando && (
            <>
              <button onClick={() => setTela("lista")} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>

              <div className="space-y-2 max-h-[55vh] overflow-auto">
                {itensEditando.map((item, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-muted-foreground">Codigo de barras</label>
                        <input
                          value={item.codigo}
                          onChange={(e) => atualizarItem(idx, "codigo", e.target.value)}
                          className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-muted-foreground">Pedido</label>
                        <input
                          value={String(item.quantidadePedida)}
                          onChange={(e) => atualizarItem(idx, "quantidadePedida", e.target.value)}
                          inputMode="numeric"
                          className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-muted-foreground">Nome / SKU</label>
                      <input
                        value={item.sku}
                        onChange={(e) => atualizarItem(idx, "sku", e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-background px-2 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => analisarItemUnico(taskEditando, item)}
                        className="h-8 px-3 rounded-lg bg-muted text-foreground text-xs font-bold flex items-center gap-1.5"
                      >
                        <Search className="w-3.5 h-3.5" /> Analisar este item
                      </button>
                      <button
                        onClick={() => removerItem(idx)}
                        className="h-8 px-3 rounded-lg bg-destructive/10 text-destructive text-xs font-bold flex items-center gap-1.5 ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remover
                      </button>
                    </div>
                  </div>
                ))}

                {itensEditando.length === 0 && (
                  <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Nenhum item restante. Salvar ira excluir esta lista.
                  </div>
                )}
              </div>

              <button
                onClick={salvarEdicao}
                disabled={processando}
                className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-60"
              >
                {processando ? "Salvando..." : "Salvar"}
              </button>
            </>
          )}

          {/* ── Tela: Analise ───────────────────────────────────────────────── */}
          {tela === "analise" && (
            <>
              <button onClick={() => { setTela("lista"); setAnaliseResultados(null); }} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar
              </button>

              {analiseLoading && (
                <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                  <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Analisando listas concluidas...</span>
                </div>
              )}

              {analiseErro && <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-sm text-destructive">{analiseErro}</div>}

              {!analiseLoading && analiseResultados && (
                <>
                  <div className="space-y-2 max-h-[55vh] overflow-auto">
                    {analiseResultados.map((resultado) => (
                      <div key={resultado.taskId} className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <p className="text-sm font-bold text-foreground">
                          {resultado.taskName} — {dateKeyParaPtBr(resultado.dateKey)}
                        </p>

                        {resultado.encontrados.length === 0 && (
                          <p className="text-xs text-muted-foreground">0 item(ns) localizado(s) em concluidas.</p>
                        )}

                        {resultado.encontrados.length > 0 && resultado.encontrados.length === resultado.totalItens && (
                          <p className="text-xs font-semibold text-[hsl(var(--success))]">
                            Todos os {resultado.totalItens} item(ns) foram localizados em concluidas.
                          </p>
                        )}

                        {resultado.encontrados.length > 0 && resultado.encontrados.length < resultado.totalItens && (
                          <p className="text-xs font-semibold text-amber-600">
                            {resultado.encontrados.length} de {resultado.totalItens} item(ns) localizado(s) em concluidas.
                          </p>
                        )}

                        {resultado.encontrados.map((item) => (
                          <div key={item.codigo} className="text-xs text-foreground bg-muted/40 rounded-lg p-2">
                            <span className="font-semibold">{item.sku || item.codigo}</span> foi encontrado na lista concluida do dia{" "}
                            <span className="font-semibold">{dateKeyParaPtBr(item.encontradoEm.dateKey)}</span> ({item.encontradoEm.taskName}).
                            <br />
                            Qtd pedida: {item.quantidadePedida} · Qtd enviada: {item.quantidadeReal ?? "-"}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {analiseResultados.some((r) => r.encontrados.length > 0) && (
                    <button
                      onClick={aplicarExclusaoEncontrados}
                      disabled={processando}
                      className="w-full h-11 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-60"
                    >
                      {processando ? "Aplicando..." : "Excluir itens localizados das listas pendentes"}
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditarPedentesModal;
