import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ImageOff, Loader2, PackageSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buscarFotoProdutoVarejoFacil } from "@/lib/varejoFacilIntegration";

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
  const requisicaoRef = useRef(0);

  const carregarFotos = useCallback((lista: Recomendacao[], requisicao: number) => {
    const porLojaECodigo = new Map<string, { empresa: Loja; codigo: string; itens: Recomendacao[] }>();
    for (const item of lista) {
      const codigo = item.ean || item.externalItemRef || "";
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
      setItens(resultado);
      carregarFotos(resultado, requisicao);
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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recomendacoes Hexon</h1>
          <p className="mt-1 text-sm text-muted-foreground">Somente itens de reposicao, separados por loja.</p>
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
                  <article key={chaveItem(item)} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                    {item.fotoUrl ? (
                      <img
                        src={item.fotoUrl}
                        alt={item.descricao}
                        loading="lazy"
                        className="h-44 w-full bg-muted object-contain p-2"
                        onError={() => setItens((anteriores) => anteriores.map((atual) =>
                          chaveItem(atual) === chaveItem(item) ? { ...atual, fotoUrl: null } : atual
                        ))}
                      />
                    ) : (
                      <div className="flex h-44 items-center justify-center bg-muted/50 text-muted-foreground">
                        <ImageOff className="h-8 w-8" aria-label="Foto indisponivel" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">Reposicao</span>
                          <h3 className="mt-2 break-words font-semibold">{item.descricao}</h3>
                        </div>
                        <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold">Qtd. {item.quantidade}</span>
                      </div>
                      <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div><dt className="inline font-medium text-foreground">EAN: </dt><dd className="inline">{item.ean || "Nao informado"}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Lote: </dt><dd className="inline break-all">{item.lote}</dd></div>
                        <div><dt className="inline font-medium text-foreground">Recebido: </dt><dd className="inline">{dataLegivel(item.criadoEm)}</dd></div>
                        {!item.encontrado && <div className="pt-1 font-semibold text-destructive">Item nao localizado na separacao.</div>}
                      </dl>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">Exibindo somente itens com status reposicao do Hexon. Fotos carregam do cadastro do ERP quando o produto e localizado.</p>
    </main>
  );
}
