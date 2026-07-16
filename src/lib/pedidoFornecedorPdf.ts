import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { getCompanyLogo } from "@/lib/companyTheme";

type EmpresaTema = "NEWSHOP" | "SOYE" | "FACIL";

export interface ItemPedidoPdf {
  codigo: string;
  sku?: string | null;
  descricao: string;
  foto: string | null;
  secao?: string | null;
  quantidadePedido: number | null;
  unidadesPorCaixa: number | null;
  caixasPedido: number | null;
}

export interface PedidoFornecedorPdf {
  fornecedorId: string;
  fornecedorNome: string;
  blob: Blob;
  dataUrl: string;
  filename: string;
  totalItens: number;
}

export interface PedidoFornecedorExcel {
  fornecedorId: string;
  fornecedorNome: string;
  blob: Blob;
  filename: string;
  totalItens: number;
}

const EMPRESA_INFO: Record<EmpresaTema, { nomeCliente: string; cor: [number, number, number] }> = {
  NEWSHOP: {
    nomeCliente: "Newshop Comercio LTDA - 45.998.339/0001-67",
    cor: [79, 70, 229],
  },
  FACIL: {
    nomeCliente: "Facil Atacado Comercio Atacadista de Variedades LTDA - 50.767.035/0002-00",
    cor: [22, 163, 74],
  },
  SOYE: {
    nomeCliente: "Soye Comercio de Variedades LTDA - 62.803.717/0001-29",
    cor: [217, 119, 6],
  },
};

