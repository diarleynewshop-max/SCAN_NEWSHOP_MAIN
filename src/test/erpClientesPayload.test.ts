import { describe, expect, it } from "vitest";
import { montarPayloadCadastro } from "../../api/erp-clientes";

const enderecoBase = {
  cep: "01001000",
  uf: "SP",
  cidade: "Sao Paulo",
  codigoIbge: "3550308",
  endereco: "Praca da Se",
  numeroEndereco: "1",
  bairro: "Se",
};

describe("montarPayloadCadastro", () => {
  it("monta CPF com fantasia igual ao nome, isento e telefone padrao", () => {
    const payload = montarPayloadCadastro("SEFULY", {
      nome: "Manuel Rafael",
      cpfCnpj: "61032342390",
      ...enderecoBase,
    });

    expect(payload.nome).toBe("Manuel Rafael");
    expect(payload.fantasia).toBe("Manuel Rafael");
    expect(payload.tipoDePessoa).toBe("FISICA");
    expect(payload.tipoContribuinte).toBe("ISENTO");
    expect(payload.inscricaoEstadual).toBe("ISENTO");
    expect(payload.telefone1).toBe("99999999999");
    expect(payload.holdingId).toBe(1);
    expect(payload.id).toBe(0);
    expect(payload.enderecos[0].codigoDoPais).toBe(1058);
    expect(payload.enderecos[0].municipio).toBe("Sao Paulo");
    expect(payload.enderecos[0].codigoIbge).toBe("3550308");
  });

  it("monta CNPJ nao contribuinte como isento de IE", () => {
    const payload = montarPayloadCadastro("SEFULY", {
      nome: "Empresa Teste",
      cpfCnpj: "11222333000181",
      tipoContribuinte: "NAO_CONTRIBUINTE",
      telefone: "",
      ...enderecoBase,
    }, 423);

    expect(payload.id).toBe(423);
    expect(payload.tipoDePessoa).toBe("JURIDICA");
    expect(payload.tipoContribuinte).toBe("NAO_CONTRIBUINTE");
    expect(payload.inscricaoEstadual).toBe("ISENTO");
    expect(payload.telefone1).toBe("99999999999");
  });

  it("exige IE quando CNPJ for contribuinte", () => {
    expect(() => montarPayloadCadastro("SEFULY", {
      nome: "Empresa Teste",
      cpfCnpj: "11222333000181",
      tipoContribuinte: "CONTRIBUINTE",
      ...enderecoBase,
    })).toThrow(/RG\/IE obrigatorio/i);
  });
});
