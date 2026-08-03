import { describe, expect, it } from "vitest";
import { normalizarFornecedorDanfeResponse, separarEnderecoDanfe } from "@/lib/danfeFornecedor";

describe("normalizarFornecedorDanfeResponse", () => {
  it("extrai IE encontrada na lista de inscricoes estaduais", () => {
    const fornecedor = normalizarFornecedorDanfeResponse({
      success: true,
      data: {
        cnpj: "10947389000130",
        razaoSocial: "BAN BAN COMERCIAL DE CALCADOS LTDA",
        uf: "CE",
        cidade: "Maracanau",
        ie: {
          status: "Contribuinte",
          inscricoes: [
            {
              IE: "063813211",
              uf: "CE",
              status: "Ativa",
            },
          ],
        },
      },
    }, "10947389000130");

    expect(fornecedor.inscricaoEstadual).toBe("063813211");
    expect(fornecedor.tipoContribuinte).toBe("CONTRIBUINTE");
  });

  it("separa numero quando o endereco do Danfe vem com tipo de logradouro separado", () => {
    const endereco = separarEnderecoDanfe("AVENIDA, CARLOS JEREISSATI, 554, SETOR A, JEREISSATI II");

    expect(endereco.endereco).toBe("AVENIDA CARLOS JEREISSATI");
    expect(endereco.numeroEndereco).toBe("554");
    expect(endereco.bairro).toBe("SETOR A, JEREISSATI II");
  });
});
