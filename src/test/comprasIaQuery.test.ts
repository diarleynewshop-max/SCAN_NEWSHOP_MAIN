import { describe, expect, it } from "vitest";
import { extrairCriteriosPergunta } from "../../api/compras-ia";

describe("critérios da pergunta do Analista de Compras", () => {
  it("entende top 20 com frequência de 5x ou mais", () => {
    expect(extrairCriteriosPergunta("Me gere uma lista de top 20 itens que foram pedido de 5x a mais")).toEqual({
      limite: 20,
      minimoOcorrencias: 5,
      ordenacao: "ocorrencias",
      estruturada: true,
    });
  });

  it("entende ranking por quantidade sem filtro de frequência", () => {
    expect(extrairCriteriosPergunta("Mostre o top 30 de itens mais pedidos")).toEqual({
      limite: 30,
      minimoOcorrencias: null,
      ordenacao: "quantidade",
      estruturada: true,
    });
  });

  it("mantém os padrões em pergunta aberta", () => {
    expect(extrairCriteriosPergunta("Como está a seção de utilidade?")).toEqual({
      limite: 12,
      minimoOcorrencias: null,
      ordenacao: "quantidade",
      estruturada: false,
    });
  });
});
