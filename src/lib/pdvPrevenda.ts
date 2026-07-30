// Gerador do arquivo de pre-venda do SYSpdv (Casa Magalhaes) — RPX9999999.ECF.
//
// Layout de Pre-venda/Pedido versao 19.0.0.20313, arquivo posicional (fixed
// width). Implementa o Registro 1 (cabecalho, 478 col) e o Registro 2 (itens,
// 608 col).
//
// O Registro 3 (finalizacao/pagamento) NAO e gerado de proposito: e OPCIONAL no
// layout e o pagamento acontece no caixa. Enviar finalizacao daqui significaria
// afirmar forma de pagamento e valor recebido que o app nao conhece. Alem disso
// as posicoes do Registro 3 no doc oficial estao inconsistentes com o exemplo
// (campos 9/10/11 divergem em 1 coluna), entao gerar seria chute.
//
// Validacao das posicoes: o exemplo do Registro 1 no doc foi decodificado campo
// a campo e fecha exatamente ate a coluna 373 (os campos 27-32 sao opcionais e
// vem ausentes no exemplo). Duas divergencias do doc foram resolvidas pelo
// exemplo/aritmetica das posicoes:
//   - Reg.1 campo 19 (nome do vendedor): doc diz "292 386", o correto e 292-306
//     (tamanho 15), confirmado pelo exemplo ("ALBERTO MOREIRA") e pelo campo 20
//     comecar em 307.
//   - Reg.2 campo 12 (alterar produto): doc diz "464 465" para um campo de
//     tamanho 01; o correto e 464-464, com o campo 13 em 465-474.

export const PDV_PREVENDA_REGISTRO1_TAMANHO = 478;
export const PDV_PREVENDA_REGISTRO2_TAMANHO = 608;

export type PdvTipoPessoa = "F" | "J";

export interface PdvPrevendaCliente {
  /** Campo 3 (12-26): codigo interno OU CPF/CNPJ. */
  codigo: string;
  /** Campo 10 (133-172): nome completo. */
  nome: string;
  /** Campo 26 (360-373). */
  cpfCnpj?: string | null;
  /** Campo 21 (319): F=fisica, J=juridica. */
  tipoPessoa?: PdvTipoPessoa;
  /** Campo 11 (173-217). */
  endereco?: string | null;
  /** Campo 15 (255-260). */
  numeroEndereco?: string | null;
  /** Campo 16 (261-275). */
  complemento?: string | null;
  /** Campo 12 (218-232). */
  bairro?: string | null;
  /** Campo 13 (233-252). */
  cidade?: string | null;
  /** Campo 14 (253-254). */
  uf?: string | null;
  /** Campo 25 (352-359). */
  cep?: string | null;
  /** Campo 20 (307-318). */
  telefone?: string | null;
  /** Campo 22 (320-339). */
  inscricaoEstadual?: string | null;
  /** Campo 24 (345-351): UF + municipio. */
  codigoIbge?: string | null;
  /** Campo 23 (340-344). 1058 = Brasil. */
  codigoPais?: string | null;
}

export interface PdvPrevendaItem {
  /** Campo 3 (12-25): codigo interno ou codigo de barras. */
  codigo: string;
  /** Campo 4 (26-70). */
  descricao: string;
  /** Campo 5 (71-90): descritivo do cupom. Default = descricao truncada. */
  descricaoReduzida?: string | null;
  /** Campo 6 (91-105): 3 casas decimais. */
  quantidade: number;
  /** Campo 7 (106-120): 2 casas decimais, valor BRUTO se houver desconto. */
  valorUnitario: number;
  /** Campo 8 (121-135). */
  valorDesconto?: number | null;
  /** Campo 9 (136-138): ex. "T17". */
  tributacao?: string | null;
  /** Campo 15 (495-497): default "UN". */
  unidade?: string | null;
  /** Campo 14 (475-494). */
  codigoAuxiliar?: string | null;
  /** Campo 10 (139-208). */
  complementoDescricao?: string | null;
  /** Campo 11 (209-463). */
  observacao?: string | null;
  /** Campo 12 (464): S/N. Default "N" — nao mexer no cadastro do ERP. */
  alterarProduto?: "S" | "N";
}

