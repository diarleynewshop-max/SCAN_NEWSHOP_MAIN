import { describe, expect, it } from "vitest";
import {
  PDV_PREVENDA_REGISTRO1_TAMANHO,
  PDV_PREVENDA_REGISTRO2_TAMANHO,
  calcularValorTotalPrevenda,
  gerarArquivoPrevenda,
  type PdvPrevendaInput,
} from "@/lib/pdvPrevenda";

// Recorta um campo pela posicao 1-indexada do layout (inicio e fim inclusivos).
function campo(linha: string, inicio: number, fim: number): string {
  return linha.slice(inicio - 1, fim);
}

const base: PdvPrevendaInput = {
  numeroPrevenda: 201300197,
  dataEmissao: new Date(2020, 4, 13, 15, 17, 0),
  codigoFuncionario: 1,
  nomeVendedor: "ALBERTO MOREIRA",
  cliente: {
    codigo: "64675343449",
    nome: "MARCONE ANCHIETA DA NOBREGA CANDEIA",
    cpfCnpj: "11111111100000",
    tipoPessoa: "F",
    endereco: "Rua Luiza Miranda Coelho",
    bairro: "Luciano Cavalcante",
    cidade: "Fortaleza",
    uf: "CE",
    numeroEndereco: "1",
    complemento: "Complemento end",
    telefone: "085328945130",
    inscricaoEstadual: "00000000000069885028",
    codigoIbge: "2304400",
    cep: "60743770",
  },
  itens: [
    {
      codigo: "1",
      descricao: "VENT. 40CM MESA FD40/VE40 ARNO",
      descricaoReduzida: "VENT.40CM MESA FD40",
      quantidade: 1,
      valorUnitario: 142.8,
      tributacao: "T17",
    },
  ],
};

