import { task } from "@trigger.dev/sdk/v3";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Credenciais NEWSHOP ───────────────────────────────────────────────────────
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID ?? "901325900510";
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510";
const CLICKUP_TODO_LIST_ID =
  process.env.CLICKUP_TODO_LIST_ID ?? "901326684020"; // COMPRAS

// ── Helpers ───────────────────────────────────────────────────────────────────
async function criarTarefaClickUp(
  listId: string,
  nome: string,
  descricao: string,
  status: string
): Promise<string> {
  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: nome, description: descricao, status }),
    }
  );
  const data = await response.json();
  console.log("Resposta ClickUp completa:", JSON.stringify(data));
  console.log("Tarefa criada, ID:", data.id);
  return data.id;
}

async function anexarJsonNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: object
) {
  try {
    const jsonString = JSON.stringify(conteudo, null, 2);
    const boundary =
      "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="attachment"; filename="${nomeArquivo}.json"`,
      `Content-Type: application/json`,
      ``,
      jsonString,
      `--${boundary}--`,
    ].join("\r\n");
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    console.log("JSON STATUS:", response.status);
  } catch (err) {
    console.error("Erro ao anexar JSON:", err);
  }
}

async function anexarTxtNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: string
) {
  try {
    const boundary =
      "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="attachment"; filename="${nomeArquivo}.txt"`,
      `Content-Type: text/plain`,
      ``,
      conteudo,
      `--${boundary}--`,
    ].join("\r\n");
    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      }
    );
    console.log("TXT STATUS:", response.status);
  } catch (err) {
    console.error("Erro ao anexar TXT:", err);
  }
}

// ── NOVO: Upload de PDF usando Blob/FormData real (não corrompe binário) ─────
async function anexarPDFNaTarefa(
  taskId: string,
  pdfBuffer: Buffer,
  filename: string
) {
  try {
    // Cria um Blob real a partir do Buffer
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });

    // Usa FormData nativo para montar o multipart corretamente
    const formData = new FormData();
    formData.append("attachment", blob, filename);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          // NÃO definir Content-Type — o fetch define automaticamente com o boundary correto
        },
        body: formData,
      }
    );

    const responseText = await response.text();
    console.log(`PDF anexado — Status: ${response.status} — Resposta: ${responseText}`);

    if (!response.ok) {
      throw new Error(`Erro ao anexar PDF: ${response.status} — ${responseText}`);
    }
  } catch (err) {
    console.error("Erro ao anexar PDF:", err);
    throw err;
  }
}

