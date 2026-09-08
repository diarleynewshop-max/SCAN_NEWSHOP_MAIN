import { describe, expect, it } from "vitest";
import {
  lojasParceiras,
  montarTituloTransferencia,
  normalizarLojaTransferencia,
  resolverRotaTransferencia,
  rotuloLoja,
} from "@/lib/transferencias";
import { lojaTemFeature } from "@/lib/lojaFeatures";

// O risco real dessa feature e inverter origem e destino: a mercadoria sairia
// da loja errada e a conferencia cairia na fila errada. Por isso a rota tem
// teste proprio.
describe("rota da transferencia entre lojas", () => {
  it("pedir: a OUTRA loja separa e manda para a minha", () => {
    expect(resolverRotaTransferencia({ minhaLoja: "FACIL", parceira: "SOYE", direcao: "pedir" })).toEqual({
      origem: "SOYE",
      destino: "FACIL",
    });
  });

  it("enviar: a MINHA loja separa e manda para a outra", () => {
    expect(resolverRotaTransferencia({ minhaLoja: "SOYE", parceira: "FACIL", direcao: "enviar" })).toEqual({
      origem: "SOYE",
      destino: "FACIL",
    });
  });

  it("a origem e sempre quem separa, nos dois sentidos", () => {
    const pedido = resolverRotaTransferencia({ minhaLoja: "NEWSHOP", parceira: "SOYE", direcao: "pedir" });
    const envio = resolverRotaTransferencia({ minhaLoja: "SOYE", parceira: "NEWSHOP", direcao: "enviar" });
    // Mesma rota fisica (SOYE separa, NEWSHOP recebe) pelos dois caminhos de tela.
    expect(pedido).toEqual(envio);
  });

  it("recusa transferencia para a propria loja", () => {
    expect(() =>
      resolverRotaTransferencia({ minhaLoja: "SOYE", parceira: "SOYE", direcao: "enviar" })
    ).toThrow();
  });

  it("recusa loja que nao participa (SEFULY)", () => {
    expect(() =>
      resolverRotaTransferencia({ minhaLoja: "SEFULY", parceira: "SOYE", direcao: "enviar" })
    ).toThrow();
  });

  it("recusa quando a outra loja nao foi escolhida", () => {
    expect(() =>
      resolverRotaTransferencia({ minhaLoja: "SOYE", parceira: null, direcao: "enviar" })
    ).toThrow();
  });
});

describe("lojas da transferencia", () => {
  it("normaliza o nome completo da FACIL ATACADO", () => {
    expect(normalizarLojaTransferencia("FACIL ATACADO")).toBe("FACIL");
    expect(normalizarLojaTransferencia("facil")).toBe("FACIL");
  });

  it("nao aceita SEFULY como loja de transferencia", () => {
    expect(normalizarLojaTransferencia("SEFULY")).toBeNull();
    expect(lojaTemFeature("SEFULY", "transferencia_loja")).toBe(false);
  });

  it("libera a feature para as 3 lojas do escopo", () => {
    expect(lojaTemFeature("NEWSHOP", "transferencia_loja")).toBe(true);
    expect(lojaTemFeature("SOYE", "transferencia_loja")).toBe(true);
    expect(lojaTemFeature("FACIL", "transferencia_loja")).toBe(true);
  });

  it("nunca oferece a propria loja como parceira", () => {
    expect(lojasParceiras("SOYE")).toEqual(["NEWSHOP", "FACIL"]);
    expect(lojasParceiras("NEWSHOP")).toEqual(["SOYE", "FACIL"]);
  });

  it("mostra FACIL ATACADO por extenso na tela", () => {
    expect(rotuloLoja("FACIL")).toBe("FACIL ATACADO");
    expect(rotuloLoja("SOYE")).toBe("SOYE");
  });
});

describe("titulo da transferencia", () => {
  it("deixa a rota legivel na fila de conferencia", () => {
    const titulo = montarTituloTransferencia({
      origem: "SOYE",
      destino: "FACIL",
      pessoa: "Joao",
      quando: new Date("2026-09-08T12:00:00Z"),
    });

    expect(titulo).toContain("SOYE");
    expect(titulo).toContain("FACIL");
    expect(titulo).toContain("Joao");
    // A seta mostra o sentido: quem separa fica antes.
    expect(titulo.indexOf("SOYE")).toBeLessThan(titulo.indexOf("FACIL"));
  });
});
