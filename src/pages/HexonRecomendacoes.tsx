import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PackageSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  quantidade: number;
  encontrado: boolean;
};

const LOJAS: Array<{ id: Loja | "TODAS" | "SEM_LOJA"; label: string }> = [
  { id: "TODAS", label: "Todas" },
  { id: "NEWSHOP", label: "Loja NEWSHOP" },
  { id: "FACIL", label: "Loja FACIL" },
  { id: "SOYE", label: "Loja SOYE" },
  { id: "SEM_LOJA", label: "Sem loja identificada" },
];

function dataLegivel(value: string | null): string {
  if (!value) return "Data nao informada";
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? value : data.toLocaleString("pt-BR");
}

export default function HexonRecomendacoes() {
  const [itens, setItens] = useState<Recomendacao[]>([]);
  const [filtroLoja, setFiltroLoja] = useState<(typeof LOJAS)[number]["id"]>("TODAS");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const response = await fetch("/api/hexon-recomendacoes", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Falha ao consultar Hexon (${response.status}).`);
      setItens(Array.isArray(body?.result) ? body.result as Recomendacao[] : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel carregar as recomendacoes.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtrados = useMemo(() => {
    if (filtroLoja === "TODAS") return itens;
    if (filtroLoja === "SEM_LOJA") return itens.filter((item) => !item.loja);
    return itens.filter((item) => item.loja === filtroLoja);
  }, [filtroLoja, itens]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Recomendacoes Hexon</h1>
          <p className="mt-1 text-sm text-muted-foreground">Itens marcados como reposicao para NEWSHOP, FACIL e SOYE.</p>
        </div>
        <Button onClick={() => void carregar()} disabled={carregando} variant="outline" className="gap-2">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar recomendacoes por loja">
        {LOJAS.map((loja) => (
          <Button
            key={loja.id}
            size="sm"
            variant={filtroLoja === loja.id ? "default" : "outline"}
            onClick={() => setFiltroLoja(loja.id)}
          >
            {loja.label}
          </Button>
        ))}
      </nav>

      {erro && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{erro}</div>}

      {carregando && itens.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando reposicoes no Hexon...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center">
          <PackageSearch className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-semibold">Nenhuma reposicao pendente</p>
          <p className="mt-1 text-sm text-muted-foreground">Novidades nao aparecem nesta tela.</p>
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((item) => (
            <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    {item.loja ? `Reposicao · ${item.loja}` : `Reposicao · Destino ${item.destino || "nao informado"}`}
                  </span>
                  <h2 className="mt-3 break-words font-semibold">{item.descricao}</h2>
                </div>
                <span className="shrink-0 rounded-lg bg-muted px-2.5 py-1 text-sm font-bold">Qtd. {item.quantidade}</span>
              </div>
              <dl className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <div><dt className="inline font-medium text-foreground">EAN: </dt><dd className="inline">{item.ean || "Nao informado"}</dd></div>
                <div><dt className="inline font-medium text-foreground">Lote: </dt><dd className="inline break-all">{item.lote}</dd></div>
                <div><dt className="inline font-medium text-foreground">Recebido: </dt><dd className="inline">{dataLegivel(item.criadoEm)}</dd></div>
                {!item.encontrado && <div className="pt-1 font-semibold text-destructive">Item nao localizado na separacao.</div>}
              </dl>
            </article>
          ))}
        </section>
      )}

      <p className="text-xs text-muted-foreground">Exibindo somente itens com status reposicao. Os itens novidade seguem para a loja pelo fluxo atual do Hexon.</p>
    </main>
  );
}
