import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Loader2, PackageOpen, RefreshCw } from "lucide-react";
import { formatarNumeroPedido } from "@/lib/pedidosFila";
import {
  listarTransferenciasDaLoja,
  rotuloLoja,
  type TransferenciaResumo,
} from "@/lib/transferencias";

interface TransferenciaHistoricoProps {
  minhaLoja: string;
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  analisado: "Aguardando separacao",
  em_andamento: "Separando agora",
  concluido: "Separada e enviada",
};

const STATUS_CLASSE: Record<string, string> = {
  pendente: "bg-muted text-muted-foreground border-border",
  analisado: "bg-primary/10 text-primary border-primary/30",
  em_andamento: "bg-warning/15 text-warning border-warning/30",
  concluido: "bg-success/15 text-success border-success/30",
};

function formatarData(valor: string | null): string {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Transferencias que envolvem a minha loja, nos dois sentidos. */
const TransferenciaHistorico = ({ minhaLoja }: TransferenciaHistoricoProps) => {
  const [itens, setItens] = useState<TransferenciaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setItens(await listarTransferenciasDaLoja(minhaLoja));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao carregar transferencias.");
    } finally {
      setCarregando(false);
    }
  }, [minhaLoja]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando transferencias...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {itens.length} transferencia(s)
        </p>
        <button
          type="button"
          onClick={() => void carregar()}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {erro && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
          {erro}
        </p>
      )}

      {itens.length === 0 && !erro && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
          <PackageOpen className="h-6 w-6 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Nenhuma transferencia entre lojas ainda.
          </p>
        </div>
      )}

      {itens.map((item) => {
        const statusLabel = STATUS_LABEL[item.status] ?? item.status;
        const statusClasse = STATUS_CLASSE[item.status] ?? STATUS_CLASSE.pendente;

        return (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  "rounded px-1.5 py-0.5 text-[10px] font-black uppercase " +
                  (item.souOrigem
                    ? "bg-foreground text-background"
                    : "border border-primary/40 bg-primary/10 text-primary")
                }
              >
                {item.souOrigem ? "Eu mando" : "Eu recebo"}
              </span>
              <span className={"rounded border px-1.5 py-0.5 text-[10px] font-bold " + statusClasse}>
                {statusLabel}
              </span>
              {item.numeroPedido != null && (
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatarNumeroPedido(item.numeroPedido)}
                </span>
              )}
            </div>

            <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-foreground">
              {rotuloLoja(item.origem)}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              {rotuloLoja(item.destino)}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              {item.totalItens} item(ns)
              {item.pessoa ? " · pedido por " + item.pessoa : ""}
              {item.conferente ? " · separado por " + item.conferente : ""}
            </p>

            {formatarData(item.createdAt) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Aberta em {formatarData(item.createdAt)}
              </p>
            )}

            {item.status === "concluido" && (
              <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                Separado {item.resumoSeparado} · Nao tem {item.resumoNaoTem} · Parcial {item.resumoParcial}
                {item.resumoPendente > 0 ? " · Pendente " + item.resumoPendente : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TransferenciaHistorico;
