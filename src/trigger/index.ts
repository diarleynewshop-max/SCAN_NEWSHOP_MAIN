import { task } from "@trigger.dev/sdk/v3";

// ── Credenciais NEWSHOP ───────────────────────────────────────────────────────
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID ?? "901325900510";
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510";
const CLICKUP_TODO_LIST_ID = process.env.CLICKUP_TODO_LIST_ID ?? "901326684020";

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

async function anexarTxtNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: string
) {
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

async function anexarFotoNaTarefa(
  taskId: string,
  photoBase64: string,
  filename: string
): Promise<boolean> {
  try {
    let raw = photoBase64;

    // Detecta formato
    let mimeType = "image/jpeg";
    if (raw.includes("data:image/png")) {
      mimeType = "image/png";
    }

    // Remove prefixo data URI
    if (raw.includes(";base64,")) {
      raw = raw.split(";base64,")[1];
    }

    // Converte base64 → Buffer → Blob
    const imgBuffer = Buffer.from(raw, "base64");
    const blob = new Blob([imgBuffer], { type: mimeType });

    console.log(`Preparando foto "${filename}" — ${imgBuffer.length} bytes`);

    const formData = new FormData();
    formData.append("attachment", blob, filename);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
        },
        body: formData,
      }
    );

    console.log(`📸 Foto "${filename}" — Status: ${response.status}`);
    return response.ok;
  } catch (err) {
    console.error(`❌ Erro ao anexar foto "${filename}":`, err);
    return false;
  }
}

// ── TASK 1 — Lista baixada (CRIANDO TAREFA DE COMPRAS SE TIVER ZERO ESTOQUE) ──
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

    // 1. Cria a Tarefa Principal de Conferência
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

    // ── NOVO: 2. Verifica se há produtos sem estoque (quantidade 0) para enviar pra COMPRAS
    try {
      const itensSemEstoque = payload.produtos.filter(
        (p: any) => (p.quantidade ?? p.quantity) === 0
      );

      if (itensSemEstoque.length > 0) {
        const listaFaltantesStr = itensSemEstoque
          .map(
            (p: any, idx: number) =>
              `${idx + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | ❌ Sem Estoque no Sistema${p.photo ? " 📸" : ""}`
          )
          .join("\n");

        const comprasTaskId = await criarTarefaClickUp(
          CLICKUP_TODO_LIST_ID,
          `🛒 Compras (Falta Estoque): ${payload.titulo} — ${payload.pessoa}`,
          `Relatório gerado no momento do envio da lista para conferência.
Estes itens constam com 0 estoque no sistema.

📋 INFORMAÇÕES
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${flagLabel}
Pessoa que fez a lista: ${payload.pessoa}
Data: ${dataFormatada}

🛒 ITENS SEM ESTOQUE (${itensSemEstoque.length})
${listaFaltantesStr}

📸 Fotos anexadas abaixo (se houver)`,
          "to do"
        );

        console.log(`Tarefa de COMPRAS (Falta Estoque) criada: ${comprasTaskId}`);

        // Anexar fotos dos itens sem estoque (se houver)
        const itensComFoto = itensSemEstoque.filter((p: any) => p.photo && p.photo.length > 0);
        for (const item of itensComFoto) {
          const ext = item.photo.includes("data:image/png") ? "png" : "jpg";
          const filename = `sem_estoque_${item.barcode}_${item.sku || "sem-sku"}.${ext}`;
          await anexarFotoNaTarefa(comprasTaskId, item.photo, filename);
        }
      }
    } catch (err) {
      console.error("Erro ao criar tarefa de COMPRAS na Task 1:", err);
    }
  },
});

// ── TASK 2 — Conferência finalizada (COM FOTOS DIRETAS) ──────────────────────
export const conferenciaBaixada = task({
  id: "conferencia-baixada",
  machine: "micro",
  maxDuration: 60,
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

    // ── 2. Cria tarefa de COMPRAS com fotos diretas ──
    try {
      const itensNaoTem = (payload.itens || []).filter(
        (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
      );

      const listaFaltantes = itensNaoTem
        .map(
          (item: any, idx: number) =>
            `${idx + 1}. ${item.codigo} | SKU: ${item.sku || "-"} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? 0} | ${statusMap[item.status] ?? item.status}`
        )
        .join("\n");

      const listaTodos = (payload.itens || [])
        .map(
          (item: any, idx: number) =>
            `${idx + 1}. ${item.codigo} | SKU: ${item.sku || "-"} | ${statusMap[item.status] ?? item.status} | Pedido: ${item.quantidadePedida} | Real: ${item.quantidadeReal ?? 0}${item.photo ? " 📸" : ""}`
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

📦 TODOS OS ITENS
${listaTodos}

📸 Fotos anexadas abaixo (itens marcados com 📸)`,
        "to do"
      );

      console.log(`Tarefa de COMPRAS criada: ${todoTaskId}`);

      // ── 3. Anexa cada foto como imagem separada ──
       const itensComFoto = (payload.itens || []).filter(
        (i: any) =>
          i.photo &&
          i.photo.length > 0 &&
          (i.status === "nao_tem" || i.status === "nao_tem_tudo")
      );

      console.log(`Itens com foto: ${itensComFoto.length}`);

      for (const item of itensComFoto) {
        const ext = item.photo.includes("data:image/png") ? "png" : "jpg";
        const filename = `${item.status}_${item.codigo}_${item.sku || "sem-sku"}.${ext}`;
        await anexarFotoNaTarefa(todoTaskId, item.photo, filename);
      }

      console.log("✅ Todas as fotos anexadas!");
    } catch (err) {
      console.error("Erro ao criar tarefa de COMPRAS:", err);
    }
  },
});