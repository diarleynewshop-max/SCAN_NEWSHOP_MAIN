import { describe, expect, it } from "vitest";
import {
  extrairCriteriosPergunta,
  extrairEscopoEmpresasPergunta,
  extrairVisualizacaoPergunta,
} from "../../api/compras-ia";

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

  it("trava NEWSHOP na propria loja mesmo citando FACIL", () => {
    expect(extrairEscopoEmpresasPergunta("NEWSHOP", "Qual item mais pedido da facil atacado?")).toEqual(["NEWSHOP"]);
  });

  it("separa SOYE e FACIL dentro do dominio SF", () => {
    expect(extrairEscopoEmpresasPergunta("SOYE", "Qual item mais pedido na Soye e menos pedido na Facil atacado?")).toEqual(["SOYE", "FACIL"]);
    expect(extrairEscopoEmpresasPergunta("SOYE", "Qual item mais pedido da facil atacado?")).toEqual(["FACIL"]);
  });

  it("so mostra grafico e produto quando a pergunta pede", () => {
    expect(extrairVisualizacaoPergunta("Faca um resumo geral", "pergunta")).toEqual({
      mostrarGrafico: false,
      mostrarProdutos: false,
    });
    expect(extrairVisualizacaoPergunta("Mostre um grafico por secao", "pergunta")).toEqual({
      mostrarGrafico: true,
      mostrarProdutos: false,
    });
    expect(extrairVisualizacaoPergunta("Qual item mais pedido?", "pergunta")).toEqual({
      mostrarGrafico: false,
      mostrarProdutos: true,
    });
  });
});
