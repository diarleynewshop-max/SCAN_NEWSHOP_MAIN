import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import { request as httpsRequest } from "node:https";
import { erpFotoSync } from "./erpFotoSync";
import { expedicaoSync } from "./expedicaoSync";

if (!process.env.CLICKUP_TOKEN) throw new Error("CLICKUP_TOKEN não configurado no ambiente do Trigger.");
const CLICKUP_TOKEN = process.env.CLICKUP_TOKEN;
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
      signal: AbortSignal.timeout(30_000),
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
        signal: AbortSignal.timeout(30_000),
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

// ============================================================================
// ATENÇÃO IA / DEV: NÃO MEXA NESTA FUNÇÃO SEM LER ATÉ O FIM
// ============================================================================
// Esta função faz upload de anexos pro ClickUp API v2. Já quebrou MUITAS vezes
// em prod com: 400 {"err":"Request is not 'multipart/form-data'","ECODE":"ATTCH_045"}
//
// PADRÃO ATUAL (2026-06-08 v2):
//   Buffer multipart manual + node:https diretamente (sem fetch/undici)
//
//   Por que node:https e não fetch:
//   - fetch usa undici internamente; versões do undici interferem no Content-Type
//   - node:https não tem intermediário — Content-Type e body chegam exatamente
//     como montados. Content-Length explícito evita chunked encoding. ✅
//   - A falha anterior com https.request era com form-data.getBuffer() (boundary
//     do form-data não batia com o gerado pelo getHeaders()). Com buffer manual
//     o boundary é garantido ser o mesmo no header e no corpo.
//
// NUNCA USE:
//   - fetch(body=anything) — undici interfere no Content-Type em alguma versão
//   - axios.post(form, ...) — axios@1.x interfere no Content-Type (ATTCH_045)
//   - fetch(body=FormData global) — undici reescreve boundary (ATTCH_045)
//   - form-data.getBuffer() + https.request — boundary pode divergir (ATTCH_045)
//   - node-fetch@2 + form-data sem external — esbuild CJS (ATTCH_045)
//
// Histórico de quebras:
//   - 2026-05-18: manual multipart Buffer.concat → ATTCH_045
//   - 2026-05-18: FormData + Blob globais + fetch global → ATTCH_045
//   - 2026-05-18: form-data + node-fetch@2 (sem external) → ATTCH_045
//   - 2026-05-18: axios + form-data → funcionou
//   - 2026-05-26: axios + form-data → ATTCH_045 (axios@1.x sobrescreve Content-Type)
//   - 2026-05-26: form-data.getBuffer() + https.request → ATTCH_045
//   - 2026-05-27: Buffer manual + fetch(body=Buffer) → funcionou até Node 22+
//   - 2026-06-08: Buffer manual + fetch(body=Buffer) → ATTCH_045 (undici v7)
//   - 2026-06-08: Buffer manual + fetch(body=Blob) → ATTCH_045
//   - 2026-06-08: Buffer manual + node:https (sem fetch) → PADRÃO ATUAL ✅
// ============================================================================
async function postClickUpAttachment(
  taskId: string,
  token: string,
  filename: string,
  mimeType: string,
  content: Buffer | string | BlobPart
): Promise<{ status: number; text: string }> {
  const fileBuffer = Buffer.isBuffer(content)
    ? content
    : content instanceof Blob
    ? Buffer.from(await (content as Blob).arrayBuffer())
    : Buffer.from(content as string);

  const boundary = `FormBoundary${Date.now()}${Math.random().toString(36).slice(2)}`;
  const CRLF = "\r\n";
  const preamble = Buffer.from(
    `--${boundary}${CRLF}` +
    `Content-Disposition: form-data; name="attachment"; filename="${filename}"${CRLF}` +
    `Content-Type: ${mimeType}${CRLF}${CRLF}`,
    "utf-8"
  );
  const epilogue = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, "utf-8");
  const bodyBuffer = Buffer.concat([preamble, fileBuffer, epilogue]);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  console.log(`[ATTACH] ${filename} -> ${taskId} | ${bodyBuffer.length}b`);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        hostname: "api.clickup.com",
        path: `/api/v2/task/${encodeURIComponent(taskId)}/attachment`,
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": contentType,
          "Content-Length": bodyBuffer.length,
        },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf-8");
          console.log(`[ATTACH] status=${res.statusCode}`);
          resolve({ status: res.statusCode ?? 0, text });
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("ATTACH timeout 60s"));
    });
    req.write(bodyBuffer);
    req.end();
  });
}

