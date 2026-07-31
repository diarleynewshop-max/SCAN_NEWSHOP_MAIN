// Gerador local do arquivo de pre-venda do SYSpdv (Casa Magalhaes).
// Roda no PC/servidor local a partir do JSON entregue pelo Supabase.

export const PDV_PREVENDA_REGISTRO1_TAMANHO = 478;
export const PDV_PREVENDA_REGISTRO2_TAMANHO = 608;

function ascii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ");
}

function alpha(value, size) {
  return ascii(value).slice(0, size).padEnd(size, " ");
}

function num(value, size) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length > size) return digits.slice(digits.length - size);
  return digits.padStart(size, "0");
}

function dec(value, intDigits, decDigits) {
  const size = intDigits + 1 + decDigits;
  const numero = Number(value ?? 0);
  const seguro = Number.isFinite(numero) && numero > 0 ? numero : 0;
  const texto = seguro.toFixed(decDigits);
  const [inteira, decimal = ""] = texto.split(".");

  if (inteira.length > intDigits) {
    throw new Error(`[pdv-prevenda] Valor ${seguro} nao cabe em ${intDigits} digitos inteiros.`);
  }

  return `${inteira.padStart(intDigits, "0")}.${decimal.padEnd(decDigits, "0")}`.padStart(size, "0");
}

function parseDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function dataDDMMAAAA(date) {
  const dia = String(date.getDate()).padStart(2, "0");
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  return `${dia}${mes}${date.getFullYear()}`;
}

function horaHHMM(date) {
  return `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
}

function assertTamanho(registro, esperado, rotulo) {
  if (registro.length !== esperado) {
    throw new Error(`[pdv-prevenda] ${rotulo} saiu com ${registro.length} colunas (esperado ${esperado}).`);
  }
  return registro;
}

function montarRegistro1(input, valorTotal) {
  const emissao = parseDate(input.dataEmissao);
  const cliente = input.cliente ?? {};
  const numero9 = num(input.numeroPrevenda, 9);
  const numero10 = num(input.numeroPrevenda, 10);

  const registro = [
    "01",
    numero9,
    num(cliente.codigo, 15),
    dataDDMMAAAA(emissao),
    horaHHMM(emissao),
    num(input.codigoFuncionario ?? 0, 4),
    dec(valorTotal, 12, 2),
    alpha(input.observacao ?? "", 60),
    num(0, 15),
    alpha(cliente.nome, 40),
    alpha(cliente.endereco ?? "", 45),
    alpha(cliente.bairro ?? "", 15),
    alpha(cliente.cidade ?? "", 20),
    alpha(cliente.uf ?? "", 2),
    num(cliente.numeroEndereco ?? 0, 6),
    alpha(cliente.complemento ?? "", 15),
    num(input.codigoFuncionario ?? 0, 6),
    numero10,
    alpha(input.nomeVendedor ?? "", 15),
    num(cliente.telefone ?? 0, 12),
    alpha(cliente.tipoPessoa ?? "F", 1),
    num(cliente.inscricaoEstadual ?? 0, 20),
    num(cliente.codigoPais ?? 1058, 5),
    num(cliente.codigoIbge ?? 0, 7),
    num(cliente.cep ?? 0, 8),
    num(cliente.cpfCnpj ?? cliente.codigo, 14),
    num(input.indicadorPresenca ?? 1, 1),
    num(0, 1),
    num(0, 14),
    alpha("", 60),
    num(0, 14),
    dec(0, 12, 2),
  ].join("");

  return assertTamanho(registro, PDV_PREVENDA_REGISTRO1_TAMANHO, "Registro 1");
}

function montarRegistro2(input, item) {
  const numero9 = num(input.numeroPrevenda, 9);
  const numero10 = num(input.numeroPrevenda, 10);
  const reduzida = item.descricaoReduzida ?? item.descricao;

  const registro = [
    "02",
    numero9,
    num(item.codigo, 14),
    alpha(item.descricao, 45),
    alpha(reduzida, 20),
    dec(item.quantidade, 11, 3),
    dec(item.valorUnitario, 12, 2),
    dec(item.valorDesconto ?? 0, 12, 2),
    alpha(item.tributacao ?? "", 3),
    alpha(item.complementoDescricao ?? "", 70),
    alpha(item.observacao ?? "", 255),
    alpha(item.alterarProduto ?? "N", 1),
    numero10,
    alpha(item.codigoAuxiliar ?? "", 20),
    alpha(item.unidade ?? "UN", 3),
    num(0, 8),
    alpha("", 1),
    dec(0, 5, 2),
    num(0, 2),
    alpha("", 1),
    dec(0, 5, 2),
    num(0, 2),
    num(0, 3),
    num(0, 2),
    num(0, 1),
    dec(0, 12, 2),
    num(0, 2),
    num(0, 3),
    num(0, 4),
    num(0, 2),
    num(0, 2),
    num(0, 7),
    dec(0, 12, 2),
    dec(0, 12, 2),
    alpha("", 8),
    alpha("N", 1),
    alpha("N", 1),
  ].join("");

  return assertTamanho(registro, PDV_PREVENDA_REGISTRO2_TAMANHO, "Registro 2");
}

export function calcularValorTotalPrevenda(itens) {
  const total = (itens ?? []).reduce((acc, item) => {
    const bruto = Number(item.quantidade ?? 0) * Number(item.valorUnitario ?? 0);
    const desconto = Number(item.valorDesconto ?? 0);
    return acc + bruto - desconto;
  }, 0);
  return Math.round(total * 100) / 100;
}

export function nomeArquivoPrevenda(input) {
  const base = String(input.arquivoBase ?? "").replace(/\D/g, "") || num(input.numeroPrevenda, 7);
  return `RPX${num(base, 7)}.ECF`;
}

export function gerarArquivoPrevenda(input) {
  const itens = (input.itens ?? []).filter(
    (item) => String(item.codigo ?? "").replace(/\D/g, "") && Number(item.quantidade ?? 0) > 0
  );

  if (itens.length === 0) {
    throw new Error("[pdv-prevenda] Pre-venda sem itens validos.");
  }
  if (!String(input.cliente?.nome ?? "").trim()) {
    throw new Error("[pdv-prevenda] Nome do cliente obrigatorio.");
  }
  if (!String(input.cliente?.codigo ?? "").replace(/\D/g, "")) {
    throw new Error("[pdv-prevenda] Codigo do cliente obrigatorio.");
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

