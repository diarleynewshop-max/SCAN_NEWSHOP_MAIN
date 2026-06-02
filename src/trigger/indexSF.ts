import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import { erpFotoSync } from "./erpFotoSync";
import { expedicaoSync } from "./expedicaoSync";

type EmpresaSF = "SOYE" | "FACIL";
type FlagLista = "loja" | "cd";

if (!process.env.CLICKUP_TOKEN_SF) throw new Error("CLICKUP_TOKEN_SF não configurado no ambiente do Trigger.");
const CLICKUP_TOKEN_SF = process.env.CLICKUP_TOKEN_SF;

const DEFAULT_LIST_ID_SOYE = "901326607319";
const DEFAULT_LIST_ID_FACIL = "901326607320";
const DEFAULT_CD_LIST_ID_SOYE = "901326607319";
const DEFAULT_CD_LIST_ID_FACIL = "901326607320";

const CLICKUP_CD_LIST_ID_SOYE =
  process.env.CLICKUP_CD_LIST_ID_SOYE ?? DEFAULT_CD_LIST_ID_SOYE;
const CLICKUP_CD_LIST_ID_FACIL =
  process.env.CLICKUP_CD_LIST_ID_FACIL ?? DEFAULT_CD_LIST_ID_FACIL;
const MAX_CLICKUP_DESCRIPTION_CHARS = 18000;
const MAX_CLICKUP_DESCRIPTION_PREVIEW_CHARS = 8000;

function getPrimeiraEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function resolverListaLoja(
  empresa: EmpresaSF,
  envValue: string | undefined,
  cdListId: string,
  defaultListId: string
): string {
  if (!envValue) return defaultListId;

  if (envValue === cdListId) {
    console.warn(
      `[indexSF] CLICKUP_LIST_ID_${empresa} aponta para CD. Usando lista LOJA padrao.`
    );
    return defaultListId;
  }

  return envValue;
}

const CLICKUP_LIST_ID_SOYE = resolverListaLoja(
  "SOYE",
  getPrimeiraEnv(
    "CLICKUP_LIST_ID_SOYE_LOJA",
    "CLICKUP_LOJA_LIST_ID_SOYE",
    "CLICKUP_LIST_ID_SOYE"
  ),
  CLICKUP_CD_LIST_ID_SOYE,
  DEFAULT_LIST_ID_SOYE
);
const CLICKUP_LIST_ID_FACIL = resolverListaLoja(
  "FACIL",
  getPrimeiraEnv(
    "CLICKUP_LIST_ID_FACIL_LOJA",
    "CLICKUP_LOJA_LIST_ID_FACIL",
    "CLICKUP_LIST_ID_FACIL"
  ),
  CLICKUP_CD_LIST_ID_FACIL,
  DEFAULT_LIST_ID_FACIL
);

function normalizarEmpresa(value: unknown): EmpresaSF {
  const empresa = String(value ?? "SOYE").trim().toUpperCase();
  return empresa.includes("FACIL") ? "FACIL" : "SOYE";
}

function normalizarFlag(value: unknown): FlagLista {
  return String(value ?? "loja").trim().toLowerCase() === "cd" ? "cd" : "loja";
}

function getListId(empresa: EmpresaSF, flag: FlagLista): string {
  if (empresa === "FACIL") {
    return flag === "cd" ? CLICKUP_CD_LIST_ID_FACIL : CLICKUP_LIST_ID_FACIL;
  }

  return flag === "cd" ? CLICKUP_CD_LIST_ID_SOYE : CLICKUP_LIST_ID_SOYE;
}

function getComprasListId(empresa: EmpresaSF): string {
  const listId = getPrimeiraEnv(
    `CLICKUP_TODO_LIST_ID_${empresa}`,
    `CLICKUP_LIST_ID_COMPRAS_${empresa}`,
    "CLICKUP_LIST_ID_COMPRAS_SF",
    "CLICKUP_TODO_LIST_ID_SF"
  );

  if (listId) return listId;

  const fallbackListId = getListId(empresa, "loja");
  console.warn(
    `[indexSF] Lista de COMPRAS ${empresa} nao configurada. Usando lista LOJA ${empresa} para evitar envio para NEWSHOP.`
  );
  return fallbackListId;
}

