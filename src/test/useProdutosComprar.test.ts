import { describe, expect, it } from "vitest";
import {
  deduplicarProdutos,
  type ProdutoComprar,
} from "@/hooks/useProdutosComprar";

function produto(overrides: Partial<ProdutoComprar>): ProdutoComprar {
  return {
    id: "id-base",
    codigo: "7891234567890",
    sku: "Produto teste",
    descricao: "Produto teste",
    foto: null,
    status: "todo",
    date_created: "1000",
    vezesPedido: 1,
    secao: null,
    pedidoFeito: false,
    ...overrides,
  };
}

describe("deduplicacao de Compras", () => {
  it("mantem compra realizada acima de status antigo do mesmo produto", () => {
    const resultado = deduplicarProdutos([
      produto({
        id: "antigo",
        status: "pedido_andamento",
        date_created: "2000",
        vezesPedido: 2,
        pedidoFeito: true,
      }),
      produto({
        id: "final",
        status: "compra_realizada",
        date_created: "1000",
        vezesPedido: 3,
        pedidoFeito: true,
      }),
    ]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({
      id: "final",
      status: "compra_realizada",
      vezesPedido: 5,
    });
  });
});
