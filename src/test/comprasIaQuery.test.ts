import { describe, expect, it } from "vitest";
import {
  extrairCriteriosPergunta,
  extrairEscopoEmpresasPergunta,
  extrairVisualizacaoPergunta,
  produtosCitadosNaPergunta,
  type ProdutoAgregado,
} from "../../api/compras-ia";

function produto(codigo: string, sku: string, descricao: string, secao = "UTILIDADE"): ProdutoAgregado {
  return {
    empresas: ["NEWSHOP"],
    porEmpresa: {},
    codigo,
    sku,
    descricao,
    secao,
    fotoUrl: null,
    status: "",
    pedidoFeito: null,
    atualizadoEm: "",
    ocorrencias: 1,
    pedido: 10,
    atendido: 5,
    falta: 5,
    taxaAtendimento: 50,
    prioridade: "alta",
    motivo: "",
    score: 1,
  };
}

const BASE = [
  produto("7908766445325", "NFM-9987 MASSAGEADOR FACIAL 3D", "NFM-9987 MASSAGEADOR FACIAL 3D", "ELETRONICO"),
  produto("7898766440001", "SEN-746 MASSAGEADOR DE PROTECAO FACIAL", "SEN-746 MASSAGEADOR DE PROTECAO FACIAL", "ELETRONICO"),
  produto("7898766440002", "NEW-292 LIMPADORA FACIAL", "NEW-292 LIMPADORA FACIAL", "ELETRONICO"),
  produto("789888180195", "BMG-49 SUPORTE UNIVERSAL PARA A TV FIXO", "BMG-49 - SUPORTE UNIVERSAL FIXO"),
  produto("7893095441871", "BM-F967 CONJUNTO DE 5 SACOS PLASTICOS PARA EMBALAGEM A VACUO", "BM-F967 KIT BOMBA DE SUCCAO"),
  produto("7899931525217", "D1879 MULTI EXTRATOR PARA MILHO", "D1879 MULTI EXTRATOR PARA MILHO"),
];

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

  it("pergunta por item inexistente nao arrasta a base inteira", () => {
    // Bug reportado: "para"/"mim" batiam em quase toda descricao de produto.
    const achados = produtosCitadosNaPergunta("GERE PARA MIM UM HISTORICO DO ITEM SSH01-3S-2 PORTA JOIAS", BASE);
    expect(achados).toEqual([]);
  });

  it("pergunta com codigo devolve so o item pedido, nao os parecidos", () => {
    // Bug reportado: "massageador"/"facial" traziam todo item parecido junto.
    const achados = produtosCitadosNaPergunta(
      "Gere para mim um historico completo desse item NFM-9987 MASSAGEADOR FACIAL 3D",
      BASE
    );
    expect(achados.map((item) => item.sku)).toEqual(["NFM-9987 MASSAGEADOR FACIAL 3D"]);
  });

  it("acha o item pelo EAN", () => {
    const achados = produtosCitadosNaPergunta("historico do 7908766445325", BASE);
    expect(achados.map((item) => item.sku)).toEqual(["NFM-9987 MASSAGEADOR FACIAL 3D"]);
  });

  it("pergunta descritiva devolve so os melhores casamentos", () => {
    const achados = produtosCitadosNaPergunta("como esta o massageador facial?", BASE);
    // "SEN-746 MASSAGEADOR DE PROTECAO FACIAL" tambem casa os dois termos.
    expect(achados.map((item) => item.sku)).toEqual([
      "NFM-9987 MASSAGEADOR FACIAL 3D",
      "SEN-746 MASSAGEADOR DE PROTECAO FACIAL",
    ]);
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