describe("gerarArquivoPrevenda", () => {
  it("gera 1 registro 1 + 1 registro 2 por item, com as larguras do layout", () => {
    const arquivo = gerarArquivoPrevenda({
      ...base,
      itens: [base.itens[0], { ...base.itens[0], codigo: "2", quantidade: 3 }],
    });
    const linhas = arquivo.conteudo.split("\r\n").filter(Boolean);

    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toHaveLength(PDV_PREVENDA_REGISTRO1_TAMANHO);
    expect(linhas[1]).toHaveLength(PDV_PREVENDA_REGISTRO2_TAMANHO);
    expect(linhas[2]).toHaveLength(PDV_PREVENDA_REGISTRO2_TAMANHO);
    expect(arquivo.totalItens).toBe(2);
  });

  // Compara com o exemplo do Registro 1 do layout oficial (Casa Magalhaes),
  // campo a campo. O exemplo cobre os campos 1..26 (os campos 27-32 sao
  // opcionais e vem ausentes la).
  it("posiciona os campos do Registro 1 conforme o exemplo do layout", () => {
    const linha = gerarArquivoPrevenda(base).conteudo.split("\r\n")[0];

    expect(campo(linha, 1, 2)).toBe("01");
    expect(campo(linha, 3, 11)).toBe("201300197");
    expect(campo(linha, 12, 26)).toBe("000064675343449");
    expect(campo(linha, 27, 34)).toBe("13052020");
    expect(campo(linha, 35, 38)).toBe("1517");
    expect(campo(linha, 39, 42)).toBe("0001");
    expect(campo(linha, 43, 57)).toBe("000000000142.80");
    expect(campo(linha, 118, 132)).toBe("000000000000000");
    expect(campo(linha, 133, 172)).toBe("MARCONE ANCHIETA DA NOBREGA CANDEIA     ");
    expect(campo(linha, 173, 217)).toBe("Rua Luiza Miranda Coelho                     ");
    // Bairro tem 15 col: "Luciano Cavalcante" e truncado, igual ao exemplo.
    expect(campo(linha, 218, 232)).toBe("Luciano Cavalca");
    expect(campo(linha, 233, 252)).toBe("Fortaleza           ");
    expect(campo(linha, 253, 254)).toBe("CE");
    expect(campo(linha, 255, 260)).toBe("000001");
    expect(campo(linha, 261, 275)).toBe("Complemento end");
    expect(campo(linha, 276, 281)).toBe("000001");
    expect(campo(linha, 282, 291)).toBe("0201300197");
    // Campo 19: o doc diz "292 386", mas o correto e 292-306 (15 col).
    expect(campo(linha, 292, 306)).toBe("ALBERTO MOREIRA");
    expect(campo(linha, 307, 318)).toBe("085328945130");
    expect(campo(linha, 319, 319)).toBe("F");
    expect(campo(linha, 320, 339)).toBe("00000000000069885028");
    expect(campo(linha, 340, 344)).toBe("01058");
    expect(campo(linha, 345, 351)).toBe("2304400");
    expect(campo(linha, 352, 359)).toBe("60743770");
    expect(campo(linha, 360, 373)).toBe("11111111100000");
  });

  it("posiciona os campos do Registro 2 conforme o exemplo do layout", () => {
    const linha = gerarArquivoPrevenda(base).conteudo.split("\r\n")[1];

    expect(campo(linha, 1, 2)).toBe("02");
    expect(campo(linha, 3, 11)).toBe("201300197");
    expect(campo(linha, 12, 25)).toBe("00000000000001");
    expect(campo(linha, 26, 70)).toBe("VENT. 40CM MESA FD40/VE40 ARNO               ");
    expect(campo(linha, 71, 90)).toBe("VENT.40CM MESA FD40 ");
    expect(campo(linha, 91, 105)).toBe("00000000001.000");
    expect(campo(linha, 106, 120)).toBe("000000000142.80");
    expect(campo(linha, 121, 135)).toBe("000000000000.00");
    expect(campo(linha, 136, 138)).toBe("T17");
    // Campo 12 tem 1 col (o doc erra dizendo "464 465"), campo 13 vem em 465.
    expect(campo(linha, 464, 464)).toBe("N");
    expect(campo(linha, 465, 474)).toBe("0201300197");
    expect(campo(linha, 495, 497)).toBe("UN ");
  });

  it("remove acentos (arquivo legado, ASCII) sem deslocar as colunas", () => {
    const linha = gerarArquivoPrevenda({
      ...base,
      cliente: { ...base.cliente, nome: "JOSÉ DA CONCEIÇÃO", cidade: "SÃO PAULO" },
    }).conteudo.split("\r\n")[0];

    expect(linha).toHaveLength(PDV_PREVENDA_REGISTRO1_TAMANHO);
    expect(campo(linha, 133, 172).trimEnd()).toBe("JOSE DA CONCEICAO");
    expect(campo(linha, 233, 252).trimEnd()).toBe("SAO PAULO");
  });

  it("usa valor liquido no total quando ha desconto", () => {
    const itens = [
      { codigo: "1", descricao: "A", quantidade: 2, valorUnitario: 10, valorDesconto: 5 },
      { codigo: "2", descricao: "B", quantidade: 1, valorUnitario: 3.5 },
    ];
    expect(calcularValorTotalPrevenda(itens)).toBe(18.5);

    const linha = gerarArquivoPrevenda({ ...base, itens }).conteudo.split("\r\n")[0];
    expect(campo(linha, 43, 57)).toBe("000000000018.50");
  });

  it("nomeia o arquivo como RPX<7 digitos>.ECF", () => {
    expect(gerarArquivoPrevenda(base).nomeArquivo).toBe("RPX1300197.ECF");
    expect(gerarArquivoPrevenda({ ...base, arquivoBase: "42" }).nomeArquivo).toBe("RPX0000042.ECF");
  });

  it("recusa pre-venda sem item valido ou sem cliente", () => {
    expect(() => gerarArquivoPrevenda({ ...base, itens: [] })).toThrow(/sem itens validos/i);
    expect(() =>
      gerarArquivoPrevenda({ ...base, itens: [{ ...base.itens[0], quantidade: 0 }] })
    ).toThrow(/sem itens validos/i);
    expect(() =>
      gerarArquivoPrevenda({ ...base, cliente: { ...base.cliente, nome: "  " } })
    ).toThrow(/nome do cliente/i);
  });
});
