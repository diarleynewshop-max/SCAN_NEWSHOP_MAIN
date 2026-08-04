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
  pergunta_key?: string;
  request_id?: string;
  skill?: {
    id: string;
    label: string;
    criterios: string[];
  };
  avisos?: string[];
}

export interface ComprasIaProduto {
  grupo: "mais_pedidos" | "menos_pedidos" | "top" | "citados" | string;
  posicao: number;
  titulo: string;
  codigo: string;
  sku: string;
  descricao: string;
  secao: string;
  fotoUrl: string | null;
  status: string;
  pedidoFeito: boolean | null;
  atualizadoEm: string;
  vezes: number;
  totalPedido: number;
  totalReal: number;
  origem: string;
}

export interface ComprasIaResponse {
  resposta: string;
  contexto: ComprasIaContexto;
  produtos?: ComprasIaProduto[];
  perguntaKey?: string;
  requestId?: string;
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

function normalizarPerguntaCache(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hashPergunta(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function montarQuestionKey(params: ConsultarComprasIaParams): string {
  return hashPergunta(`${params.empresa}|${params.flag}|${normalizarPerguntaCache(params.pergunta)}`);
}

function montarRequestId(questionKey: string): string {
  return `web-${questionKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function consultarComprasIa(params: ConsultarComprasIaParams): Promise<ComprasIaResponse> {
  const questionKey = montarQuestionKey(params);
  const requestId = montarRequestId(questionKey);
  const response = await fetch("/api/compras-ia", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "X-Compras-Ia-Question-Key": questionKey,
      "X-Compras-Ia-Request-Id": requestId,
    },
    body: JSON.stringify({
      ...params,
      questionKey,
      requestId,
    }),
  });

  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    resposta?: string;
    contexto?: ComprasIaContexto;
    produtos?: ComprasIaProduto[];
    pergunta_key?: string;
    request_id?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Falha na IA de Compras (${response.status})`);
  }

  return {
    resposta: String(payload.resposta ?? "").trim(),
    contexto: payload.contexto as ComprasIaContexto,
    produtos: Array.isArray(payload.produtos) ? payload.produtos : [],
    perguntaKey: payload.pergunta_key || payload.contexto?.pergunta_key || questionKey,
    requestId: payload.request_id || payload.contexto?.request_id || requestId,
  };
}

function linhasProdutos(produtos?: ComprasIaProduto[]): string[] {
  if (!produtos?.length) return [];
  return [
    "",
    "Produtos citados:",
    ...produtos.map((produto) => [
      `${produto.posicao}. ${produto.titulo || produto.descricao || produto.codigo}`,
      `   Codigo: ${produto.codigo || "-"}`,
      produto.sku ? `   SKU: ${produto.sku}` : "",
      `   Secao: ${produto.secao || "-"}`,
      `   Pedido: ${produto.totalPedido || 0} | Real: ${produto.totalReal || 0} | Ocorrencias: ${produto.vezes || 0}`,
      produto.status ? `   Status Compras: ${produto.status}` : "",
      produto.fotoUrl ? `   Foto: ${produto.fotoUrl}` : "",
    ].filter(Boolean).join("\n")),
  ];
}

export function baixarComprasIaTxt(pergunta: string, resposta: string, contexto?: ComprasIaContexto, produtos?: ComprasIaProduto[]): void {
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
    ...linhasProdutos(produtos),
  ].filter((linha) => linha !== "");

  baixarBlob(
    nomeArquivo("ia-compras", "txt"),
    new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/plain;charset=utf-8" })
  );
}

export function baixarComprasIaPdf(pergunta: string, resposta: string, contexto?: ComprasIaContexto, produtos?: ComprasIaProduto[]): void {
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

  if (produtos?.length) {
    y += 3;
    write("Produtos citados", 11, true);
    for (const produto of produtos) {
      write(`${produto.posicao}. ${produto.titulo || produto.descricao || produto.codigo}`, 10, true);
      write(`Codigo: ${produto.codigo || "-"}${produto.sku ? ` | SKU: ${produto.sku}` : ""}`, 9);
      write(`Secao: ${produto.secao || "-"} | Pedido: ${produto.totalPedido || 0} | Real: ${produto.totalReal || 0} | Ocorrencias: ${produto.vezes || 0}`, 9);
      if (produto.status) write(`Status Compras: ${produto.status}`, 9);
      if (produto.fotoUrl) write(`Foto: ${produto.fotoUrl}`, 8);
      y += 2;
    }
  }

  doc.save(nomeArquivo("ia-compras", "pdf"));
}
