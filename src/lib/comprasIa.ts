import jsPDF from "jspdf";

export type ComprasIaRole = "user" | "assistant";

export interface ComprasIaMessage {
  role: ComprasIaRole;
  content: string;
}

export interface ComprasIaContexto {
  periodo_inicio: string;
  periodo_fim: string;
  empresa: string;
  flag: string;
  linhas_item_frequencia: number;
  linhas_compras: number;
  linhas_pedidos: number;
  avisos?: string[];
}

export interface ComprasIaResponse {
  resposta: string;
  contexto: ComprasIaContexto;
}

export interface ConsultarComprasIaParams {
  pergunta: string;
  historico: ComprasIaMessage[];
  empresa: string;
  flag: string;
  actorLogin: string;
  actorSenha: string;
}

function nomeArquivo(prefixo: string, extensao: string): string {
  const agora = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${prefixo}-${agora}.${extensao}`;
}

function baixarBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function consultarComprasIa(params: ConsultarComprasIaParams): Promise<ComprasIaResponse> {
  const response = await fetch("/api/compras-ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    resposta?: string;
    contexto?: ComprasIaContexto;
    error?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Falha na IA de Compras (${response.status})`);
  }

  return {
    resposta: String(payload.resposta ?? "").trim(),
    contexto: payload.contexto as ComprasIaContexto,
  };
}

export function baixarComprasIaTxt(pergunta: string, resposta: string, contexto?: ComprasIaContexto): void {
  const linhas = [
    "Relatorio IA Compras",
    `Gerado em: ${new Date().toLocaleString("pt-BR")}`,
    contexto ? `Empresa: ${contexto.empresa} | Flag: ${contexto.flag}` : "",
    contexto ? `Periodo lido: ${contexto.periodo_inicio} ate ${contexto.periodo_fim}` : "",
    "",
    "Pergunta:",
    pergunta,
    "",
    "Resposta:",
    resposta,
  ].filter((linha) => linha !== "");

  baixarBlob(
    nomeArquivo("ia-compras", "txt"),
    new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/plain;charset=utf-8" })
  );
}

export function baixarComprasIaPdf(pergunta: string, resposta: string, contexto?: ComprasIaContexto): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const maxWidth = pageWidth - margin * 2;
  let y = 16;

  const write = (text: string, size = 10, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text || "-", maxWidth);
    for (const line of lines) {
      if (y > pageHeight - 16) {
        doc.addPage();
        y = 16;
      }
      doc.text(line, margin, y);
      y += size * 0.45 + 2;
    }
  };

  write("Relatorio IA Compras", 14, true);
  write(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 9);
  if (contexto) {
    write(`Empresa: ${contexto.empresa} | Flag: ${contexto.flag}`, 9);
    write(`Periodo lido: ${contexto.periodo_inicio} ate ${contexto.periodo_fim}`, 9);
  }

  y += 4;
  write("Pergunta", 11, true);
  write(pergunta, 10);
  y += 3;
  write("Resposta", 11, true);
  write(resposta, 10);

  doc.save(nomeArquivo("ia-compras", "pdf"));
}
