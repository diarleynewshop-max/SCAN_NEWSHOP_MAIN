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

// Lê o arquivo como ArrayBuffer usando FileReader (mais compatível com Android/iOS)
function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
      } else {
        reject(new Error("Falha ao ler arquivo como ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler arquivo: " + reader.error?.message));
    reader.readAsArrayBuffer(file);
  });
}

function parseBuffer(buffer: ArrayBuffer): SpreadsheetItem[] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });

  // Prefere aba "Nota", senão usa a primeira
  const sheetName =
    workbook.SheetNames.find((n) => n.toLowerCase().includes("nota")) ??
    workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  const items: SpreadsheetItem[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    if (isHeaderRow(row)) continue;

    const colA = row[0]; // Código / Referência
    const colB = row[1]; // Descrição do produto
    const colD = row[3]; // Quantidade (Quant.)

    const descricao = colB ? String(colB).trim() : colA ? String(colA).trim() : "";
    const codigo = colA ? String(colA).trim() : "";

    if (!descricao && !codigo) continue;

    // Ignora linhas de total (coluna A vazia e coluna F contém "total")
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

// Para CSV: lê como texto e converte para ArrayBuffer via Blob
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string ?? "");
    reader.onerror = () => reject(new Error("Erro ao ler CSV"));
    reader.readAsText(file, "UTF-8");
  });
}

function parseCSV(text: string): SpreadsheetItem[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const items: SpreadsheetItem[] = [];

  for (const line of lines) {
    // Suporta ; e , como separador
    const sep = line.includes(";") ? ";" : ",";
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));

    const row = cols;
    if (isHeaderRow(row)) continue;

    const colA = cols[0] ?? "";
    const colB = cols[1] ?? "";
    const colD = cols[3] ?? "";

    const descricao = colB || colA;
    const codigo = colA;

    if (!descricao && !codigo) continue;

    const qtd = Number(colD);
    items.push({
      description: descricao,
      sku: codigo,
      qtdPlanilha: isNaN(qtd) ? 0 : Math.round(qtd),
    });
  }

  return items.slice(0, 500);
}

export async function parseSpreadsheet(file: File): Promise<SpreadsheetItem[]> {
  const isCSV = file.name.toLowerCase().endsWith(".csv") 
    file.type === "text/csv" ||
    file.type === "text/plain";

  if (isCSV) {
    const text = await readFileAsText(file);
    if (!text.trim()) throw new Error("Arquivo CSV vazio ou ilegível");
    return parseCSV(text);
  }

  // XLSX / XLS — usa FileReader (mais confiável no Android que file.arrayBuffer())
  const buffer = await readFileAsArrayBuffer(file);
  if (buffer.byteLength === 0) throw new Error("Arquivo vazio ou sem permissão de leitura");
  return parseBuffer(buffer);
}