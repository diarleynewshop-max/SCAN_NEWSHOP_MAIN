import { task } from "@trigger.dev/sdk/v3";

// ── Credenciais NEWSHOP ───────────────────────────────────────────────────────
const CLICKUP_TOKEN      = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID    = process.env.CLICKUP_LIST_ID    ?? "901325900510"; // LOJA NEWSHOP
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510"; // CD NEWSHOP (ajuste se tiver ID separado)

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

// ── TASK 1 — Lista baixada ────────────────────────────────────────────────────
// LOJA NEWSHOP → CLICKUP_LIST_ID    → status "to do"
// CD   NEWSHOP → CLICKUP_CD_LIST_ID → status "EM CONFERENCIA"
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
// LOJA NEWSHOP → CLICKUP_LIST_ID    → status "complete"
// CD   NEWSHOP → CLICKUP_CD_LIST_ID → status "complete"
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
  },
});