export interface PdvPrevendaInput {
  /** Campos 2 (9 dig) e 18 (10 dig). */
  numeroPrevenda: number | string;
  /** Campos 4 e 5. Default: agora. */
  dataEmissao?: Date;
  /** Campos 6 (4 dig) e 17 (6 dig). */
  codigoFuncionario?: number | string | null;
  /** Campo 19 (292-306). */
  nomeVendedor?: string | null;
  /** Campo 8 (58-117). */
  observacao?: string | null;
  /** Campo 27 (374): 1=presencial ... 9=outros. */
  indicadorPresenca?: string | null;
  cliente: PdvPrevendaCliente;
  itens: PdvPrevendaItem[];
  /**
   * Base do nome do arquivo (7 digitos em RPX9999999.ECF). Se ausente usa os 7
   * digitos finais do numero da pre-venda. CONFIRMAR com a instalacao do SYSpdv:
   * em algumas instalacoes esse numero e o codigo do vendedor/terminal.
   */
  arquivoBase?: string | null;
}

export interface PdvPrevendaArquivo {
  nomeArquivo: string;
  conteudo: string;
  numeroPrevenda: string;
  totalItens: number;
  valorTotal: number;
}

// ── Formatadores posicionais ────────────────────────────────────────────────

/** Remove acentos e caracteres fora de ASCII imprimivel (arquivo legado). */
function ascii(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

/** Campo alfanumerico: alinhado a esquerda, completado com espacos. */
function alpha(value: unknown, size: number): string {
  return ascii(value).slice(0, size).padEnd(size, " ");
}

/**
 * Campo numerico: so digitos, alinhado a direita com zeros. Quando o valor
 * excede o tamanho mantem os digitos MENOS significativos (final), que e o
 * comportamento correto para codigo/documento truncado.
 */
function num(value: unknown, size: number): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > size) return digits.slice(digits.length - size);
  return digits.padStart(size, "0");
}

/**
 * Campo decimal com PONTO como separador, zeros a esquerda.
 * Ex.: dec(142.8, 12, 2) => "000000000142.80" (15 col).
 */
function dec(value: unknown, intDigits: number, decDigits: number): string {
  const size = intDigits + 1 + decDigits;
  const numero = Number(value ?? 0);
  const seguro = Number.isFinite(numero) && numero > 0 ? numero : 0;
  const texto = seguro.toFixed(decDigits);
  const [inteira, decimal = ""] = texto.split(".");

  if (inteira.length > intDigits) {
    // Estouro: nao ha como representar. Melhor falhar do que enviar valor errado.
    throw new Error(`[pdvPrevenda] Valor ${seguro} nao cabe em ${intDigits} digitos inteiros.`);
  }

  return `${inteira.padStart(intDigits, "0")}.${decimal.padEnd(decDigits, "0")}`.padStart(size, "0");
}

function dataDDMMAAAA(date: Date): string {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  return `${dia}${mes}${date.getFullYear()}`;
}

function horaHHMM(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}

function assertTamanho(registro: string, esperado: number, rotulo: string): string {
  if (registro.length !== esperado) {
    throw new Error(
      `[pdvPrevenda] ${rotulo} saiu com ${registro.length} colunas (esperado ${esperado}).`
    );
  }
  return registro;
}

// ── Registro 1: cabecalho da pre-venda ──────────────────────────────────────

