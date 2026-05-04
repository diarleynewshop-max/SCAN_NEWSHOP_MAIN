import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";

type EmpresaSF = "SOYE" | "FACIL";
type FlagLista = "loja" | "cd";

const CLICKUP_TOKEN_SF = process.env.CLICKUP_TOKEN_SF!;

const DEFAULT_LIST_ID_SOYE = "901326607319";
const DEFAULT_LIST_ID_FACIL = "901326607320";
const DEFAULT_CD_LIST_ID_SOYE = "901326461924";
const DEFAULT_CD_LIST_ID_FACIL = "901326461915";

const CLICKUP_CD_LIST_ID_SOYE =
  process.env.CLICKUP_CD_LIST_ID_SOYE ?? DEFAULT_CD_LIST_ID_SOYE;
const CLICKUP_CD_LIST_ID_FACIL =
  process.env.CLICKUP_CD_LIST_ID_FACIL ?? DEFAULT_CD_LIST_ID_FACIL;
const CLICKUP_TODO_LIST_ID_SF =
  process.env.CLICKUP_TODO_LIST_ID_SF ??
  process.env.CLICKUP_TODO_LIST_ID ??
  "901326684020";
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
        Authorization: CLICKUP_TOKEN_SF,
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
          Authorization: CLICKUP_TOKEN_SF,
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
          Authorization: CLICKUP_TOKEN_SF,
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
          Authorization: CLICKUP_TOKEN_SF,
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
        headers: { Authorization: CLICKUP_TOKEN_SF },
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

async function criarTarefasComprasIndividuaisSF(
  itens: any[],
  payload: any,
  dataFormatada: string,
  isCD: boolean,
  statusMap: Record<string, string>
): Promise<string | null> {
  let primeiraTaskId: string | null = null;
  const empresa = normalizarEmpresa(payload.empresa);

  for (const item of itens) {
    const tagSecao = normalizarTagSecao(item.secao);
    const taskId = await criarTarefaClickUp(
      CLICKUP_TODO_LIST_ID_SF,
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

  console.log(`Tarefas individuais de COMPRAS SF criadas: ${itens.length}`);
  return primeiraTaskId;
}

export const listaBaixadaSF = task({
  id: "lista-baixada-sf",
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

      const empresa = normalizarEmpresa(payload.empresa);
      const flag = normalizarFlag(payload.flag);
      const isCD = flag === "cd";
      const listId = getListId(empresa, flag);
      const flagLabel = isCD ? "CD" : "LOJA";

      taskId = await criarTarefaClickUp(
        listId,
        `${empresa} ${flagLabel}: ${payload.titulo} - ${payload.pessoa}`,
        `Pessoa: ${payload.pessoa}
Titulo: ${payload.titulo}
Empresa: ${empresa}
Tipo: ${flagLabel}
Itens: ${payload.totalItens}
Data: ${dataFormatada}`,
        "to do"
      );

      await Promise.all([
        anexarJsonNaTarefa(taskId, `lista_${payload.pessoa}`, {
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
              `${idx + 1}. ${p.barcode} | SKU: ${p.sku || "-"} | Sem Estoque${p.photo ? " | foto" : ""}`
          )
          .join("\n");

        comprasTaskId = await criarTarefaClickUp(
          CLICKUP_TODO_LIST_ID_SF,
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
    } catch (err) {
      console.error("Erro na TASK 1 (lista-baixada-sf):", err);
    }
  },
});

export const conferenciaBaixadaSF = task({
  id: "conferencia-baixada-sf",
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

      const empresa = normalizarEmpresa(payload.empresa);
      const flag = normalizarFlag(payload.flag);
      const isCD = flag === "cd";
      const listId = getListId(empresa, flag);

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
      await Promise.all([
        anexarJsonNaTarefa(tarefaOriginalId, nomeAnexo, montarJsonConferencia(payload, empresa, flag)),
        anexarTxtNaTarefa(tarefaOriginalId, `${nomeAnexo}_itens`, itensTexto || "Sem itens"),
      ]);

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
    } catch (err) {
      console.error("Erro na TASK 2 (conferencia-baixada-sf):", err);
    }
  },
});
