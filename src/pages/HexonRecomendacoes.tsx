import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImageOff, Loader2, PackageSearch, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { enviarListaParaConferencia } from "@/lib/pedidosFila";
import { buscarFotoProdutoVarejoFacil } from "@/lib/varejoFacilIntegration";
import { buscarReposicoesRecentes } from "@/lib/pedidosSupabase";

type Loja = "NEWSHOP" | "FACIL" | "SOYE";
type Recomendacao = {
  id: string;
  loteId: string;
  lote: string;
  externalRef: string | null;
  destino: string | null;
  loja: Loja | null;
  criadoEm: string | null;
  descricao: string;
  ean: string | null;
  externalItemRef?: string | null;
  quantidade: number;
  encontrado: boolean;
  fotoUrl?: string | null;
  origem?: "hexon" | "entrada_recente";
};

const GRUPOS_LOJA: Array<{ id: Loja | "SEM_LOJA"; label: string }> = [
  { id: "NEWSHOP", label: "NEWSHOP" },
  { id: "FACIL", label: "FACIL" },
  { id: "SOYE", label: "SOYE" },
  { id: "SEM_LOJA", label: "Sem loja identificada" },
];

function chaveItem(item: Recomendacao): string {
  return `${item.loja || item.destino || "SEM_LOJA"}:${item.id}`;
}

function dataLegivel(value: string | null): string {
  if (!value) return "Data nao informada";
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? value : data.toLocaleString("pt-BR");
}