function normalizarEmpresa(empresa?: unknown): EmpresaTema {
  const value = String(empresa ?? "").toUpperCase();
  if (value.includes("SOYE")) return "SOYE";
  if (value.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function nomeArquivoSeguro(valor: string): string {
  return (
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "fornecedor"
  );
}

function formatarNumero(valor: number | null | undefined): string {
  if (valor == null || !Number.isFinite(valor)) return "-";
  return String(valor);
}

async function fetchComoDataUrl(src: string): Promise<string | null> {
  try {
    if (src.startsWith("data:")) return src;
    const resposta = await fetch(src);
    if (!resposta.ok) return null;
    const blob = await resposta.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function prepararImagemParaPdf(src: string, maxSize = 640): Promise<string | null> {
  try {
    const dataUrl = await fetchComoDataUrl(src);
    if (!dataUrl) return null;

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Falha ao carregar imagem"));
      img.src = dataUrl;
    });

    const maiorLado = Math.max(img.width, img.height);
    if (maiorLado <= maxSize && dataUrl.startsWith("data:image/jpeg")) return dataUrl;

    const escala = Math.min(1, maxSize / maiorLado);
    const width = Math.max(1, Math.round(img.width * escala));
    const height = Math.max(1, Math.round(img.height * escala));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}

async function carregarLogoEmpresa(empresa: EmpresaTema): Promise<string | null> {
  const logoPath = getCompanyLogo(empresa);
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  return fetchComoDataUrl(`${origem}${logoPath}`);
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Falha ao converter arquivo"));
    reader.readAsDataURL(blob);
  });
}

function adicionarCabecalho(
  doc: jsPDF,
  empresa: EmpresaTema,
  fornecedorNome: string,
  totalItens: number,
  logoDataUrl: string | null,
  dataFormatada: string,
) {
  const info = EMPRESA_INFO[empresa];
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...info.cor);
  doc.rect(0, 0, pageWidth, 34, "F");

  if (logoDataUrl) {
    try {
      const formato = logoDataUrl.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(logoDataUrl, formato, 14, 6, 24, 20);
    } catch {
      // Se a logo falhar, o cabecalho continua.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Pedido de Compra", logoDataUrl ? 44 : 14, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nome do Cliente: ${info.nomeCliente}`, logoDataUrl ? 44 : 14, 21, { maxWidth: pageWidth - 58 });
  doc.text(`Fornecedor: ${fornecedorNome}`, logoDataUrl ? 44 : 14, 27, { maxWidth: pageWidth - 58 });
  doc.text(`Data: ${dataFormatada}  |  Itens: ${totalItens}`, pageWidth - 14, 27, { align: "right" });
  doc.setTextColor(34, 34, 34);
}

function montarLinhasExcel(itens: ItemPedidoPdf[]) {
  return itens.map((item, index) => ({
    Ordem: index + 1,
    Codigo: item.codigo,
    SKU: item.sku || "",
    Descricao: item.descricao || "",
    Secao: item.secao || "",
    QuantidadePedido: item.quantidadePedido ?? "",
    UnidadesPorCaixa: item.unidadesPorCaixa ?? "",
    CaixasPedido: item.caixasPedido ?? "",
    Foto: item.foto || "",
  }));
}

export async function gerarPdfPedidoFornecedor(
  empresa: EmpresaTema | string,
  fornecedorId: string,
  fornecedorNome: string,
  itens: ItemPedidoPdf[]
): Promise<PedidoFornecedorPdf> {
  const empresaNormalizada = normalizarEmpresa(empresa);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const dataFormatada = new Date().toLocaleDateString("pt-BR");
  const logoDataUrl = await carregarLogoEmpresa(empresaNormalizada);
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  adicionarCabecalho(doc, empresaNormalizada, fornecedorNome, itens.length, logoDataUrl, dataFormatada);

  let y = 42;
  for (let i = 0; i < itens.length; i += 1) {
    const item = itens[i];
    const descricaoLinhas = doc.splitTextToSize(item.descricao || "(sem descricao)", 104);
    const blocoAltura = Math.max(40, 16 + descricaoLinhas.length * 5 + 16);
    if (y + blocoAltura > pageHeight - 12) {
      doc.addPage();
      adicionarCabecalho(doc, empresaNormalizada, fornecedorNome, itens.length, logoDataUrl, dataFormatada);
      y = 42;
    }

    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(12, y, pageWidth - 24, blocoAltura, 3, 3, "S");

    const imagem = item.foto ? await prepararImagemParaPdf(item.foto) : null;
    if (imagem) {
      try {
        const formato = imagem.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(imagem, formato, 16, y + 4, 28, 28);
      } catch {
        // Imagem invalida nao derruba o documento.
      }
    } else {
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(16, y + 4, 28, 28, 2, 2, "F");
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.text("sem foto", 30, y + 20, { align: "center" });
      doc.setTextColor(34, 34, 34);
    }

    const textX = 48;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${i + 1}. ${item.codigo}`, textX, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.text(descricaoLinhas, textX, y + 15);

    const metaY = y + 24 + descricaoLinhas.length * 5;
    const secaoTexto = item.secao?.trim() ? `Secao: ${item.secao}` : "Secao: -";
    doc.setFontSize(9);
    doc.text(secaoTexto, textX, metaY);
    doc.text(`Qtd. a pedir: ${formatarNumero(item.quantidadePedido)}`, textX, metaY + 6);
    doc.text(`Un. por caixa: ${formatarNumero(item.unidadesPorCaixa)}`, textX + 52, metaY + 6);
    doc.text(`Caixas: ${formatarNumero(item.caixasPedido)}`, textX + 104, metaY + 6);

    y += blocoAltura + 6;
  }

  const blob = doc.output("blob");
  const dataUrl = await blobToDataUrl(blob);
  const filename = `pedido_${nomeArquivoSeguro(fornecedorNome)}_${dataFormatada.replace(/\//g, "-")}.pdf`;
  return { fornecedorId, fornecedorNome, blob, dataUrl, filename, totalItens: itens.length };
}

export async function gerarExcelPedidoFornecedor(
  empresa: EmpresaTema | string,
  fornecedorId: string,
  fornecedorNome: string,
  itens: ItemPedidoPdf[]
): Promise<PedidoFornecedorExcel> {
  const empresaNormalizada = normalizarEmpresa(empresa);
  const dataFormatada = new Date().toLocaleDateString("pt-BR");
  const info = EMPRESA_INFO[empresaNormalizada];
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(montarLinhasExcel(itens));

  XLSX.utils.sheet_add_aoa(sheet, [
    ["Pedido de Compra"],
    [`Nome do Cliente: ${info.nomeCliente}`],
    [`Fornecedor: ${fornecedorNome}`],
    [`Data: ${dataFormatada}`, "", "", `Itens: ${itens.length}`],
  ], { origin: "A1" });

  sheet["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 14 },
    { wch: 50 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 50 },
  ];

  XLSX.utils.book_append_sheet(workbook, sheet, "Pedido");
  const arrayBuffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return {
    fornecedorId,
    fornecedorNome,
    blob,
    filename: `pedido_${nomeArquivoSeguro(fornecedorNome)}_${dataFormatada.replace(/\//g, "-")}.xlsx`,
    totalItens: itens.length,
  };
}

export function baixarPdfNoNavegador(pdf: PedidoFornecedorPdf): void {
  const url = URL.createObjectURL(pdf.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = pdf.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baixarExcelNoNavegador(arquivo: PedidoFornecedorExcel): void {
  const url = URL.createObjectURL(arquivo.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = arquivo.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
