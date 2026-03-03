import { task } from "@trigger.dev/sdk/v3";

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID!;

async function criarTarefaClickUp(nome: string, descricao: string, status: string): Promise<string> {
  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${CLICKUP_LIST_ID}/task`,
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

// TASK 1 — Lista baixada → to do + JSON + TXT anexados
export const listaBaixada = task({
  id: "lista-baixada",
  machine: "small-2x",
  run: async (payload: any) => {
    const dataFormatada = payload.dataDownload
      ? new Date(payload.dataDownload).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

    const taskId = await criarTarefaClickUp(
      `📦 ${payload.titulo} — ${payload.pessoa}`,
      `Pessoa: ${payload.pessoa}
Título: ${payload.titulo}
Itens: ${payload.totalItens}
Data: ${dataFormatada}`,
      "to do"
    );

    // Anexa o JSON
    await anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
      type: "conference-file",
      items: payload.produtos.map((p: any) => ({
        codigo: p.barcode,
        sku: p.sku || "",
        quantidade: p.quantity ?? p.quantidade,
        photo: p.photo || null,
      })),
    });

    // Gera e anexa o TXT com os dois blocos
    const soCo