export default function HexonRecomendacoes() {
  const [itens, setItens] = useState<Recomendacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usandoHistorico, setUsandoHistorico] = useState(false);
  const [pedidoRecomendacao, setPedidoRecomendacao] = useState<Recomendacao | null>(null);
  const [quantidadePedido, setQuantidadePedido] = useState(1);
  const [criandoPedido, setCriandoPedido] = useState(false);
  const { loginSalvo } = useAuth();
  const { toast } = useToast();
  const requisicaoRef = useRef(0);

  const abrirPedido = (item: Recomendacao) => {
    setQuantidadePedido(Math.max(1, Math.trunc(item.quantidade || 1)));
    setPedidoRecomendacao(item);
  };

  const confirmarPedido = async () => {
    if (!pedidoRecomendacao || criandoPedido) return;
    const loja = pedidoRecomendacao.loja;
    const codigo = pedidoRecomendacao.ean || pedidoRecomendacao.externalItemRef || "";
    const quantidade = Math.trunc(Number(quantidadePedido));
    const empresasPermitidas = loginSalvo?.empresasPermitidas?.length
      ? loginSalvo.empresasPermitidas
      : loginSalvo ? [loginSalvo.empresa] : [];

    if (!loginSalvo) {
      toast({ title: "Entre novamente", description: "Seu login não foi encontrado.", variant: "destructive" });
      return;
    }
    if (!loja || !empresasPermitidas.includes(loja)) {
      toast({ title: "Sem acesso à loja", description: "Você não tem permissão para criar pedido nessa loja.", variant: "destructive" });
      return;
    }
    if (!codigo) {
      toast({ title: "Código do item ausente", description: "Não foi possível identificar o produto para criar o pedido.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade < 1) {
      toast({ title: "Quantidade inválida", description: "Informe uma quantidade maior que zero.", variant: "destructive" });
      return;
    }

    setCriandoPedido(true);
    try {
      const resultado = await enviarListaParaConferencia({
        flag: "loja",
        empresa: loja,
        tipo: "reposicao",
        pessoa: loginSalvo.nomePessoa,
        titulo: `Reposição recomendada - ${pedidoRecomendacao.descricao}`,
        totalItens: 1,
        dataCriacao: new Date().toISOString(),
        conferenceId: `recomendacao-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        produtos: [{
          barcode: codigo,
          sku: "",
          quantidade,
          removeTag: false,
          photo: pedidoRecomendacao.fotoUrl || null,
          description: pedidoRecomendacao.descricao,
        }],
      });
      if (!resultado) throw new Error("Não foi possível salvar o pedido.");
      toast({
        title: "Pedido enviado para conferência",
        description: `${pedidoRecomendacao.descricao} · ${quantidade} un. · ${loja}`,
      });
      setPedidoRecomendacao(null);
    } catch (error) {
      toast({
        title: "Falha ao criar pedido",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCriandoPedido(false);
    }
  };

  const carregarFotos = useCallback((lista: Recomendacao[], requisicao: number) => {
    const porLojaECodigo = new Map<string, { empresa: Loja; codigo: string; itens: Recomendacao[] }>();
    for (const item of lista) {
      const codigo = item.ean || item.externalItemRef || "";
      if (item.fotoUrl) continue;
      if (!codigo || !item.loja) continue;
      const chave = `${item.loja}:${codigo}`;
      const existente = porLojaECodigo.get(chave);
      if (existente) existente.itens.push(item);
      else porLojaECodigo.set(chave, { empresa: item.loja, codigo, itens: [item] });
    }

    const fila = [...porLojaECodigo.values()];
    let proximo = 0;
    void Promise.all(Array.from({ length: Math.min(4, fila.length) }, async () => {
      while (proximo < fila.length) {
        const atual = fila[proximo++];
        try {
          const fotoUrl = await buscarFotoProdutoVarejoFacil(atual.codigo, { empresa: atual.empresa });
          if (requisicao !== requisicaoRef.current || !fotoUrl) continue;
          const chaves = new Set(atual.itens.map(chaveItem));
          setItens((anteriores) => anteriores.map((item) =>
            chaves.has(chaveItem(item)) ? { ...item, fotoUrl } : item
          ));
        } catch (error) {
          console.warn("[hexon-recomendacoes] Falha ao buscar foto no ERP", {
            empresa: atual.empresa,
            codigo: atual.codigo,
            erro: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }));
  }, []);

  const carregar = useCallback(async () => {
    const requisicao = ++requisicaoRef.current;
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/hexon-recomendacoes", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Falha ao consultar Hexon (${response.status}).`);
      if (requisicao !== requisicaoRef.current) return;
      const resultado = Array.isArray(body?.result) ? body.result as Recomendacao[] : [];
      if (resultado.length > 0) {
        setItens(resultado.map((item) => ({ ...item, origem: "hexon" })));
        setUsandoHistorico(false);
        carregarFotos(resultado, requisicao);
      } else {
        const recentes = await buscarReposicoesRecentes();
        if (requisicao !== requisicaoRef.current) return;
        const reposicoes: Recomendacao[] = recentes.map((item) => ({
          id: item.id,
          loteId: item.pedidoId,
          lote: "Reposição registrada na conferência",
          externalRef: item.pedidoId,
          destino: item.empresa,
          loja: item.empresa as Loja,
          criadoEm: item.dataConferencia,
          descricao: item.descricao,
          ean: item.codigo,
          externalItemRef: item.sku,
          quantidade: item.quantidade,
          encontrado: true,
          fotoUrl: item.fotoUrl,
          origem: "entrada_recente",
        }));
        setItens(reposicoes);
        setUsandoHistorico(true);
        carregarFotos(reposicoes, requisicao);
      }
    } catch (error) {
      if (requisicao === requisicaoRef.current) {
        setErro(error instanceof Error ? error.message : "Nao foi possivel carregar as recomendacoes.");
      }
    } finally {
      if (requisicao === requisicaoRef.current) setCarregando(false);
    }
  }, [carregarFotos]);

  useEffect(() => { void carregar(); }, [carregar]);

  const grupos = useMemo(() => {
    const lojasConhecidas = new Set<Loja>(["NEWSHOP", "FACIL", "SOYE"]);
    return GRUPOS_LOJA.map((grupo) => ({
      ...grupo,
      itens: itens.filter((item) => grupo.id === "SEM_LOJA"
        ? !item.loja || !lojasConhecidas.has(item.loja)
        : item.loja === grupo.id),
    })).filter((grupo) => grupo.itens.length > 0);
  }, [itens]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <Dialog open={Boolean(pedidoRecomendacao)} onOpenChange={(aberto) => { if (!aberto && !criandoPedido) setPedidoRecomendacao(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fazer pedido</DialogTitle>
            <DialogDescription>
              {pedidoRecomendacao?.descricao} · {pedidoRecomendacao?.loja || "Loja não identificada"}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm font-medium" htmlFor="quantidade-recomendacao">
            Quantidade
            <Input
              id="quantidade-recomendacao"
              type="number"
              min={1}
              step={1}
              value={quantidadePedido}
              onChange={(event) => setQuantidadePedido(Number(event.target.value))}
              autoFocus
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPedidoRecomendacao(null)} disabled={criandoPedido}>Cancelar</Button>
            <Button onClick={() => void confirmarPedido()} disabled={criandoPedido || !pedidoRecomendacao?.loja}>
              {criandoPedido ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
              {criandoPedido ? "Enviando..." : "Criar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recomendacoes Hexon</h1>
          <p className="mt-1 text-sm text-muted-foreground">Reposições recentes separadas por loja.</p>
        </div>
        <Button onClick={() => void carregar()} disabled={carregando} variant="outline" className="gap-2">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </header>

      {erro && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>}

      {carregando && itens.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando reposicoes no Hexon...
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <PackageSearch className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-semibold">Nenhuma reposicao pendente</p>
          <p className="mt-1 text-sm text-muted-foreground">Somente itens marcados como reposicao aparecem aqui.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {grupos.map((grupo) => (
            <section key={grupo.id} aria-label={`Recomendacoes para ${grupo.label}`} className="space-y-3">
              <header className="flex items-center gap-2 border-b pb-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h2 className="font-bold">{grupo.label}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{grupo.itens.length} itens</span>
              </header>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grupo.itens.map((item) => (
                  <article key={chaveItem(item)} className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
                    {item.fotoUrl ? (
                      <div className="flex h-44 shrink-0 items-center justify-center bg-muted/50 p-2">
                        <img
                          src={item.fotoUrl}
                          alt={item.descricao}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain"
                          onError={() => setItens((anteriores) => anteriores.map((atual) =>
                            chaveItem(atual) === chaveItem(item) ? { ...atual, fotoUrl: null } : atual
                          ))}
                        />
                      </div>
                    ) : (
                      <div className="flex h-44 shrink-0 items-center justify-center bg-muted/50 text-muted-foreground">
                        <ImageOff className="h-8 w-8" aria-label="Foto indisponivel" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Reposição</span>
                          <h3 className="mt-2 line-clamp-2 min-h-10 break-words font-semibold leading-5" title={item.descricao}>{item.descricao}</h3>
                        </div>
                        <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold">Qtd. {item.quantidade}</span>
                      </div>
                      <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex min-w-0 gap-1"><dt className="shrink-0 font-medium text-foreground">EAN:</dt><dd className="min-w-0 truncate" title={item.ean || "Não informado"}>{item.ean || "Não informado"}</dd></div>
                        <div className="flex min-w-0 gap-1"><dt className="shrink-0 font-medium text-foreground">Lote:</dt><dd className="min-w-0 truncate" title={item.lote}>{item.lote}</dd></div>
                        <div className="flex min-w-0 gap-1"><dt className="shrink-0 font-medium text-foreground">{item.origem === "entrada_recente" ? "Conferência:" : "Recebido:"}</dt><dd className="min-w-0 truncate" title={dataLegivel(item.criadoEm)}>{dataLegivel(item.criadoEm)}</dd></div>
                        {!item.encontrado && <div className="pt-1 font-semibold text-destructive">Item nao localizado na separacao.</div>}
                      </dl>
                      <div className="mt-auto pt-4">
                        <Button className="w-full" size="sm" onClick={() => abrirPedido(item)} disabled={!item.loja}>
                          <ShoppingCart /> Fazer pedido
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {usandoHistorico
          ? "Sem reposições pendentes no Hexon. Exibindo itens encontrados nas conferências das lojas nos últimos 14 dias; esses itens são enviados ao Hexon como reposição."
          : "Exibindo somente itens marcados como reposição no Hexon. Fotos carregam do cadastro do ERP quando o produto é localizado."}
      </p>
    </main>
  );
}
