import jsPDF from "jspdf";

export type ComprasIaTipo = "resumo" | "faltas" | "mais_pedidos" | "prioridades" | "pergunta";
export type ComprasIaTom = "neutro" | "positivo" | "atencao" | "critico";

export interface ComprasIaMetrica {
  id: string;
  label: string;
  valor: string;
  detalhe: string;
  tom: ComprasIaTom;
}

export interface ComprasIaProduto {
  codigo: string;
  sku: string;
  descricao: string;
  secao: string;
  fotoUrl: string | null;
  status: string;
  pedidoFeito: boolean | null;
  atualizadoEm: string;
  ocorrencias: number;
  pedido: number;
  atendido: number;
  falta: number;
  taxaAtendimento: number;
  prioridade: "alta" | "media" | "baixa" | "bloqueada";
  motivo: string;
  score: number;
}

export interface ComprasIaSecao {
  nome: string;
  pedido: number;
  atendido: number;
  falta: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  taxaAtendimento: number;
}

export interface ComprasIaRelatorio {
  id: string;
  titulo: string;
  pergunta: string;
  resumo: string;
  leitura: string;
  origemLeitura: "groq" | "calculada";
  metricas: ComprasIaMetrica[];
  produtos: ComprasIaProduto[];
  secoes: ComprasIaSecao[];
  contexto: {
    empresa: string;
    flag: string;
    inicio: string;
    fim: string;
    periodoDias: number;
    tipo: ComprasIaTipo;
    criterios?: {
      limite: number;
      minimoOcorrencias: number | null;
      ordenacao: "ocorrencias" | "quantidade";
      estruturada: boolean;
    };
    linhasLidas: number;
    geradoEm: string;
    somenteLeitura: boolean;
    avisos: string[];
  };
}

export interface ConsultarComprasIaParams {
  pergunta: string;
  tipo: ComprasIaTipo;
  periodoDias: number;
  empresa: string;
  flag: string;
  actorLogin: string;
}

export async function consultarComprasIa(params: ConsultarComprasIaParams): Promise<ComprasIaRelatorio> {
  const response = await fetch("/api/compras-ia", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    relatorio?: ComprasIaRelatorio;
    error?: string;
  } | null;
  if (!response.ok || !payload?.ok || !payload.relatorio) {
    throw new Error(payload?.error || `Falha ao analisar Compras (${response.status}).`);
  }
  return payload.relatorio;
}

function nomeArquivo(relatorio: ComprasIaRelatorio, extensao: string): string {
  const empresa = relatorio.contexto.empresa.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const data = new Date().toISOString().slice(0, 10);
  return `analise-compras-${empresa}-${data}.${extensao}`;
}