// ── NOVO: Gerar PDF de Conferência com FOTOS e STATUS ────────────────────────
function gerarPDFConferencia(payload: any): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ══════════════════════════════════════════════════════════════
  // CABEÇALHO
  // ══════════════════════════════════════════════════════════════
  doc.setFillColor(41, 128, 185);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE CONFERÊNCIA", pageWidth / 2, 18, {
    align: "center",
  });

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${payload.empresa ?? "NEWSHOP"} — ${payload.flag === "cd" ? "CD" : "LOJA"}`,
    pageWidth / 2,
    30,
    { align: "center" }
  );

  // ══════════════════════════════════════════════════════════════
  // INFORMAÇÕES GERAIS
  // ══════════════════════════════════════════════════════════════
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);

  const dataFormatada = payload.dataConferencia
    ? new Date(payload.dataConferencia).toLocaleString("pt-BR")
    : new Date().toLocaleString("pt-BR");

  const infoY = 50;
  doc.setFont("helvetica", "bold");
  doc.text("Conferente:", 14, infoY);
  doc.setFont("helvetica", "normal");
  doc.text(payload.conferente ?? "-", 50, infoY);

  doc.setFont("helvetica", "bold");
  doc.text("Data:", 14, infoY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(dataFormatada, 50, infoY + 7);

  doc.setFont("helvetica", "bold");
  doc.text("Tempo:", 14, infoY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(payload.tempo ?? "-", 50, infoY + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Total itens:", 14, infoY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(
    String(payload.totalItens ?? payload.itens?.length ?? 0),
    50,
    infoY + 21
  );

  // ══════════════════════════════════════════════════════════════
  // RESUMO (cards coloridos)
  // ══════════════════════════════════════════════════════════════
  const resumoY = infoY + 32;
  const resumo = payload.resumo ?? {
    separado: 0,
    naoTem: 0,
    parcial: 0,
    pendente: 0,
  };

  const cards = [
    {
      label: "Separado",
      value: resumo.separado,
      color: [39, 174, 96] as [number, number, number],
    },
    {
      label: "Não tem",
      value: resumo.naoTem,
      color: [231, 76, 60] as [number, number, number],
    },
    {
      label: "Parcial",
      value: resumo.parcial,
      color: [243, 156, 18] as [number, number, number],
    },
    {
      label: "Pendente",
      value: resumo.pendente,
      color: [149, 165, 166] as [number, number, number],
    },
  ];

  const cardWidth = (pageWidth - 28 - 15) / 4; // 14 margem cada lado + 5px gap entre
  cards.forEach((card, i) => {
    const x = 14 + i * (cardWidth + 5);
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.roundedRect(x, resumoY, cardWidth, 20, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(card.label, x + cardWidth / 2, resumoY + 8, {
      align: "center",
    });
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(String(card.value ?? 0), x + cardWidth / 2, resumoY + 17, {
      align: "center",
    });
  });

  // ══════════════════════════════════════════════════════════════
  // TABELA RESUMIDA DE TODOS OS ITENS
  // ══════════════════════════════════════════════════════════════
  doc.setTextColor(0, 0, 0);

  const statusLabel: Record<string, string> = {
    separado: "SEPARADO",
    nao_tem: "NÃO TEM",
    nao_tem_tudo: "PARCIAL",
    pendente: "PENDENTE",
  };

  const statusColor: Record<string, [number, number, number]> = {
    separado: [39, 174, 96],
    nao_tem: [231, 76, 60],
    nao_tem_tudo: [243, 156, 18],
    pendente: [149, 165, 166],
  };

  const tableData = (payload.itens || []).map((item: any, idx: number) => [
    String(idx + 1),
    item.codigo ?? "-",
    item.sku || "-",
    String(item.quantidadePedida ?? "-"),
    String(item.quantidadeReal ?? "-"),
    statusLabel[item.status] ?? item.status,
    item.photo ? "SIM" : "NÃO",
  ]);

  autoTable(doc, {
    startY: resumoY + 28,
    head: [["#", "Código", "SKU", "Pedido", "Real", "Status", "Foto"]],
    body: tableData,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { halign: "center" },
      4: { halign: "center" },
      5: { halign: "center" },
      6: { halign: "center" },
    },
    // Colore a célula de status com a cor correspondente
    didParseCell: (data: any) => {
      if (data.section === "body" && data.column.index === 5) {
        const item = (payload.itens || [])[data.row.index];
        if (item && statusColor[item.status]) {
          data.cell.styles.fillColor = statusColor[item.status];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  // ══════════════════════════════════════════════════════════════
  // PÁGINAS DE FOTOS — cada item com foto ganha um bloco
  // ══════════════════════════════════════════════════════════════
  const itensComFoto = (payload.itens || []).filter(
    (item: any) => item.photo
  );

  if (itensComFoto.length > 0) {
    doc.addPage();

    // Título da seção de fotos
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, pageWidth, 25, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("FOTOS DOS ITENS", pageWidth / 2, 16, { align: "center" });

    let yPos = 35;
    const fotoWidth = 55;
    const fotoHeight = 55;
    const blocoHeight = fotoHeight + 25; // foto + info

    itensComFoto.forEach((item: any, idx: number) => {
      // Verifica se precisa de nova página
      if (yPos + blocoHeight > doc.internal.pageSize.getHeight() - 15) {
        doc.addPage();
        yPos = 20;
      }

      // ── Card do item ──
      const cardX = 12;
      const cardW = pageWidth - 24;

      // Fundo do card
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(cardX, yPos - 5, cardW, blocoHeight, 3, 3, "F");

      // Borda com cor do status
      const borderColor = statusColor[item.status] ?? [149, 165, 166];
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(1.5);
      doc.roundedRect(cardX, yPos - 5, cardW, blocoHeight, 3, 3, "S");

      // Badge de status
      const badgeColor = statusColor[item.status] ?? [149, 165, 166];
      const badgeText = statusLabel[item.status] ?? item.status;
      const badgeWidth = doc.getTextWidth(badgeText) + 10;
      doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
      doc.roundedRect(cardX + cardW - badgeWidth - 5, yPos - 2, badgeWidth, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text(
        badgeText,
        cardX + cardW - badgeWidth / 2 - 5,
        yPos + 5,
        { align: "center" }
      );

      // Info do item (lado direito da foto)
      const infoX = cardX + fotoWidth + 15;
      doc.setTextColor(0, 0, 0);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(`#${idx + 1}`, cardX + 5, yPos + 5);

      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Código:", infoX, yPos + 5);
      doc.setFont("helvetica", "normal");
      doc.text(item.codigo ?? "-", infoX + 22, yPos + 5);

      doc.setFont("helvetica", "bold");
      doc.text("SKU:", infoX, yPos + 13);
      doc.setFont("helvetica", "normal");
      doc.text(item.sku || "-", infoX + 22, yPos + 13);

      doc.setFont("helvetica", "bold");
      doc.text("Pedido:", infoX, yPos + 21);
      doc.setFont("helvetica", "normal");
      doc.text(String(item.quantidadePedida ?? "-"), infoX + 22, yPos + 21);

      doc.setFont("helvetica", "bold");
      doc.text("Real:", infoX, yPos + 29);
      doc.setFont("helvetica", "normal");
      doc.text(String(item.quantidadeReal ?? "-"), infoX + 22, yPos + 29);

      // Foto
      try {
        let imgData = item.photo;
        if (!imgData.startsWith("data:image/")) {
          imgData = `data:image/jpeg;base64,${imgData}`;
        }
        doc.addImage(
          imgData,
          "JPEG",
          cardX + 5,
          yPos + 10,
          fotoWidth,
          fotoHeight
        );
      } catch (err) {
        console.error(`Erro ao adicionar foto do item ${item.codigo}:`, err);
        doc.setTextColor(200, 0, 0);
        doc.setFontSize(9);
        doc.text("Erro ao carregar foto", cardX + 5, yPos + 35);
        doc.setTextColor(0, 0, 0);
      }

      yPos += blocoHeight + 10;
    });
  }

  // ══════════════════════════════════════════════════════════════
  // RODAPÉ em todas as páginas
  // ══════════════════════════════════════════════════════════════
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `SCAN NEWSHOP — Página ${i} de ${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ── TASK 1 — Lista baixada ────────────────────────────────────────────────────
export const listaBaixada = task({
  id: "lista-baixada",
  machine: "micro",
  maxDuration: 30,
  run: async (payload: any) => {
    const dataFormatada = payload.dataDownload
      ? new Date(payload.dataDownload).toLocaleString("pt-BR", {
          timeZone: "America/Fortaleza",
        })
      : new Date().toLocaleString("pt-BR", {
          timeZone: "America/Fortaleza",
        });

    const isCD = payload.flag === "cd";
    const listId = isCD ? CLICKUP_CD_LIST_ID : CLICKUP_LIST_ID;
    const status = isCD ? "EM CONFERENCIA" : "to do";
    const flagLabel = isCD ? "CD" : "LOJA";

    const taskId = await criarTarefaClickUp(
      listId,
      `📦 ${payload.titulo} — ${payload.pessoa}`,
      `Pessoa: ${payload.pessoa}