function montarRegistro1(input: PdvPrevendaInput, valorTotal: number): string {
  const emissao = input.dataEmissao ?? new Date();
  const cliente = input.cliente;
  const numero9 = num(input.numeroPrevenda, 9);
  const numero10 = num(input.numeroPrevenda, 10);

  const registro = [
    "01",                                             // 001-002 tipo
    numero9,                                          // 003-011 pre-venda 9
    num(cliente.codigo, 15),                          // 012-026 codigo cliente
    dataDDMMAAAA(emissao),                            // 027-034 data
    horaHHMM(emissao),                                // 035-038 hora
    num(input.codigoFuncionario ?? 0, 4),             // 039-042 funcionario 4
    dec(valorTotal, 12, 2),                           // 043-057 valor total
    alpha(input.observacao ?? "", 60),                // 058-117 observacao
    num(0, 15),                                       // 118-132 reservado
    alpha(cliente.nome, 40),                          // 133-172 nome cliente
    alpha(cliente.endereco ?? "", 45),                // 173-217 endereco
    alpha(cliente.bairro ?? "", 15),                  // 218-232 bairro
    alpha(cliente.cidade ?? "", 20),                  // 233-252 cidade
    alpha(cliente.uf ?? "", 2),                       // 253-254 UF
    num(cliente.numeroEndereco ?? 0, 6),              // 255-260 numero
    alpha(cliente.complemento ?? "", 15),             // 261-275 complemento
    num(input.codigoFuncionario ?? 0, 6),             // 276-281 funcionario 6
    numero10,                                         // 282-291 pre-venda 10
    alpha(input.nomeVendedor ?? "", 15),              // 292-306 nome vendedor
    num(cliente.telefone ?? 0, 12),                   // 307-318 telefone
    alpha(cliente.tipoPessoa ?? "F", 1),              // 319     tipo pessoa
    num(cliente.inscricaoEstadual ?? 0, 20),          // 320-339 inscricao est.
    num(cliente.codigoPais ?? 1058, 5),               // 340-344 pais
    num(cliente.codigoIbge ?? 0, 7),                  // 345-351 IBGE
    num(cliente.cep ?? 0, 8),                         // 352-359 CEP
    num(cliente.cpfCnpj ?? cliente.codigo, 14),       // 360-373 CPF/CNPJ
    num(input.indicadorPresenca ?? 1, 1),             // 374     ind. presenca
    num(0, 1),                                        // 375     ind. intermediador
    num(0, 14),                                       // 376-389 CNPJ intermediador
    alpha("", 60),                                    // 390-449 id intermediador
    num(0, 14),                                       // 450-463 CNPJ inst. pagto
    dec(0, 12, 2),                                    // 464-478 taxa de servico
  ].join("");

  return assertTamanho(registro, PDV_PREVENDA_REGISTRO1_TAMANHO, "Registro 1");
}

// ── Registro 2: itens ───────────────────────────────────────────────────────

