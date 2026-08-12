import { describe, expect, it } from "vitest";
import { escolherDescricaoProdutoExterno, normalizarCodigoExterno14 } from "./codigoExterno";

describe("codigo externo", () => {
  it("completa codigo de barras com zero a esquerda ate 14 digitos", () => {
    expect(normalizarCodigoExterno14("7908125207959")).toBe("07908125207959");
  });

  it("nao usa codigo puro como descricao do produto", () => {
    expect(escolherDescricaoProdutoExterno({
      codigo: "7908125207959",
      descricao: "7908125207959",
      sku: "Pulseira dourada",
    })).toBe("Pulseira dourada");
  });

  it("usa texto padrao quando so recebeu codigo", () => {
    expect(escolherDescricaoProdutoExterno({
      codigo: "7908125207959",
      descricao: "07908125207959",
    })).toBe("Item sem descricao");
  });
});