Título: ${payload.titulo}
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${flagLabel}
Itens: ${payload.totalItens}
Data: ${dataFormatada}`,
      status
    );

    await Promise.all([
      anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
        type: "conference-file",
        empresa: payload.empresa ?? "NEWSHOP",
        flag: payload.flag ?? "loja",
        items: payload.produtos.map((p: any) => ({
          codigo: p.barcode,
          sku: p.sku || "",
          quantidade: p.quantity ?? p.quantidade,
          photo: p.photo || null,
        })),
      }),
      anexarTxtNaTarefa(
        taskId,
        `lista_${payload.pessoa}`,
        (() => {
          const soCodigosBloco = payload.produtos
            .map((p: any) => p.barcode)
            .join("\n");
          const codigoQuantidadeBloco = payload.produtos
            .map(
              (p: any) => `${p.barcode};${p.quantity ?? p.quantidade}`
            )
            .join("\n");
          return `Codigo\n${soCodigosBloco}\n\n------------------------\n\nCodigo;Quantidade\n${codigoQuantidadeBloco}`;
        })()
      ),
    ]);
  },
});

// ── TASK 2 — Conferência finalizada ──────────────────────────────────────────
export const conferenciaBaixada = task({
  id: "conferencia-baixada",
  machine: "micro",
  maxDuration: 60, // aumentei pq gerar PDF com fotos pode demorar
  run: async (payload: any) => {
    const dataFormatada = payload.dataConferencia
      ? new Date(payload.dataConferencia).toLocaleString("pt-BR", {
          timeZone: "America/Fortaleza",
        })
      : new Date().toLocaleString("pt-BR", {
          timeZone: "America/Fortaleza",
        });

    const isCD = payload.flag === "cd";
    const listId = isCD ? CLICKUP_CD_LIST_ID : CLICKUP_LIST_ID;

    const statusMap: Record<string, string> = {
      separado: "✅ Separado",
      nao_tem: "❌ Nao tem",
      nao_tem_tudo: "⚠️ Parcial",
      pendente: "⏳ Pendente",
    };

    const itensS = payload.itens.filter((i: any) => i.digito === "S");
    const itensM = payload.itens.filter((i: any) => i.digito === "M");
    const itensSemDigito = payload.itens.filter((i: any) => !i.digito);

    const formatarItem = (item: any, idx: number) =>
      `${idx + 1}. Codigo: ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? "-"} | ${statusMap[item.status] ?? item.status}`;

    let itensTexto = "";
    if (itensS.length > 0)
      itensTexto += `{S}\n${itensS.map(formatarItem).join("\n")}`;
    if (itensM.length > 0) {
      if (itensTexto)
        itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `{M}\n${itensM.map(formatarItem).join("\n")}`;
    }
    if (itensSemDigito.length > 0) {
      if (itensTexto)
        itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `Sem categoria\n${itensSemDigito.map(formatarItem).join("\n")}`;
    }

    // ── 1. Cria tarefa original na lista de conferência ──
    const tarefaOriginalId = await criarTarefaClickUp(
      listId,
      `✅ ${payload.conferente} — ${dataFormatada}`,
      `Conferente: ${payload.conferente}
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens} item(ns)

