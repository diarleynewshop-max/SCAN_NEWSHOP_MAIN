import { useEffect, useState } from "react";
import { X, RefreshCw, CheckCircle2, XCircle, PackageSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { enviarConferenciaParaClickUp } from "@/lib/webhookRouter";
import type { EmpresaKey, FlagKey } from "@/lib/clickupApi";

interface ConferenciaGalpaoModalProps {
  empresa: EmpresaKey;
  flag: FlagKey;
  conferente: string;
  onClose: () => void;
  onChanged: () => void;
}

interface ItemGalpao {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  secao: string | null;
  quantidadePedida: number;
  empresaOriginal: string;
  flagOriginal: "loja" | "cd";
  conferenteOriginal: string | null;
}

const ConferenciaGalpaoModal = ({ empresa, flag, conferente, onClose, onChanged }: ConferenciaGalpaoModalProps) => {
  const { toast } = useToast();
  const [itens, setItens] = useState<ItemGalpao[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);
  const [houveAlteracao, setHouveAlteracao] = useState(false);

  const carregar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const response = await fetch(`/api/clickup-compras-proxy?action=buscar-tasks-galpao&empresa=${empresa}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Erro ${response.status}`);
      setItens(data.tasks ?? []);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao buscar itens do Galpao");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fecharModal = () => {
    if (houveAlteracao) onChanged();
    onClose();
  };

  const itemAtual = itens[0] ?? null;

  const removerItemAtual = () => {
    setItens((prev) => prev.slice(1));
    setHouveAlteracao(true);
  };

  const confirmarTem = async () => {
    if (!itemAtual) return;
    setProcessando(true);
    try {
      const empresaConferencia = (itemAtual.empresaOriginal || empresa) as EmpresaKey;
      const flagConferencia = itemAtual.flagOriginal || flag;

      const payloadConferencia: Record<string, unknown> = {
        conferente,
        listeiro: itemAtual.conferenteOriginal ?? undefined,
        empresa: empresaConferencia,
        flag: flagConferencia,
        tempo: "00:00:00",
        totalItens: 1,
        resumo: { separado: 1, naoTem: 0, parcial: 0, pendente: 0 },
        itens: [
          {
            codigo: itemAtual.codigo,
            sku: itemAtual.sku ?? "",
            secao: itemAtual.secao,
            quantidadePedida: itemAtual.quantidadePedida,
            quantidadeReal: itemAtual.quantidadePedida,
            status: "separado",
            photo: itemAtual.foto,
          },
        ],
      };

      await enviarConferenciaParaClickUp(payloadConferencia);

      try {
        await fetch(`/api/clickup-compras-proxy?action=excluir-task-galpao&empresa=${empresa}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: itemAtual.id }),
        });
      } catch (err) {
        console.warn("[ConferenciaGalpao] Conferencia criada mas task de Compras nao foi excluida", err);
      }

      toast({ title: "Enviado para a loja", description: `${itemAtual.codigo} entrou no relatorio do dia.` });
      removerItemAtual();
    } catch (e: unknown) {
      toast({ title: "Erro ao confirmar item", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  const confirmarNaoTem = async () => {
    if (!itemAtual) return;
    setProcessando(true);
    try {
      const response = await fetch(`/api/clickup-compras-proxy?action=confirmar-galpao-nao-tem&empresa=${empresa}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: itemAtual.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `Erro ${response.status}`);

      toast({ title: "Marcado como nao tem", description: `${itemAtual.codigo} voltou pra Compras > Pendente.` });
      removerItemAtual();
    } catch (e: unknown) {
      toast({ title: "Erro ao confirmar item", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/55 p-3 md:p-6 overflow-auto flex items-center justify-center">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
          <div>
            <p className="text-lg font-black text-foreground">Conferencia de Galpao</p>
            <p className="text-xs text-muted-foreground">
              {loading ? "Carregando..." : `${itens.length} item(ns) pendente(s) de checagem`}
            </p>
          </div>
          <button onClick={fecharModal} className="h-8 px-3 rounded-lg bg-muted text-muted-foreground text-xs font-bold flex items-center gap-1.5">
            <X className="w-3.5 h-3.5" /> Fechar
          </button>
        </div>

        <div className="p-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
              <RefreshCw className="w-4 h-4 animate-spin" /> Carregando itens do Galpao
            </div>
          )}

          {!loading && erro && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-destructive">{erro}</p>
              <button onClick={carregar} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !erro && !itemAtual && (
            <div className="text-center py-12 space-y-2">
              <PackageSearch className="w-10 h-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">Nenhum item pendente</p>
              <p className="text-xs text-muted-foreground">Todos os itens do Galpao ja foram conferidos.</p>
            </div>
          )}

          {!loading && !erro && itemAtual && (
            <>
              <div className="rounded-xl border border-border overflow-hidden">
                {itemAtual.foto ? (
                  <img src={itemAtual.foto} alt={itemAtual.codigo} className="w-full h-48 object-cover bg-muted" />
                ) : (
                  <div className="w-full h-48 flex items-center justify-center bg-muted text-muted-foreground text-xs">
                    sem foto
                  </div>
                )}
                <div className="p-3 space-y-1">
                  <p className="text-base font-bold text-foreground">{itemAtual.codigo}</p>
                  <p className="text-sm text-muted-foreground">{itemAtual.descricao}</p>
                  {itemAtual.secao && <p className="text-xs text-indigo-600">{itemAtual.secao}</p>}
                  <p className="text-xs text-muted-foreground">Pedido: {itemAtual.quantidadePedida} un.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={confirmarNaoTem}
                  disabled={processando}
                  className="h-12 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Nao Tem
                </button>
                <button
                  onClick={confirmarTem}
                  disabled={processando}
                  className="h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> Tem
                </button>
              </div>

              {processando && (
                <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Processando...
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConferenciaGalpaoModal;
