import * as XLSX from "xlsx";

export interface SpreadsheetItem {
  description: string;
}

export async function parseSpreadsheet(file: File): Promise<SpreadsheetItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 });
  
  if (jsonData.length <= 1) {
    return [];
  }
  
  const items: SpreadsheetItem[] = [];
  
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    
    const colA = row[0];
    if (colA && typeof colA === "string" && colA.trim()) {
      items.push({
        description: colA.trim(),
      });
    }
  }
  
  return items.slice(0, 200);
}