function baixarBlob(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function numeroPt(value: number): string {
  return Math.round(value || 0).toLocaleString("pt-BR");
}

function percentualPt(value: number): string {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function linhasRelatorio(relatorio: ComprasIaRelatorio): string[] {
  const linhas = [
    relatorio.titulo,
    `Empresa: ${relatorio.contexto.empresa} | Operação: ${relatorio.contexto.flag.toUpperCase()}`,
    `Período: ${relatorio.contexto.inicio} a ${relatorio.contexto.fim}`,
    `Gerado em: ${new Date(relatorio.contexto.geradoEm).toLocaleString("pt-BR")}`,
    "Modo: somente leitura",
    "",
    "PERGUNTA",
    relatorio.pergunta,
    "",
    "RESUMO",
    relatorio.resumo,
    "",
    "INDICADORES",
    ...relatorio.metricas.map((metrica) => `${metrica.label}: ${metrica.valor} — ${metrica.detalhe}`),
    "",
    `LEITURA (${relatorio.origemLeitura === "groq" ? "IA" : "calculada"})`,
    relatorio.leitura,
  ];

  if (relatorio.secoes.length) {
    linhas.push("", "SEÇÕES COM MAIOR FALTA");
    relatorio.secoes.forEach((secao, index) => {
      linhas.push(`${index + 1}. ${secao.nome} — Pedido ${numeroPt(secao.pedido)} | Atendido ${numeroPt(secao.atendido)} | Falta ${numeroPt(secao.falta)} | Taxa ${percentualPt(secao.taxaAtendimento)}`);
    });
  }

  if (relatorio.produtos.length) {
    linhas.push("", "PRODUTOS");
    relatorio.produtos.forEach((produto, index) => {
      linhas.push(
        `${index + 1}. ${produto.descricao}`,
        `   Código: ${produto.codigo}${produto.sku ? ` | SKU: ${produto.sku}` : ""} | Seção: ${produto.secao}`,
        `   Pedido: ${numeroPt(produto.pedido)} | Atendido: ${numeroPt(produto.atendido)} | Falta: ${numeroPt(produto.falta)} | Taxa: ${percentualPt(produto.taxaAtendimento)}`,
        `   Prioridade: ${produto.prioridade} | ${produto.motivo}`,
        produto.status ? `   Status em Compras: ${produto.status}` : "",
        produto.fotoUrl ? `   Foto: ${produto.fotoUrl}` : "",
      );
    });
  }

  if (relatorio.contexto.avisos.length) {
    linhas.push("", "AVISOS", ...relatorio.contexto.avisos.map((aviso) => `- ${aviso}`));
  }
  return linhas.filter((linha, index, lista) => linha !== "" || lista[index - 1] !== "");
}

export function baixarComprasIaTxt(relatorio: ComprasIaRelatorio): void {
  const conteudo = `\uFEFF${linhasRelatorio(relatorio).join("\n")}`;
  baixarBlob(nomeArquivo(relatorio, "txt"), new Blob([conteudo], { type: "text/plain;charset=utf-8" }));
}

function novaPaginaSeNecessario(doc: jsPDF, y: number, altura = 12): number {
  if (y + altura <= doc.internal.pageSize.getHeight() - 14) return y;
  doc.addPage();
  return 16;
}

function escreverLinha(doc: jsPDF, textoLinha: string, y: number, opcoes?: { tamanho?: number; negrito?: boolean; cor?: [number, number, number] }): number {
  const tamanho = opcoes?.tamanho ?? 9;
  const linhas = doc.splitTextToSize(textoLinha || "-", 182);
  y = novaPaginaSeNecessario(doc, y, linhas.length * 5 + 2);
  doc.setFont("helvetica", opcoes?.negrito ? "bold" : "normal");
  doc.setFontSize(tamanho);
  doc.setTextColor(...(opcoes?.cor ?? [30, 41, 59]));
  doc.text(linhas, 14, y);
  return y + linhas.length * (tamanho * 0.42 + 1.3);
}

export function baixarComprasIaPdf(relatorio: ComprasIaRelatorio): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  let y = 0;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, largura, 34, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(relatorio.titulo, 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${relatorio.contexto.empresa} | ${relatorio.contexto.inicio} a ${relatorio.contexto.fim} | Somente leitura`, 14, 24);
  y = 43;

  y = escreverLinha(doc, relatorio.resumo, y, { tamanho: 11, negrito: true });
  y += 4;

  const cardLargura = 43.5;
  relatorio.metricas.slice(0, 4).forEach((metrica, index) => {
    const x = 14 + index * (cardLargura + 2);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x, y, cardLargura, 25, 2, 2, "F");
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(metrica.label.toUpperCase(), x + 3, y + 6);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(metrica.valor, x + 3, y + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(doc.splitTextToSize(metrica.detalhe, cardLargura - 6).slice(0, 2), x + 3, y + 19);
  });
  y += 34;

  y = escreverLinha(doc, "Leitura do analista", y, { tamanho: 11, negrito: true, cor: [15, 23, 42] });
  for (const linha of relatorio.leitura.split(/\r?\n/).filter(Boolean)) {
    y = escreverLinha(doc, linha, y, { tamanho: 9 });
  }

  if (relatorio.secoes.length) {
    y += 4;
    y = escreverLinha(doc, "Seções com maior falta", y, { tamanho: 11, negrito: true });
    relatorio.secoes.slice(0, 6).forEach((secao, index) => {
      y = escreverLinha(doc, `${index + 1}. ${secao.nome} — falta ${numeroPt(secao.falta)} | atendimento ${percentualPt(secao.taxaAtendimento)}`, y);
    });
  }

  if (relatorio.produtos.length) {
    y += 4;
    y = escreverLinha(doc, "Produtos", y, { tamanho: 11, negrito: true });
    relatorio.produtos.forEach((produto, index) => {
      y = novaPaginaSeNecessario(doc, y, 23);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, y - 3, 182, 20, 2, 2, "F");
      y = escreverLinha(doc, `${index + 1}. ${produto.descricao}`, y + 2, { tamanho: 9, negrito: true });
      y = escreverLinha(doc, `Cód. ${produto.codigo}${produto.sku ? ` | SKU ${produto.sku}` : ""} | ${produto.secao}`, y, { tamanho: 7.5, cor: [71, 85, 105] });
      y = escreverLinha(doc, `Pedido ${numeroPt(produto.pedido)} | Atendido ${numeroPt(produto.atendido)} | Falta ${numeroPt(produto.falta)} | Prioridade ${produto.prioridade}`, y, { tamanho: 7.5 });
      y += 4;
    });
  }

  doc.save(nomeArquivo(relatorio, "pdf"));
}
