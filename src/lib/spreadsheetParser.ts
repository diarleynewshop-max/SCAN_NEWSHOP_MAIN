import * as XLSX from "xlsx";

export interface SpreadsheetItem {
  description: string;  // Coluna B — descrição do produto
  sku: string;          // Coluna A — código/referência do produto
  qtdPlanilha: number;  // Coluna D — quantidade da NF (nunca exibida ao usuário)
}

// Palavras que indicam linha de cabeçalho — será ignorada
const HEADER_WORDS = [
  "descr", "descricao", "descrição", "material", "produto", "item",
  "codigo", "código", "cod", "sku", "ref", "qtd", "quant", "quantidade",
  "preco", "preço", "total", "um", "unid",
];

function isHeaderRow(row: any[]): boolean {
  return row
    .filter(Boolean)
    .map((v) => String(v).toLowerCase().trim())
    .some((t) => HEADER_WORDS.some((kw) => t.startsWith(kw)));
}

export async function parseSpreadsheet(file: File): Promise<SpreadsheetItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  // Prefere aba "Nota", senão usa a primeira
  const sheetName =
    workbook.SheetNames.find((n) =>
      n.toLowerCase().includes("nota")
    ) ?? workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  const items: SpreadsheetItem[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    // Ignora linhas de cabeçalho e linhas de totais/vazias
    if (isHeaderRow(row)) continue;

    const colA = row[0]; // Código / Referência
    const colB = row[1]; // Descrição do produto
    const colD = row[3]; // Quantidade (Quant.)

    // Precisa ter pelo menos descrição ou código
    const descricao = colB ? String(colB).trim() : colA ? String(colA).trim() : "";
    const codigo = colA ? String(colA).trim() : "";

    if (!descricao && !codigo) continue;

    // Ignora linha de totais (coluna A vazia mas coluna F tem "TOTAL")
    if (!colA && String(row[5] ?? "").toLowerCase().includes("total")) continue;

    const qtd = Number(colD);

    items.push({
      description: descricao,
      sku: codigo,
      qtdPlanilha: isNaN(qtd) ? 0 : Math.round(qtd),
    });
  }

  return items.slice(0, 500);
}