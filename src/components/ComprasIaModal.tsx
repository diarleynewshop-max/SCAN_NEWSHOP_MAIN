import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileText,
  ImageOff,
  Loader2,
  PackageSearch,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { obterLoginSalvo } from "@/hooks/useAuth";
import {
  baixarComprasIaPdf,
  baixarComprasIaTxt,
  consultarComprasIa,
  MODELOS_COMPRAS_IA,
  MODELO_COMPRAS_IA_PADRAO,
  type ComprasIaModelo,
  type ComprasIaProduto,
  type ComprasIaRelatorio,
  type ComprasIaTipo,
  type ComprasIaTom,
} from "@/lib/comprasIa";

interface ComprasIaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  empresa: string;
  flag: string;
}

type Atalho = {
  tipo: Exclude<ComprasIaTipo, "pergunta">;
  titulo: string;
  descricao: string;
  Icon: ComponentType<{ className?: string }>;
};

const ATALHOS: Atalho[] = [
  { tipo: "resumo", titulo: "Resumo", descricao: "Visão executiva do período", Icon: BarChart3 },
  { tipo: "faltas", titulo: "Maiores faltas", descricao: "Pedido menos atendido", Icon: AlertTriangle },
  { tipo: "mais_pedidos", titulo: "Mais pedidos", descricao: "Ranking por quantidade", Icon: TrendingUp },
  { tipo: "prioridades", titulo: "Prioridades", descricao: "Fila para revisão humana", Icon: ClipboardList },
];

const TOM_METRICA: Record<ComprasIaTom, string> = {
  neutro: "border-slate-200 bg-slate-50 text-slate-900",
  positivo: "border-emerald-200 bg-emerald-50 text-emerald-900",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  critico: "border-rose-200 bg-rose-50 text-rose-900",
};

const PRIORIDADE: Record<ComprasIaProduto["prioridade"], { label: string; className: string }> = {
  alta: { label: "Alta", className: "border-rose-200 bg-rose-50 text-rose-700" },
  media: { label: "Média", className: "border-amber-200 bg-amber-50 text-amber-700" },
  baixa: { label: "Baixa", className: "border-slate-200 bg-slate-50 text-slate-600" },
  bloqueada: { label: "Não priorizar", className: "border-zinc-200 bg-zinc-100 text-zinc-600" },
};

function formatarNumero(value: number): string {
  return Math.round(value || 0).toLocaleString("pt-BR");
}

