import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID ?? "901325900510";
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510";
const CLICKUP_TODO_LIST_ID = process.env.CLICKUP_TODO_LIST_ID ?? "901326684020";

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

async function comprimirImagem(
  base64: string,
  maxWidth = 1200,
  quality = 70
): Promise<{ data: string; mimeType: string }> {
  try {
    const raw = base64.includes(";base64,")
      ? base64.split(";base64,")[1]
      : base64;
    const buffer = Buffer.from(raw, "base64");

    const compressed = await sharp(buffer)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();

    console.log(
      `Compressão: ${buffer.length} bytes -> ${compressed.length} bytes (${Math.round((compressed.length / buffer.length) * 100)}%)`
    );

    return { data: compressed.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    console.warn("Falha na compressão, usando original:", err);
    const raw = base64.includes(";base64,")
      ? base64.split(";base64,")[1]
      : base64;
    const mimeType = base64.includes("data:image/png")
      ? "image/png"
      : "image/jpeg";
    return { data: raw, mimeType };
  }
}

async function anexarFotoNaTarefa(
  taskId: string,
  photoBase64: string,
  filename: string
): Promise<boolean> {
  try {
    const { data: comprimida, mimeType } = await comprimirImagem(photoBase64);

    const imgBuffer = Buffer.from(comprimida, "base64");
    const blob = new Blob([imgBuffer], { type: mimeType });

    console.log(
      `Preparando foto "${filename}" - ${imgBuffer.length} bytes (apos compressao)`
    );

    const formData = new FormData();
    formData.append("attachment", blob, filename);

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: { Authorization: CLICKUP_TOKEN },
        body: formData,
      }
    );

    console.log(`Foto "${filename}" - Status: ${response.status}`);
    return response.ok;
  } catch (err) {
    console.error(`Erro ao anexar foto "${filename}":`, err);
    return false;
  }
}

async function uploadFotosParalelo(
  taskId: string,
  itensComFoto: any[],
  maxFotos = 10,
  prefixoStatus?: (item: any) => string
): Promise<void> {
  const itensLimitados =
    itensComFoto.length > maxFotos
      ? itensComFoto.slice(0, maxFotos)
      : itensComFoto;

  if (itensComFoto.length > maxFotos) {
    console.warn(
      `Limite de ${maxFotos} fotos atingido. ${itensComFoto.length - maxFotos} fotos serao ignoradas.`
    );
  }

  console.log(
    `Itens com foto: ${itensLimitados.length}${itensComFoto.length > maxFotos ? ` (de ${itensComFoto.length} total)` : ""}`
  );

  await Promise.all(
    itensLimitados.map((item) => {
      const ext = item.photo.includes("data:image/png") ? "png" : "jpg";
      const prefixo = prefixoStatus ? prefixoStatus(item) : "foto";
      const filename = `${prefixo}_${item.barcode ?? item.codigo}_${item.sku || "sem-sku"}.${ext}`;
      return anexarFotoNaTarefa(taskId, item.photo, filename);
    })
  );

  console.log("Todas as fotos anexadas!");
}

async function criarTarefasComprasIndividuais(
  itens: any[],
  payload: any,
  dataFormatada: string,
  isCD: boolean,
  statusMap: Record<string, string>
): Promise<string | null> {
  let primeiraTaskId: string | null = null;

  for (const item of itens) {
    const taskId = await criarTarefaClickUp(
      CLICKUP_TODO_LIST_ID,
      `🛒 ${item.codigo} — ${payload.conferente} — ${dataFormatada}`,
      `Relatório gerado automaticamente após conferência.

📋 INFORMAÇÕES
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
Data: ${dataFormatada}

🛒 ITEM FALTANTE
Status: ${statusMap[item.status] ?? item.status}
Código: ${item.codigo}
SKU: ${item.sku || "-"}
Pedido: ${item.quantidadePedida}
Real: ${item.quantidadeReal ?? 0}

📸 Foto anexada abaixo (se houver)`,
      "to do"
    );

    if (!primeiraTaskId) {
      primeiraTaskId = taskId;
    }

    if (item.photo && item.photo.length > 0) {
      const ext = item.photo.includes("data:image/png") ? "png" : "jpg";
      const filename = `${item.status}_${item.codigo}_${item.sku || "sem-sku"}.${ext}`;
      await anexarFotoNaTarefa(taskId, item.photo, filename);
    }
  }

  console.log(`Tarefas individuais de COMPRAS criadas: ${itens.length}`);
  return primeiraTaskId;
}

