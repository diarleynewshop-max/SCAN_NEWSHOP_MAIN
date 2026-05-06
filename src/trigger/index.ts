import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";

const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN!;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID ?? "901325900510";
const CLICKUP_CD_LIST_ID = process.env.CLICKUP_CD_LIST_ID ?? "901325900510";
const CLICKUP_TODO_LIST_ID = process.env.CLICKUP_TODO_LIST_ID ?? "901326684020";
const MAX_CLICKUP_DESCRIPTION_CHARS = 18000;
const MAX_CLICKUP_DESCRIPTION_PREVIEW_CHARS = 8000;

async function criarTarefaClickUp(
  listId: string,
  nome: string,
  descricao: string,
  status: string,
  tags: string[] = []
): Promise<string> {
  const buildBody = (withTags: boolean) => JSON.stringify({
    name: nome,
    description: descricao,
    status,
    ...(withTags && tags.length > 0 ? { tags } : {}),
  });

  let response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
      body: buildBody(true),
    }
  );

  if (!response.ok && tags.length > 0) {
    console.warn("ClickUp recusou tags. Criando tarefa sem tags:", await response.text());
    response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": "application/json",
        },
        body: buildBody(false),
      }
    );
  }

  if (!response.ok) {
    throw new Error(`Erro ao criar tarefa ClickUp (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  console.log("Resposta ClickUp completa:", JSON.stringify(data));
  console.log("Tarefa criada, ID:", data.id);
  return data.id;
}

function normalizarTagSecao(secao: unknown): string | null {
  const value = String(secao ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  return `SECAO - ${value}`.slice(0, 80);
}

function sanitizarNomeArquivo(value: unknown): string {
  return String(value ?? "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "arquivo";
}

function truncarTexto(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n... restante anexado no TXT/JSON da task ...`;
}

function montarMultipartAttachment(filename: string, mimeType: string, content: string) {
  const boundary = `----scannewshop-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeFilename = filename.replace(/"/g, "_");
  const fileBuffer = Buffer.from(content, "utf8");
  const header = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="attachment"; filename="${safeFilename}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8"
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

  return {
    body: Buffer.concat([header, fileBuffer, footer]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function criarTarefaComDescricaoFallback(
  listId: string,
  nome: string,
  descricaoCompleta: string,
  descricaoCompacta: string,
  status: string
): Promise<string> {
  const descricaoInicial = descricaoCompleta.length > MAX_CLICKUP_DESCRIPTION_CHARS
    ? descricaoCompacta
    : descricaoCompleta;

  try {
    return await criarTarefaClickUp(listId, nome, descricaoInicial, status);
  } catch (err) {
    if (descricaoInicial === descricaoCompacta) throw err;

    console.warn(
      "ClickUp recusou descricao completa. Tentando descricao compacta:",
      err
    );
    return await criarTarefaClickUp(listId, nome, descricaoCompacta, status);
  }
}

function montarJsonConferencia(payload: any, isCD: boolean) {
  return {
    type: "conferencia-baixada",
    empresa: payload.empresa ?? "NEWSHOP",
    flag: payload.flag ?? (isCD ? "cd" : "loja"),
    conferente: payload.conferente,
    tempo: payload.tempo,
    totalItens: payload.totalItens,
    resumo: payload.resumo,
    itens: (Array.isArray(payload.itens) ? payload.itens : []).map((item: any) => ({
      codigo: item.codigo,
      sku: item.sku || "",
      secao: item.secao ?? null,
      quantidadePedida: item.quantidadePedida,
      quantidadeReal: item.quantidadeReal ?? null,
      status: item.status,
      digito: item.digito ?? null,
      temFoto: Boolean(item.photo),
    })),
  };
}

async function anexarJsonNaTarefa(
  taskId: string,
  nomeArquivo: string,
  conteudo: object
) {
  try {
    const jsonString = JSON.stringify(conteudo, null, 2);
    const { body, contentType } = montarMultipartAttachment(
      `${nomeArquivo}.json`,
      "application/json; charset=utf-8",
      jsonString
    );

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": contentType,
        },
        body,
      }
    );

    console.log("JSON STATUS:", response.status);
    if (!response.ok) {
      console.error("JSON ERROR:", await response.text());
    }
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
    const { body, contentType } = montarMultipartAttachment(
      `${nomeArquivo}.txt`,
      "text/plain; charset=utf-8",
      conteudo
    );

    const response = await fetch(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN,
          "Content-Type": contentType,
        },
        body,
      }
    );

    console.log("TXT STATUS:", response.status);
    if (!response.ok) {
      console.error("TXT ERROR:", await response.text());
    }
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
    const tagSecao = normalizarTagSecao(item.secao);
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
Secao: ${item.secao || "Nao informada"}
Pedido: ${item.quantidadePedida}
Real: ${item.quantidadeReal ?? 0}

📸 Foto anexada abaixo (se houver)`,
      "to do",
      tagSecao ? [tagSecao] : []
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
            secao: p.secao || null,
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

      const itensPayload = Array.isArray(payload.itens) ? payload.itens : [];
      const resumo = payload.resumo ?? {
        separado: itensPayload.filter((i: any) => i.status === "separado").length,
        naoTem: itensPayload.filter((i: any) => i.status === "nao_tem").length,
        parcial: itensPayload.filter((i: any) => i.status === "nao_tem_tudo").length,
        pendente: itensPayload.filter((i: any) => i.status === "pendente").length,
      };
      const itensS = itensPayload.filter((i: any) => i.digito === "S");
      const itensM = itensPayload.filter((i: any) => i.digito === "M");
      const itensSemDigito = itensPayload.filter((i: any) => !i.digito);

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

      const itensNaoTem = itensPayload.filter(
        (i: any) => i.status === "nao_tem" || i.status === "nao_tem_tudo"
      );

      const descricaoCompleta = `Conferente: ${payload.conferente}
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens ?? itensPayload.length} item(ns)

📊 RESUMO
✅ Separado: ${resumo.separado}
❌ Não tem: ${resumo.naoTem}
⚠️ Parcial: ${resumo.parcial}
⏳ Pendente: ${resumo.pendente}

📦 ITENS
${itensTexto}`;

      const descricaoCompacta = `Conferente: ${payload.conferente}
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens ?? itensPayload.length} item(ns)

📊 RESUMO
✅ Separado: ${resumo.separado}
❌ Não tem: ${resumo.naoTem}
⚠️ Parcial: ${resumo.parcial}
⏳ Pendente: ${resumo.pendente}

📦 ITENS
${truncarTexto(itensTexto, MAX_CLICKUP_DESCRIPTION_PREVIEW_CHARS)}

📎 Lista completa anexada em TXT/JSON.`;

      tarefaOriginalId = await criarTarefaComDescricaoFallback(
        listId,
        `✅ ${payload.conferente} — ${dataFormatada}`,
        descricaoCompleta,
        descricaoCompacta,
        "complete"
      );

      console.log(`Tarefa de conferência criada: ${tarefaOriginalId}`);

      const nomeAnexo = sanitizarNomeArquivo(`conferencia_${payload.conferente}_${dataFormatada}`);
      await Promise.all([
        anexarJsonNaTarefa(tarefaOriginalId, nomeAnexo, montarJsonConferencia(payload, isCD)),
        anexarTxtNaTarefa(tarefaOriginalId, `${nomeAnexo}_itens`, itensTexto || "Sem itens"),
      ]);

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