function formatarPercentual(value: number): string {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function mensagemErro(error: unknown): string {
  return error instanceof Error ? error.message : "Falha ao gerar análise.";
}

function nomeModelo(modelo: string | null | undefined): string {
  if (!modelo) return "Modelo automático";
  const encontrado = MODELOS_COMPRAS_IA.find((item) => item.id === modelo);
  return encontrado ? `${encontrado.nome} (${encontrado.provedor})` : modelo;
}

function CardProduto({ produto, posicao, modoRanking }: { produto: ComprasIaProduto; posicao: number; modoRanking: boolean }) {
  const prioridade = PRIORIDADE[produto.prioridade];
  const imagem = (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      {produto.fotoUrl ? (
        <img
          src={produto.fotoUrl}
          alt={produto.descricao}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      ) : (
        <ImageOff className="h-6 w-6 text-slate-300" />
      )}
    </div>
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        {produto.fotoUrl ? (
          <a href={produto.fotoUrl} target="_blank" rel="noreferrer" title="Abrir foto do produto">
            {imagem}
          </a>
        ) : imagem}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <span className="text-xs font-bold text-slate-400">#{posicao}</span>
            {modoRanking ? (
              <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                {formatarNumero(produto.ocorrencias)} vezes
              </Badge>
            ) : (
              <Badge variant="outline" className={prioridade.className}>{prioridade.label}</Badge>
            )}
          </div>
          <h4 className="line-clamp-2 text-sm font-bold leading-5 text-slate-900">{produto.descricao}</h4>
          <p className="mt-1 truncate text-xs text-slate-500">
            Cód. {produto.codigo}{produto.sku ? ` · SKU ${produto.sku}` : ""}
          </p>
          <p className="truncate text-xs text-slate-500">
            {produto.secao}{produto.empresas?.length ? ` | ${produto.empresas.join(", ")}` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-indigo-50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-indigo-600">Vezes</p>
          <p className="text-sm font-bold text-indigo-800">{formatarNumero(produto.ocorrencias)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Pedido</p>
          <p className="text-sm font-bold text-slate-900">{formatarNumero(produto.pedido)}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-emerald-600">{modoRanking ? "Média/vez" : "Atendido"}</p>
          <p className="text-sm font-bold text-emerald-800">
            {modoRanking
              ? (produto.ocorrencias > 0 ? (produto.pedido / produto.ocorrencias).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0")
              : formatarNumero(produto.atendido)}
          </p>
        </div>
        <div className="rounded-lg bg-rose-50 px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-rose-600">{modoRanking ? "Qtd. atendida" : "Falta"}</p>
          <p className="text-sm font-bold text-rose-800">{formatarNumero(modoRanking ? produto.atendido : produto.falta)}</p>
        </div>
      </div>
      {!modoRanking && <p className="mt-2 text-xs leading-5 text-slate-600">{produto.motivo}</p>}
      {!modoRanking && produto.status && (
        <Badge variant="outline" className="mt-2 border-blue-200 bg-blue-50 text-blue-700">
          {produto.status.replace(/_/g, " ")}
        </Badge>
      )}
    </article>
  );
}

function Resultado({ relatorio }: { relatorio: ComprasIaRelatorio }) {
  const maiorFaltaSecao = Math.max(1, ...relatorio.secoes.map((secao) => secao.falta));
  const modoRanking = relatorio.contexto.criterios?.estruturada === true;
  const mostrarProdutos = relatorio.contexto.mostrarProdutos ?? relatorio.contexto.visualizacao?.mostrarProdutos ?? true;
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black text-slate-950">{relatorio.titulo}</h3>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <ShieldCheck className="mr-1 h-3 w-3" /> Somente leitura
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{relatorio.resumo}</p>
            {relatorio.contexto.escopoEmpresas?.length ? (
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Escopo lido: {relatorio.contexto.escopoEmpresas.join(", ")}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-slate-400">
              {relatorio.contexto.inicio} a {relatorio.contexto.fim} · {relatorio.contexto.linhasLidas.toLocaleString("pt-BR")} linhas analisadas
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => baixarComprasIaTxt(relatorio)}>
              <FileText className="mr-2 h-4 w-4" /> TXT
            </Button>
            <Button variant="outline" size="sm" onClick={() => baixarComprasIaPdf(relatorio)}>
              <FileDown className="mr-2 h-4 w-4" /> PDF
            </Button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {relatorio.metricas.map((metrica) => (
          <article key={metrica.id} className={`rounded-2xl border p-4 ${TOM_METRICA[metrica.tom]}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-65">{metrica.label}</p>
            <p className="mt-1 text-2xl font-black">{metrica.valor}</p>
            <p className="mt-1 text-xs opacity-70">{metrica.detalhe}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-black text-indigo-950">
            <Sparkles className="h-4 w-4 text-indigo-600" /> Leitura do analista
          </div>
          <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">
            {relatorio.origemLeitura === "calculada" ? "Cálculo local" : "IA Trigger"}
          </Badge>
        </div>
        <div className="space-y-2 text-sm leading-6 text-slate-700">
          {relatorio.leitura.split(/\r?\n/).filter(Boolean).map((linha, index) => (
            <p key={`${index}-${linha.slice(0, 12)}`}>{linha}</p>
          ))}
        </div>
      </section>

      {relatorio.secoes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-slate-900">
            <BarChart3 className="h-4 w-4" /> Seções com maior falta
          </h3>
          <div className="space-y-3">
            {relatorio.secoes.map((secao, index) => (
              <div key={secao.nome}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-semibold text-slate-700">{index + 1}. {secao.nome}</span>
                  <span className="shrink-0 text-slate-500">Falta {formatarNumero(secao.falta)} · {formatarPercentual(secao.taxaAtendimento)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, (secao.falta / maiorFaltaSecao) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {mostrarProdutos && relatorio.produtos.length > 0 ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900">
            <PackageSearch className="h-4 w-4" /> Produtos do recorte
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {relatorio.produtos.map((produto, index) => (
              <CardProduto
                key={`${produto.codigo}-${produto.sku}-${index}`}
                produto={produto}
                posicao={index + 1}
                modoRanking={modoRanking}
              />
            ))}
          </div>
        </section>
      ) : mostrarProdutos ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Nenhum produto encontrado neste recorte.</p>
        </section>
      ) : null}

      {relatorio.contexto.avisos.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {relatorio.contexto.avisos.map((aviso) => <p key={aviso}>• {aviso}</p>)}
        </section>
      )}
    </div>
  );
}

export function ComprasIaModal({ open, onOpenChange, empresa, flag }: ComprasIaModalProps) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState<ComprasIaTipo>("resumo");
  const [periodoDias, setPeriodoDias] = useState("30");
  const [pergunta, setPergunta] = useState("");
  const [modelo, setModelo] = useState<ComprasIaModelo>(MODELO_COMPRAS_IA_PADRAO);
  const [ultimaPergunta, setUltimaPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [relatorio, setRelatorio] = useState<ComprasIaRelatorio | null>(null);
  const loginSalvo = useMemo(() => (open ? obterLoginSalvo() : null), [open]);

  useEffect(() => {
    if (!open) {
      setPergunta("");
      setTipo("resumo");
      setRelatorio(null);
      setUltimaPergunta("");
    }
  }, [open]);

  const analisar = async () => {
    const actorLogin = loginSalvo?.login?.trim() ?? "";
    if (!actorLogin) {
      toast({ title: "Sessão inválida", description: "Entre novamente no sistema.", variant: "destructive" });
      return;
    }
    if (tipo === "pergunta" && pergunta.trim().length < 3) {
      toast({ title: "Digite uma pergunta", description: "Informe o que deseja analisar.", variant: "destructive" });
      return;
    }

    setCarregando(true);
    setUltimaPergunta(pergunta.trim() || ATALHOS.find((atalho) => atalho.tipo === tipo)?.titulo || "Resumo");
    try {
      const resultado = await consultarComprasIa({
        pergunta: pergunta.trim(),
        tipo,
        periodoDias: Number(periodoDias),
        empresa,
        flag,
        actorLogin,
        modelo,
      });
      setRelatorio(resultado);
    } catch (error) {
      toast({ title: "Análise não gerada", description: mensagemErro(error), variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl p-0">
        <DialogHeader className="border-b border-slate-200 bg-white px-4 py-3 text-left sm:px-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-base font-black text-slate-950">IA de Compras</DialogTitle>
                <DialogDescription className="truncate text-xs text-slate-500">
                  {empresa} | {String(flag).toUpperCase()} | somente leitura
                </DialogDescription>
              </div>
            </div>
            <Badge variant="outline" className="hidden shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700 sm:inline-flex">
              <ShieldCheck className="mr-1 h-3 w-3" /> Super
            </Badge>
          </div>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-[#f7f7f8]">
          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
              <label className="block min-w-0">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Modelo</span>
                <select
                  value={modelo}
                  onChange={(event) => setModelo(event.target.value as ComprasIaModelo)}
                  disabled={carregando}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500 disabled:opacity-60"
                >
                  {MODELOS_COMPRAS_IA.map((item) => (
                    <option key={item.id} value={item.id}>{item.nome} - {item.provedor}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Período</span>
                <select
                  value={periodoDias}
                  onChange={(event) => setPeriodoDias(event.target.value)}
                  disabled={carregando}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-500 disabled:opacity-60"
                >
                  <option value="7">7 dias</option>
                  <option value="30">30 dias</option>
                  <option value="60">60 dias</option>
                  <option value="90">90 dias</option>
                  <option value="180">180 dias</option>
                </select>
              </label>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {!relatorio && !carregando && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white">
                      <Bot className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-950">Como posso ajudar em Compras?</p>
                      <p className="text-xs text-slate-500">Escolha um atalho ou digite uma pergunta.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {ATALHOS.map(({ tipo: atalhoTipo, titulo, descricao, Icon }) => (
                      <button
                        key={atalhoTipo}
                        type="button"
                        onClick={() => setTipo(atalhoTipo)}
                        className={`rounded-lg border p-3 text-left transition-colors ${tipo === atalhoTipo ? "border-slate-950 bg-slate-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                      >
                        <Icon className="mb-2 h-4 w-4 text-slate-700" />
                        <p className="text-sm font-bold text-slate-900">{titulo}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{descricao}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(ultimaPergunta || carregando || relatorio) && (
                <div className="flex justify-end">
                  <div className="max-w-[86%] rounded-2xl bg-slate-950 px-4 py-3 text-sm leading-6 text-white shadow-sm">
                    {ultimaPergunta || pergunta.trim() || ATALHOS.find((atalho) => atalho.tipo === tipo)?.titulo || "Resumo"}
                    <div className="mt-1 text-[11px] text-slate-300">{nomeModelo(modelo)}</div>
                  </div>
                </div>
              )}

              {carregando && (
                <div className="flex justify-start">
                  <div className="max-w-[86%] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <Loader2 className="h-4 w-4 animate-spin" /> Analisando Compras...
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Lendo dados reais e chamando {nomeModelo(modelo)}.</p>
                  </div>
                </div>
              )}

              {relatorio && !carregando && (
                <div className="flex justify-start">
                  <div className="w-full max-w-[96%] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                        <Sparkles className="h-4 w-4" /> Resposta da IA
                      </div>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                        {nomeModelo(relatorio.modeloLeitura || modelo)}
                      </Badge>
                    </div>
                    <Resultado relatorio={relatorio} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
            <div className="mx-auto max-w-4xl">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 shadow-sm focus-within:border-slate-500">
                <Textarea
                  value={pergunta}
                  onChange={(event) => {
                    setPergunta(event.target.value);
                    if (event.target.value.trim()) setTipo("pergunta");
                  }}
                  placeholder="Pergunte sobre faltas, mais pedidos, prioridades ou uma seção específica..."
                  className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  maxLength={500}
                  disabled={carregando}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void analisar();
                    }
                  }}
                />
                <Button size="icon" onClick={() => void analisar()} disabled={carregando} className="h-10 w-10 shrink-0 rounded-full bg-slate-950 hover:bg-slate-800">
                  {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="mt-2 text-center text-[11px] text-slate-400">IA de Compras pode errar. Confira estoque, venda e pedido aberto antes de comprar.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