async function criarTarefaClickUp(
  listId: string,
  nome: string,
  descricao: string,
  status: string,
  tags: string[] = []
): Promise<string> {
  const buildBody = (withTags: boolean, withStatus: boolean) => JSON.stringify({
    name: nome,
    description: descricao,
    ...(withStatus && status ? { status } : {}),
    ...(withTags && tags.length > 0 ? { tags } : {}),
  });

  console.log(`[CRIAR-TASK-SF] listId=${listId} nome=${nome}`);
  let response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task`,
    {
      method: "POST",
      headers: {
        Authorization: CLICKUP_TOKEN_SF,
        "Content-Type": "application/json",
      },
      body: buildBody(true, true),
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
          Authorization: CLICKUP_TOKEN_SF,
          "Content-Type": "application/json",
        },
        body: buildBody(false, true),
        signal: AbortSignal.timeout(30_000),
      }
    );
  }

  if (!response.ok && status) {
    console.warn(
      `ClickUp recusou status "${status}". Criando tarefa no status padrao da lista:`,
      await response.text()
    );
    response = await fetch(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        method: "POST",
        headers: {
          Authorization: CLICKUP_TOKEN_SF,
          "Content-Type": "application/json",
        },
        body: buildBody(false, false),
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

// Veja src/trigger/index.ts para histórico completo de quebras e NUNCA USE.
// PADRÃO ATUAL (2026-05-27): Buffer manual + fetch(body=Buffer). Ver index.ts.
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
  const body = Buffer.concat([preamble, fileBuffer, epilogue]);
  const contentType = `multipart/form-data; boundary=${boundary}`;

  console.log(`[ATTACH] ${filename} -> ${taskId} | ${body.length}b`);

  const response = await fetch(
    `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/attachment`,
    {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": contentType,
      },
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(60_000),
    }
  );

  const text = await response.text();
  console.log(`[ATTACH] status=${response.status}`);
  return { status: response.status, text };
}

async function anexarArquivoTextoClickUp(
  taskId: string,
  filename: string,
  mimeType: string,
  content: string
): Promise<{ ok: boolean; status: number; text: string }> {
  const buffer = Buffer.from(content, "utf-8");
  const response = await postClickUpAttachment(taskId, CLICKUP_TOKEN_SF, filename, mimeType, buffer);
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

function montarJsonConferencia(payload: any, empresa: EmpresaSF, flag: FlagLista) {
  return {
    type: "conferencia-baixada",
    empresa,
    flag,
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
      `Compressao: ${buffer.length} bytes -> ${compressed.length} bytes (${Math.round((compressed.length / buffer.length) * 100)}%)`
    );

    return { data: compressed.toString("base64"), mimeType: "image/jpeg" };
  } catch (err) {
    console.warn("Falha na compressao, usando original:", err);
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

    const response = await postClickUpAttachment(taskId, CLICKUP_TOKEN_SF, filename, mimeType, imgBuffer);

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

async function criarTarefasComprasIndividuaisSF(
  itens: any[],
  payload: any,
  dataFormatada: string,
  isCD: boolean,
  statusMap: Record<string, string>
): Promise<string | null> {
  let primeiraTaskId: string | null = null;
  const empresa = normalizarEmpresa(payload.empresa);
  const comprasListId = getComprasListId(empresa);

  for (const item of itens) {
    const tagSecao = normalizarTagSecao(item.secao);
    const taskId = await criarTarefaClickUp(
      comprasListId,
      `Compras ${empresa}: ${item.codigo} - ${payload.conferente} - ${dataFormatada}`,
      `Relatorio gerado automaticamente apos conferencia.

INFORMACOES
Empresa: ${empresa}
Tipo: ${isCD ? "CD" : "LOJA"}
Conferente: ${payload.conferente}
Data: ${dataFormatada}

ITEM FALTANTE
Status: ${statusMap[item.status] ?? item.status}
Codigo: ${item.codigo}
SKU: ${item.sku || "-"}
Secao: ${item.secao || "Nao informada"}
Pedido: ${item.quantidadePedida}
Real: ${item.quantidadeReal ?? 0}

Foto anexada abaixo (se houver)`,
      "PENDENTE",
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

  console.log(`Tarefas individuais de COMPRAS SF criadas: ${itens.length}`);
  return primeiraTaskId;
}

export const listaBaixadaSF = task({
  id: "lista-baixada-sf",
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

      const empresa = normalizarEmpresa(payload.empresa);
      const flag = normalizarFlag(payload.flag);
      const isCD = flag === "cd";
      const listId = getListId(empresa, flag);
      const comprasListId = getComprasListId(empresa);
      const flagLabel = isCD ? "CD" : "LOJA";

      taskId = await criarTarefaClickUp(
        listId,
        `${empresa} ${flagLabel}: ${payload.titulo} - ${payload.pessoa}`,
        `Pessoa: ${payload.pessoa}
Titulo: ${payload.titulo}
Empresa: ${empresa}
Tipo: ${flagLabel}
Itens: ${payload.totalItens}
Data: ${dataFormatada}
Trigger: ...${ctx.run.id.slice(-8)}`,
        "to do",
        payload.pessoa ? [payload.pessoa] : []
      );

      await anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
        type: "conference-file",
        empresa,
        flag,
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
              `${idx + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | Sem Estoque${p.photo ? " | foto" : ""}`
          )
          .join("\n");

        comprasTaskId = await criarTarefaClickUp(
          comprasListId,
          `Compras ${empresa} (Falta Estoque): ${payload.titulo} - ${payload.pessoa}`,
          `Relatorio gerado no momento do envio da lista para conferencia.
Estes itens constam com 0 estoque no sistema.

INFORMACOES
Empresa: ${empresa}
Tipo: ${flagLabel}
Pessoa que fez a lista: ${payload.pessoa}
Data: ${dataFormatada}

ITENS SEM ESTOQUE (${itensSemEstoque.length})
${listaFaltantesStr}

Fotos anexadas abaixo (se houver)`,
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
            empresa: payload.empresa ?? "SOYE",
            itens: itensParaErp.map((p: any) => ({
              erpProdutoId: p.erpProdutoId,
              photoBase64: p.photo,
              barcode: p.barcode,
            })),
          });
          console.info(`[lista-baixada-sf] erp-foto-sync disparado para ${itensParaErp.length} item(ns)`);
        } catch (erpErr) {
          console.error("[lista-baixada-sf] Falha ao disparar erp-foto-sync (nao bloqueia ClickUp):", erpErr);
        }
      }
    } catch (err) {
      console.error("Erro na TASK 1 (lista-baixada-sf):", err);
      throw err;
    }
  },
});

export const conferenciaBaixadaSF = task({
  id: "conferencia-baixada-sf",
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

      const empresa = normalizarEmpresa(payload.empresa);
      const flag = normalizarFlag(payload.flag);
      const isCD = flag === "cd";
      const listId = getListId(empresa, flag);
      console.log(`[CONF-SF] empresa=${empresa} flag=${flag} listId=${listId} payload.empresa=${payload.empresa} payload.flag=${payload.flag}`);

      const statusMap: Record<string, string> = {
        separado: "Separado",
        nao_tem: "Nao tem",
        nao_tem_tudo: "Parcial",
        pendente: "Pendente",
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
Empresa: ${empresa}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens ?? itensPayload.length} item(ns)

RESUMO
Separado: ${resumo.separado}
Nao tem: ${resumo.naoTem}
Parcial: ${resumo.parcial}
Pendente: ${resumo.pendente}

ITENS
${itensTexto}`;

      const descricaoCompacta = `Conferente: ${payload.conferente}
Empresa: ${empresa}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Tempo: ${payload.tempo}
Total: ${payload.totalItens ?? itensPayload.length} item(ns)

RESUMO
Separado: ${resumo.separado}
Nao tem: ${resumo.naoTem}
Parcial: ${resumo.parcial}
Pendente: ${resumo.pendente}

ITENS
${truncarTexto(itensTexto, MAX_CLICKUP_DESCRIPTION_PREVIEW_CHARS)}

Lista completa anexada em TXT/JSON.`;

      tarefaOriginalId = await criarTarefaComDescricaoFallback(
        listId,
        `${empresa} ${isCD ? "CD" : "LOJA"}: ${payload.conferente} - ${dataFormatada}`,
        descricaoCompleta,
        descricaoCompacta,
        "complete"
      );

      console.log(`Tarefa de conferencia criada: ${tarefaOriginalId}`);

      const nomeAnexo = sanitizarNomeArquivo(`conferencia_${empresa}_${payload.conferente}_${dataFormatada}`);
      await anexarJsonNaTarefa(tarefaOriginalId, nomeAnexo, montarJsonConferencia(payload, empresa, flag));

      // Task de pendentes: cria em "analisado" com apenas os itens pendentes
      const itensPendentes = itensPayload.filter((i: any) => i.status === "pendente");
      if (itensPendentes.length > 0) {
        const listeiro = payload.listeiro ?? "";
        const nomePessoa = listeiro || payload.conferente;
        const nomePendentes = `⏳ ${nomePessoa} — ${dataFormatada} — PENDENTES`;
        const itensPendentesTexto = itensPendentes.map(formatarItem).join("\n");
        const descPendentes = `Conferente: ${payload.conferente}
${listeiro ? `Listeiro: ${listeiro}\n` : ""}Empresa: ${empresa}
Tipo: ${isCD ? "CD" : "LOJA"}
Data: ${dataFormatada}
Total Pendentes: ${itensPendentes.length}

ITENS PENDENTES
${itensPendentesTexto}

JSON com itens pendentes anexado.`;

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
          empresa,
          flag,
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
        todoTaskId = await criarTarefasComprasIndividuaisSF(
          itensNaoTem,
          payload,
          dataFormatada,
          isCD,
          statusMap
        );
        console.log(`Primeira tarefa de COMPRAS criada: ${todoTaskId}`);
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
            empresa: String(empresa),
            dataConferencia: payload.dataConferencia,
            itens: itensSeparadosEParciais.map((i: any) => ({
              codigo: i.codigo,
              ean: i.ean ?? null,
              quantidadeReal: i.quantidadeReal ?? 0,
            })),
          });
          console.info(`[conferencia-baixada-sf] expedicao-sync disparado para ${itensSeparadosEParciais.length} item(ns)`);
        } catch (expErr) {
          console.error("[conferencia-baixada-sf] Falha ao disparar expedicao-sync (nao bloqueia):", expErr);
        }
      }
    } catch (err) {
      console.error("Erro na TASK 2 (conferencia-baixada-sf):", err);
      throw err;
    }
  },
});