function montarRegistro2(input: PdvPrevendaInput, item: PdvPrevendaItem): string {
  const numero9 = num(input.numeroPrevenda, 9);
  const numero10 = num(input.numeroPrevenda, 10);
  const reduzida = item.descricaoReduzida ?? item.descricao;

  const registro = [
    "02",                                             // 001-002 tipo
    numero9,                                          // 003-011 pre-venda 9
    num(item.codigo, 14),                             // 012-025 codigo produto
    alpha(item.descricao, 45),                        // 026-070 descricao
    alpha(reduzida, 20),                              // 071-090 descricao reduzida
    dec(item.quantidade, 11, 3),                      // 091-105 quantidade
    dec(item.valorUnitario, 12, 2),                   // 106-120 valor unitario
    dec(item.valorDesconto ?? 0, 12, 2),              // 121-135 desconto
    alpha(item.tributacao ?? "", 3),                  // 136-138 tributacao
    alpha(item.complementoDescricao ?? "", 70),       // 139-208 complemento desc.
    alpha(item.observacao ?? "", 255),                // 209-463 observacao
    alpha(item.alterarProduto ?? "N", 1),             // 464     alterar produto
    numero10,                                         // 465-474 pre-venda 10
    alpha(item.codigoAuxiliar ?? "", 20),             // 475-494 codigo auxiliar
    alpha(item.unidade ?? "UN", 3),                   // 495-497 unidade
    num(0, 8),                                        // 498-505 NCM
    alpha("", 1),                                     // 506     sigla PIS
    dec(0, 5, 2),                                     // 507-514 aliquota PIS
    num(0, 2),                                        // 515-516 CST PIS
    alpha("", 1),                                     // 517     sigla COFINS
    dec(0, 5, 2),                                     // 518-525 aliquota COFINS
    num(0, 2),                                        // 526-527 CST COFINS
    num(0, 3),                                        // 528-530 natureza
    num(0, 2),                                        // 531-532 excecao NCM
    num(0, 1),                                        // 533     tabela A
    dec(0, 12, 2),                                    // 534-548 valor garantia
    num(0, 2),                                        // 549-550 CST ICMS
    num(0, 3),                                        // 551-553 CSOSN
    num(0, 4),                                        // 554-557 CFOP
    num(0, 2),                                        // 558-559 cod. imposto PIS
    num(0, 2),                                        // 560-561 cod. imposto COFINS
    num(0, 7),                                        // 562-568 CEST
    dec(0, 12, 2),                                    // 569-583 aliq. ICMS origem
    dec(0, 12, 2),                                    // 584-598 % red. ICMS origem
    alpha("", 8),                                     // 599-606 beneficio fiscal
    alpha("N", 1),                                    // 607     desoneracao
    alpha("N", 1),                                    // 608     ICMS ST origem
  ].join("");

  return assertTamanho(registro, PDV_PREVENDA_REGISTRO2_TAMANHO, "Registro 2");
}

// ── API publica ─────────────────────────────────────────────────────────────

export function calcularValorTotalPrevenda(itens: PdvPrevendaItem[]): number {
  const total = (itens ?? []).reduce((acc, item) => {
    const bruto = Number(item.quantidade ?? 0) * Number(item.valorUnitario ?? 0);
    const desconto = Number(item.valorDesconto ?? 0);
    return acc + bruto - desconto;
  }, 0);
  // Campo 7 do Registro 1 e o valor LIQUIDO quando os itens tem desconto.
  return Math.round(total * 100) / 100;
}

export function nomeArquivoPrevenda(input: PdvPrevendaInput): string {
  const base = String(input.arquivoBase ?? "").replace(/\D/g, "")
    || num(input.numeroPrevenda, 7);
  return `RPX${num(base, 7)}.ECF`;
}

/**
 * Monta o conteudo completo do RPX*.ECF: 1 linha de Registro 1 + 1 linha de
 * Registro 2 por item. Linhas terminadas em CRLF (arquivo consumido por
 * retaguarda Windows).
 */
export function gerarArquivoPrevenda(input: PdvPrevendaInput): PdvPrevendaArquivo {
  const itens = (input.itens ?? []).filter(
    (item) => String(item.codigo ?? "").replace(/\D/g, "") && Number(item.quantidade ?? 0) > 0
  );

  if (itens.length === 0) {
    throw new Error("[pdvPrevenda] Pre-venda sem itens validos (precisa codigo numerico e quantidade > 0).");
  }
  if (!String(input.cliente?.nome ?? "").trim()) {
    throw new Error("[pdvPrevenda] Nome do cliente obrigatorio (campo 10 do Registro 1).");
  }
  if (!String(input.cliente?.codigo ?? "").replace(/\D/g, "")) {
    throw new Error("[pdvPrevenda] Codigo do cliente obrigatorio (campo 3 do Registro 1).");
  }

  const valorTotal = calcularValorTotalPrevenda(itens);
  const linhas = [
    montarRegistro1(input, valorTotal),
    ...itens.map((item) => montarRegistro2(input, item)),
  ];

  return {
    nomeArquivo: nomeArquivoPrevenda(input),
    conteudo: `${linhas.join("\r\n")}\r\n`,
    numeroPrevenda: num(input.numeroPrevenda, 10),
    totalItens: itens.length,
    valorTotal,
  };
}
