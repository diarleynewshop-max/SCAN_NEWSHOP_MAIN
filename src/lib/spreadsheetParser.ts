import * as XLSX from "xlsx";

export interface SpreadsheetItem {
  description: string;
  qtdPlanilha: number; // Coluna D — nunca exibida ao usuário
}

export async function parseSpreadsheet(file: File): Promise<SpreadsheetItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  const items: SpreadsheetItem[] = [];

  for (let i = 0; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;

    const colA = row[0]; // Descrição (coluna A)
    const colD = row[3]; // Quantidade da planilha (coluna D, índice 3)

    if (colA && String(colA).trim()) {
      const qtd = Number(colD);
      items.push({
        description: String(colA).trim(),
        qtdPlanilha: isNaN(qtd) ? 0 : qtd,
      });
    }
  }

  return items.slice(0, 200);
}