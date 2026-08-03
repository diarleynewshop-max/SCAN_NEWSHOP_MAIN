import { describe, expect, it } from "vitest";
import { normalizarFornecedorDanfeResponse } from "@/lib/danfeFornecedor";

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
});