async function anexarArquivoTextoClickUp(
  taskId: string,
  filename: string,
  mimeType: string,
  content: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const buffer = Buffer.from(content, "utf-8");
  const response = await postClickUpAttachment(taskId, CLICKUP_TOKEN, filename, mimeType, buffer);
  return { ...response, ok: response.status >= 200 && response.status < 300 };
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
    listeiro: payload.listeiro ?? null,
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
    const response = await anexarArquivoTextoClickUp(
      taskId,
      `${nomeArquivo}.json`,
      "application/json",
      jsonString
    );

    console.log("JSON STATUS:", response.status);
    if (!response.ok) {
      console.error("JSON ERROR:", response.text);
    }
  } catch (err) {
    console.error("Erro ao anexar JSON:", err);
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

    console.log(
      `Preparando foto "${filename}" - ${imgBuffer.length} bytes (apos compressao)`
    );

    const response = await postClickUpAttachment(taskId, CLICKUP_TOKEN, filename, mimeType, imgBuffer);

    console.log(`Foto "${filename}" - Status: ${response.status}`);
    if (response.status < 200 || response.status >= 300) console.error(`Foto "${filename}" - Erro:`, response.text);
    return response.status >= 200 && response.status < 300;
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
    const listeiro = payload.listeiro ?? "";
    const taskId = await criarTarefaClickUp(
      CLICKUP_TODO_LIST_ID,
      `🛒 ${item.codigo} — ${payload.conferente} — ${dataFormatada}`,
      `Relatório gerado automaticamente após conferência.

📋 INFORMAÇÕES
Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
${listeiro ? `Listeiro: ${listeiro}\n` : ""}Data: ${dataFormatada}

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
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async (payload: any, { ctx }) => {
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
Data: ${dataFormatada}
Trigger: ...${ctx.run.id.slice(-8)}`,
        "to do",
        payload.pessoa ? [payload.pessoa] : []
      );

      await anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
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
      });

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
      const itensParaErp = (payload.produtos ?? []).filter(
        (p: any) => p.appPhotoWithoutErp && p.erpProdutoId && p.photo
      );

      if (itensParaErp.length > 0) {
        try {
          await erpFotoSync.trigger({
            empresa: payload.empresa ?? "NEWSHOP",
            itens: itensParaErp.map((p: any) => ({
              erpProdutoId: p.erpProdutoId,
              photoBase64: p.photo,
              barcode: p.barcode,
            })),
          });
          console.info(`[lista-baixada] erp-foto-sync disparado para ${itensParaErp.length} item(ns)`);
        } catch (erpErr) {
          console.error("[lista-baixada] Falha ao disparar erp-foto-sync (nao bloqueia ClickUp):", erpErr);
        }
      }
    } catch (err) {
      console.error("Erro na TASK 1 (lista-baixada):", err);
      throw err;
    }
  },
});

export const conferenciaBaixada = task({
  id: "conferencia-baixada",
  machine: "small-1x",
  maxDuration: 1000,
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
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

      const listeiro = payload.listeiro ?? "";
      const descricaoCompleta = `Conferente: ${payload.conferente}
${listeiro ? `Listeiro: ${listeiro}\n` : ""}Empresa: ${payload.empresa ?? "NEWSHOP"}
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
${listeiro ? `Listeiro: ${listeiro}\n` : ""}Empresa: ${payload.empresa ?? "NEWSHOP"}
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
      await anexarJsonNaTarefa(tarefaOriginalId, nomeAnexo, montarJsonConferencia(payload, isCD));

      // Task de pendentes: cria em "analisado" com apenas os itens pendentes
      const itensPendentes = itensPayload.filter((i: any) => i.status === "pendente");
      if (itensPendentes.length > 0) {
        const nomePessoa = listeiro || payload.conferente;
        const nomePendentes = `⏳ ${nomePessoa} — ${dataFormatada} — PENDENTES`;
        const itensPendentesTexto = itensPendentes.map(formatarItem).join("\n");
        const descPendentes = `Conferente: ${payload.conferente}
${listeiro ? `Listeiro: ${listeiro}\n` : ""}Empresa: ${payload.empresa ?? "NEWSHOP"}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Total Pendentes: ${itensPendentes.length}

⏳ ITENS PENDENTES
${itensPendentesTexto}

📎 JSON com itens pendentes anexado.`;

        const taskPendentesId = await criarTarefaComDescricaoFallback(
          listId,
          nomePendentes,
          descPendentes,
          descPendentes,
          "analisado"
        );
        console.log(`Task de pendentes criada: ${taskPendentesId} (${itensPendentes.length} itens)`);

        const jsonPendentes = {
          conferente: payload.conferente,
          listeiro,
          empresa: payload.empresa ?? "NEWSHOP",
          flag: payload.flag,
          dataConferencia: payload.dataConferencia,
          itens: itensPendentes.map(({ photo: _p, ...rest }: any) => rest),
          resumo: { separado: 0, naoTem: 0, parcial: 0, pendente: itensPendentes.length },
          totalItens: itensPendentes.length,
          isPendentesReprocessamento: true,
          taskOriginalId: tarefaOriginalId,
        };
        const nomeAnexoPendentes = sanitizarNomeArquivo(`pendentes_${nomePessoa}_${dataFormatada}`);
        await anexarJsonNaTarefa(taskPendentesId, nomeAnexoPendentes, jsonPendentes);
      }

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

      const itensSeparadosEParciais = itensPayload.filter(
        (i: any) => i.status === "separado" || i.status === "nao_tem_tudo"
      );

      if (itensSeparadosEParciais.length > 0) {
        try {
          await expedicaoSync.trigger({
            conferente: payload.conferente,
            empresa: payload.empresa ?? "NEWSHOP",
            dataConferencia: payload.dataConferencia,
            itens: itensSeparadosEParciais.map((i: any) => ({
              codigo: i.codigo,
              ean: i.ean ?? null,
              quantidadeReal: i.quantidadeReal ?? 0,
            })),
          });
          console.info(`[conferencia-baixada] expedicao-sync disparado para ${itensSeparadosEParciais.length} item(ns)`);
        } catch (expErr) {
          console.error("[conferencia-baixada] Falha ao disparar expedicao-sync (nao bloqueia):", expErr);
        }
      }
    } catch (err) {
      console.error("Erro na TASK 2 (conferencia-baixada):", err);
      throw err;
    }
  },
});
