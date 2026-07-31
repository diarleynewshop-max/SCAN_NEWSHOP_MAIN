import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarEnderecoPorCep } from "@/lib/cepBrasil";

function mockJson(ok: boolean, data: unknown) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(data),
  } as Response);
}

describe("buscarEnderecoPorCep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("usa ViaCEP quando retorna endereco completo com IBGE", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(await mockJson(true, {
      logradouro: "Praca da Se",
      bairro: "Se",
      localidade: "Sao Paulo",
      uf: "SP",
      ibge: "3550308",
    }));

    await expect(buscarEnderecoPorCep("01001-000")).resolves.toEqual({
      cep: "01001000",
      logradouro: "Praca da Se",
      bairro: "Se",
      cidade: "Sao Paulo",
      uf: "SP",
      codigoIbge: "3550308",
      fonte: "viacep",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("usa BrasilAPI e busca IBGE por municipio quando ViaCEP falha", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(await mockJson(false, null))
      .mockResolvedValueOnce(await mockJson(true, {
        state: "SP",
        city: "Sao Paulo",
        neighborhood: "Se",
        street: "Praca da Se",
      }))
      .mockResolvedValueOnce(await mockJson(true, [
        { nome: "SAO PAULO", codigo_ibge: "3550308" },
      ]));

    const endereco = await buscarEnderecoPorCep("01001000");

    expect(endereco?.fonte).toBe("brasilapi");
    expect(endereco?.codigoIbge).toBe("3550308");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("usa OpenCEP quando ViaCEP e BrasilAPI nao retornam IBGE completo", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(await mockJson(false, null))
      .mockResolvedValueOnce(await mockJson(true, {
        state: "SP",
        city: "Sao Paulo",
        neighborhood: "Se",
        street: "Praca da Se",
      }))
      .mockResolvedValueOnce(await mockJson(false, null))
      .mockResolvedValueOnce(await mockJson(true, {
        logradouro: "Praca da Se",
        bairro: "Se",
        localidade: "Sao Paulo",
        uf: "SP",
        ibge: "3550308",
      }));

    const endereco = await buscarEnderecoPorCep("01001000");

    expect(endereco?.fonte).toBe("opencep");
    expect(endereco?.codigoIbge).toBe("3550308");
  });
});