export const listaBaixada = task({
  id: "lista-baixada",
  machine: "small-1x",
  maxDuration: 1000,
  run: async (payload: any) => {
    let taskId: string | null = null;
    let comprasTaskId: string | null = null;

    try {
      const dataFormatada = payload.dataDownload
        ? new Date(payload.dataDownload).toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          })
        : new Date().toLocaleString("pt-BR", {
            timeZone: "America/Fortaleza",
          });

      const flagLabel = "LOJA";

      taskId = await criarTarefaClickUp(
        CLICKUP_LIST_ID,
        `📦 ${payload.titulo} — ${payload.pessoa}`,
        `Pessoa: ${payload.pessoa}
Título: ${payload.titulo}
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${flagLabel}
Itens: ${payload.totalItens}
Data: ${dataFormatada}`,
        "to do"
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
              .map((p: any) => `${p.barcode};${p.quantity ?? p.quantidade}`)
              .join("\n");
            return `Codigo\n${soCodigosBloco}\n\n------------------------\n\nCodigo;Quantidade\n${codigoQuantidadeBloco}`;
          })()
        ),
      ]);

      const itensSemEstoque = payload.produtos.filter(
        (p: any) => (p.quantidade ?? p.quantity) === 0
      );

      if (itensSemEstoque.length > 0) {
        const listaFaltantesStr = itensSemEstoque
          .map(
            (p: any, idx: number) =>
              `${idx + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | ❌ Sem Estoque${p.photo ? " " : ""}`
          )
          .join("\n");

        comprasTaskId = await criarTarefaClickUp(
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

        console.log(`Tarefa de COMPRAS criada: ${comprasTaskId}`);

        const itensComFoto = itensSemEstoque.filter(
          (p: any) => p.photo && p.photo.length > 0
        );

        if (itensComFoto.length > 0) {
          await uploadFotosParalelo(
            comprasTaskId,
            itensComFoto,
            10,
            () => "sem_estoque"
          );
        }
      }
    } catch (err) {
      console.error("Erro na TASK 1 (lista-baixada):", err);
    }
  },
});

export const conferenciaBaixada = task({
  id: "conferencia-baixada",
  machine: "small-1x",
  maxDuration: 1000,
  run: async (payload: any) => {
    let tarefaOriginalId: string | null = null;
    let todoTaskId: string | null = null;

    try {
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
      if (itensS.length > 0) {
        itensTexto += `{S}\n${itensS.map(formatarItem).join("\n")}`;
      }
      if (itensM.length > 0) {
        if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
        itensTexto += `{M}\n${itensM.map(formatarItem).join("\n")}`;
      }
      if (itensSemDigito.length > 0) {
        if (itensTexto) itensTexto += "\n\n=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n\n";
        itensTexto += `Sem categoria\n${itensSemDigito.map(formatarItem).join("\n")}`;
      }

      const itensNaoTem = (payload.itens || []).filter(
        (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
      );

      tarefaOriginalId = await criarTarefaClickUp(
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

      if (itensNaoTem.length > 0) {
        todoTaskId = await criarTarefasComprasIndividuais(
          itensNaoTem,
          payload,
          dataFormatada,
          isCD,
          statusMap
        );
      } else {
        console.log("Nenhum item negativo/parcial para gerar task de compras.");
      }
    } catch (err) {
      console.error("Erro na TASK 2 (conferencia-baixada):", err);
    }
  },
});
