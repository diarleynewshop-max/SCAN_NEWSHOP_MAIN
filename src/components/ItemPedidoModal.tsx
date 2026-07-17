import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Repeat, ShoppingCart, X } from "lucide-react";
import type { PedidoFilaItem } from "@/lib/pedidosFila";
import type { CatalogoItemInfo } from "@/lib/comprasSupabase";

const ITEM_STATUS_LABEL: Record<string, { label: string; classes: string }> = {
  separado: { label: "Separado", classes: "border-emerald-300 bg-emerald-100 text-emerald-800" },
  nao_tem: { label: "Nao tem", classes: "border-rose-300 bg-rose-100 text-rose-800" },
  nao_tem_tudo: { label: "Parcial", classes: "border-amber-300 bg-amber-100 text-amber-800" },
  pendente: { label: "Pendente", classes: "border-slate-300 bg-slate-100 text-slate-700" },
};

const COMPRA_STATUS_LABEL: Record<string, string> = {
  todo: "A comprar",
  produto_bom: "Produto bom",
  produto_ruim: "Produto ruim",
  fazer_pedido: "Fazer pedido",
  pedido_andamento: "Pedido em andamento",
  compra_realizada: "Compra realizada",
  concluido: "Concluido",
};

interface ItemPedidoModalProps {
  item: PedidoFilaItem | null;
  info: CatalogoItemInfo | null;
  nomePedido: string;
  fotoUrl: string | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  currentPosition?: number;
  totalItems?: number;
}

function Campo(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {props.label}
      </div>
      <div className="mt-1 text-sm font-bold text-foreground break-words">{props.children}</div>
    </div>
  );
}

export function ItemPedidoModal({
  item,
  info,
  nomePedido,
  fotoUrl,
  onClose,
  onPrevious,
  onNext,
  currentPosition = 0,
  totalItems = 0,
}: ItemPedidoModalProps) {
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && onPrevious) onPrevious();
      if (event.key === "ArrowRight" && onNext) onNext();
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [item, onClose, onNext, onPrevious]);

  if (!item) return null;

  const descricao = String(item.descricao ?? "").trim() || info?.descricao || item.sku || item.codigo;
  const secao = item.secao || info?.secao || "-";
  const statusItem = ITEM_STATUS_LABEL[item.status] ?? ITEM_STATUS_LABEL.pendente;
  const vezes = info?.vezesPedido;
  const statusCompra = info?.statusCompra ? (COMPRA_STATUS_LABEL[info.statusCompra] ?? info.statusCompra) : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Detalhe do item
            </p>
            <h2 className="mt-1 truncate text-xl font-black text-foreground">{descricao}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              Pedido de {nomePedido}
              {totalItems > 1 ? ` · Item ${currentPosition} de ${totalItems}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="relative flex items-center justify-center rounded-2xl border border-border bg-background p-3">
              {totalItems > 1 && onPrevious && (
                <button
                  type="button"
                  onClick={onPrevious}
                  className="absolute left-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg transition hover:bg-accent"
                  aria-label="Produto anterior"
                  title="Produto anterior"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}
              {fotoUrl ? (
                <img
                  src={fotoUrl}
                  alt={descricao}
                  className="max-h-[45vh] w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex h-56 w-full items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                  Sem foto disponivel
                </div>
              )}
              {totalItems > 1 && onNext && (
                <button
                  type="button"
                  onClick={onNext}
                  className="absolute right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg transition hover:bg-accent"
                  aria-label="Proximo produto"
                  title="Proximo produto"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${statusItem.classes}`}>
                  {statusItem.label}
                </span>
                {typeof vezes === "number" && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
                    <Repeat className="h-3.5 w-3.5" />
                    Pedido {vezes}x
                  </span>
                )}
                {statusCompra && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {statusCompra}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Codigo">{item.codigo || "-"}</Campo>
                <Campo label="SKU">{item.sku || "-"}</Campo>
                <Campo label="Secao">{secao}</Campo>
                <Campo label="Qtd pedida">{item.quantidadePedida}</Campo>
                <Campo label="Qtd real">{item.quantidadeReal == null ? "-" : item.quantidadeReal}</Campo>
                <Campo label="Vezes pedido">{typeof vezes === "number" ? `${vezes}x` : "-"}</Campo>
              </div>

              {descricao && (
                <div className="rounded-xl border border-border bg-background px-3 py-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Descricao
                  </div>
                  <div className="mt-1 text-sm text-foreground">{descricao}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
