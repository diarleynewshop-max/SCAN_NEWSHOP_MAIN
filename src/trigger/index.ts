import { task } from "@trigger.dev/sdk/v3";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Credenciais NEWSHOP ───────────────────────────────────────────────────────
const CLICKUP_TOKEN      = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID    = process.env.CLICKUP_LIST_ID    ?? "901325900510"; // LOJA NEWSHOP
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510"; // CD NEWSHOP
const CLICKUP_TODO_LIST_ID = process.env.CLICKUP_TODO_LIST_ID ?? "901326684020"; // COMPRAS 

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

async function anexarJsonNaTarefa(taskId: string, nomeArquivo: string, conteudo: object) {
  try {
    const jsonString = JSON.stringify(conteudo, null, 2);
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
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

async function anexarTxtNaTarefa(taskId: string, nomeArquivo: string, conteudo: string) {
  try {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
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

async function anexarPDFNaTarefa(taskId: string, pdfBuffer: Buffer, filename: string) {
  try {
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="attachment"; filename="${filename}"`,
      `Content-Type: application/pdf`,
      ``,
      pdfBuffer.toString('binary'),
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
    console.log("PDF anexado, status:", response.status);
  } catch (err) {
    console.error("Erro ao anexar PDF:", err);
  }
}

// Função para gerar o PDF da conferência
function gerarPDFConferencia(payload: any): Buffer {
  const doc = new jsPDF();

  // Título
  doc.setFontSize(18);
  doc.text('Relatório de Conferência', 14, 22);

  // Metadados
  doc.setFontSize(12);
  doc.text(`Empresa: ${payload.empresa ?? 'NEWSHOP'}`, 14, 32);
  doc.text(`Flag: ${payload.flag === 'cd' ? 'CD' : 'LOJA'}`, 14, 38);
  doc.text(`Conferente: ${payload.conferente}`, 14, 44);
  const data = payload.dataConferencia
    ? new Date(payload.dataConferencia).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');
  doc.text(`Data: ${data}`, 14, 50);
  doc.text(`Tempo: ${payload.tempo ?? '-'}`, 14, 56);
  doc.text(`Total itens: ${payload.totalItens ?? payload.itens?.length}`, 14, 62);

  // Tabela com os itens
  const statusMap: Record<string, string> = {
    separado: '✅ Separado',
    nao_tem: '❌ Não tem',
    nao_tem_tudo: '⚠️ Parcial',
    pendente: '⏳ Pendente',
  };

  const tableData = (payload.itens || []).map((item: any) => {
    const statusText = statusMap[item.status] || item.status;
    const photoStatus = item.photo ? '✓' : '✗';
    return [
      item.codigo,
      item.sku || '-',
      item.quantidadePedida,
      item.quantidadeReal ?? '-',
      statusText,
      photoStatus,
    ];
  });

  autoTable(doc, {
    startY: 68,
    head: [['Código', 'SKU', 'Pedido', 'Real', 'Status', 'Foto']],
    body: tableData,
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
  });

  // Adicionar imagens (fotos) em páginas separadas
  let yPos = (doc as any).lastAutoTable.finalY + 10;
  (payload.itens || []).forEach((item: any, idx: number) => {
    if (item.photo) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      doc.setFontSize(11);
      doc.text(`Foto do item: ${item.codigo} (${item.sku || 'sem SKU'})`, 14, yPos);
      try {
        // Se a foto não tiver o prefixo, adiciona (opcional)
        let imgData = item.photo;
        if (!imgData.startsWith('data:image/')) {
          imgData = `data:image/jpeg;base64,${imgData}`;
        }
        doc.addImage(imgData, 'JPEG', 14, yPos + 5, 50, 50);
        yPos += 60;
      } catch (err) {
        console.error('Erro ao adicionar imagem:', err);
        doc.text('Erro ao carregar imagem', 14, yPos + 5);
        yPos += 10;
      }
    }
  });

  return Buffer.from(doc.output('arraybuffer'));
}

// ── TASK 1 — Lista baixada ────────────────────────────────────────────────────
export const listaBaixada = task({
  id: "lista-baixada",
  machine: "micro",
  maxDuration: 30,
  run: async (payload: any) => {
    const dataFormatada = payload.dataDownload
      ? new Date(payload.dataDownload).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

    const isCD      = payload.flag === "cd";
    const listId    = isCD ? CLICKUP_CD_LIST_ID : CLICKUP_LIST_ID;
    const status    = isCD ? "EM CONFERENCIA"   : "to do";
    const flagLabel = isCD ? "CD"               : "LOJA";

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
        flag:    payload.flag    ?? "loja",
        items: payload.produtos.map((p: any) => ({
          codigo:     p.barcode,
          sku:        p.sku || "",
          quantidade: p.quantity ?? p.quantidade,
          photo:      p.photo || null,
        })),
      }),
      anexarTxtNaTarefa(taskId, `lista_${payload.pessoa}`, (() => {
        const soCodigosBloco = payload.produtos.map((p: any) => p.barcode).join("\n");
        const codigoQuantidadeBloco = payload.produtos
          .map((p: any) => `${p.barcode};${p.quantity ?? p.quantidade}`)
          .join("\n");
        return `Codigo\n${soCodigosBloco}\n\n------------------------\n\nCodigo;Quantidade\n${codigoQuantidadeBloco}`;
      })()),
    ]);
  },
});

// ── TASK 2 — Conferência finalizada ──────────────────────────────────────────
export const conferenciaBaixada = task({
  id: "conferencia-baixada",
  machine: "micro",
  maxDuration: 30,
  run: async (payload: any) => {
    const dataFormatada = payload.dataConferencia
      ? new Date(payload.dataConferencia).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

    const isCD   = payload.flag === "cd";
    const listId = isCD ? CLICKUP_CD_LIST_ID : CLICKUP_LIST_ID;

    const statusMap: Record<string, string> = {
      separado:     "✅ Separado",
      nao_tem:      "❌ Nao tem",
      nao_tem_tudo: "⚠️ Parcial",
      pendente:     "⏳ Pendente",
    };

    const itensS         = payload.itens.filter((i: any) => i.digito === "S");
    const itensM         = payload.itens.filter((i: any) => i.digito === "M");
    const itensSemDigito = payload.itens.filter((i: any) => !i.digito);

    const formatarItem = (item: any, idx: number) =>
      `${idx + 1}. Codigo: ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? "-"} | ${statusMap[item.status] ?? item.status}`;

    let itensTexto = "";
    if (itensS.length > 0) itensTexto += `{S}\n${itensS.map(formatarItem).join("\n")}`;
    if (itensM.length > 0) {
      if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `{M}\n${itensM.map(formatarItem).join("\n")}`;
    }
    if (itensSemDigito.length > 0) {
      if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
      itensTexto += `Sem categoria\n${itensSemDigito.map(formatarItem).join("\n")}`;
    }

    // 1. Cria tarefa original (já existente)
    await criarTarefaClickUp(
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

    // 2. (NOVO) Gera PDF e cria tarefa na lista TO-DO
    if (!CLICKUP_TODO_LIST_ID) {
      console.warn("⚠️ CLICKUP_TODO_LIST_ID não definida. Nenhuma tarefa TO-DO será criada.");
      return;
    }

    try {
      // Gera o PDF
      const pdfBuffer = gerarPDFConferencia(payload);

      // Cria tarefa na lista TO-DO
      const todoTaskId = await criarTarefaClickUp(
        CLICKUP_TODO_LIST_ID,
        `📋 Relatório: ${payload.conferente} — ${dataFormatada}`,
        `Relatório gerado automaticamente após conferência.
        
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
Data: ${dataFormatada}
Total itens: ${payload.totalItens}

Arquivo PDF anexado.`,
        "to do"   // Status desejado na lista TO-DO
      );

      // Anexa o PDF à tarefa
      await anexarPDFNaTarefa(todoTaskId, pdfBuffer, `conferencia_${payload.conferente}_${Date.now()}.pdf`);
    } catch (err) {
      console.error("Erro ao criar tarefa na lista TO-DO ou anexar PDF:", err);
    }
  },
});