📊 RESUMO
✅ Separado: ${payload.resumo.separado}
❌ Não tem: ${payload.resumo.naoTem}
⚠️ Parcial: ${payload.resumo.parcial}
⏳ Pendente: ${payload.resumo.pendente}

📦 ITENS
${itensTexto}`,
      "complete"
    );

    console.log(`Tarefa de conferência criada: ${tarefaOriginalId}`);

    // ── 2. Gera PDF e envia para lista de COMPRAS (TO-DO) ──
    try {
      console.log("Gerando PDF da conferência...");
      const pdfBuffer = gerarPDFConferencia(payload);
      console.log(`PDF gerado — ${pdfBuffer.length} bytes`);

      // Monta descrição detalhada para a task de compras
      const itensNaoTem = (payload.itens || []).filter(
        (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
      );

      const listaFaltantes = itensNaoTem
        .map(
          (item: any, idx: number) =>
            `${idx + 1}. ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? 0} | ${statusMap[item.status] ?? item.status}`
        )
        .join("\n");

      const todoTaskId = await criarTarefaClickUp(
        CLICKUP_TODO_LIST_ID,
        `🛒 Compras: ${payload.conferente} — ${dataFormatada}`,
        `Relatório gerado automaticamente após conferência.

📋 INFORMAÇÕES
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
Data: ${dataFormatada}
Total itens conferidos: ${payload.totalItens}

📊 RESUMO
✅ Separado: ${payload.resumo?.separado ?? 0}
❌ Não tem: ${payload.resumo?.naoTem ?? 0}
⚠️ Parcial: ${payload.resumo?.parcial ?? 0}
⏳ Pendente: ${payload.resumo?.pendente ?? 0}

🛒 ITENS FALTANTES (${itensNaoTem.length})
${listaFaltantes || "Nenhum item faltante."}

📎 PDF com fotos anexado abaixo.`,
        "to do"
      );

      console.log(`Tarefa de COMPRAS criada: ${todoTaskId}`);

      // Anexa o PDF
      const nomeArquivo = `conferencia_${payload.conferente}_${Date.now()}.pdf`;
      await anexarPDFNaTarefa(todoTaskId, pdfBuffer, nomeArquivo);

      console.log("PDF anexado com sucesso na tarefa de COMPRAS!");

      // Também anexa o JSON para referência
      await anexarJsonNaTarefa(
        todoTaskId,
        `conferencia_${payload.conferente}`,
        {
          type: "conference-result",
          empresa: payload.empresa ?? "NEWSHOP",
          flag: payload.flag ?? "loja",
          conferente: payload.conferente,
          data: dataFormatada,
          resumo: payload.resumo,
          itens: payload.itens,
        }
      );

      console.log("JSON também anexado na tarefa de COMPRAS!");
    } catch (err) {
      console.error("Erro ao criar tarefa de COMPRAS ou anexar PDF:", err);
    }
  },
});
