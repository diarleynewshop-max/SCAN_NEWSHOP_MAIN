/**
 * webhookRouter.ts
 * Roteia o envio para o ClickUp correto via Trigger.dev baseado em flag + empresa.
 *
 * Tanto LOJA quanto CD usam o mesmo task do Trigger.dev.
 * O worker decide o destino final olhando `payload.flag`.
 */

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;
const MAX_TRIGGER_PAYLOAD_KB = 220;
const MAX_FOTOS_TRIGGER_RETRY = 3;
const FOTO_TRIGGER_COMPACTA_MAX_EDGE = 320;
const FOTO_TRIGGER_COMPACTA_QUALITY = 0.38;
const FOTO_TRIGGER_MINIMA_MAX_EDGE = 220;
const FOTO_TRIGGER_MINIMA_QUALITY = 0.30;

type ListFlag = "loja" | "cd";
type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";

export interface WebhookPayload {
  flag: ListFlag;
  empresa: string;
  pessoa: string;
  titulo: string;
  totalItens: number;
  dataCriacao: string;
  produtos: Array<{
    barcode: string;
    sku: string;
    quantidade: number;
    removeTag: boolean;
    secao?: string | null;
    photo: string | null;
  }>;
}

function isFotoBase64(photo: unknown): photo is string {
  return typeof photo === "string" && photo.startsWith("data:image/");
}

function getPayloadSizeKb(payload: object): number {
  return Math.round(new Blob([JSON.stringify({ payload })]).size / 1024);
}

function compactarFotoDataUrl(photo: string, maxEdge: number, quality: number): Promise<string> {
  return new Promise((resolve) => {
    if (!isFotoBase64(photo)) {
      resolve(photo);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      const currentMaxEdge = Math.max(image.width, image.height);
      const scale = currentMaxEdge > maxEdge ? maxEdge / currentMaxEdge : 1;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) {
        resolve(photo);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
      canvas.width = 0;
      canvas.height = 0;
    };
    image.onerror = () => resolve(photo);
    image.src = photo;
  });
}

async function compactarFotosParaTrigger(
  payload: object,
  maxEdge: number,
  quality: number
): Promise<{ payload: object; changed: boolean }> {
  const original = payload as Record<string, any>;
  let changed = false;

  if (Array.isArray(original.itens)) {
    const itens = await Promise.all(original.itens.map(async (item: Record<string, any>) => {
      if (!isFotoBase64(item.photo)) return item;
      const photo = await compactarFotoDataUrl(item.photo, maxEdge, quality);
      if (photo !== item.photo) changed = true;
      return { ...item, photo };
    }));

    return {
      changed,
      payload: anexarMetaReducaoFotos({ ...original, itens }, {
        fotosCompactadasAntesDoEnvio: changed,
        fotoMaxEdge: maxEdge,
      }),
    };
  }

  if (Array.isArray(original.produtos)) {
    const produtos = await Promise.all(original.produtos.map(async (produto: Record<string, any>) => {
      if (!isFotoBase64(produto.photo)) return produto;
      const photo = await compactarFotoDataUrl(produto.photo, maxEdge, quality);
      if (photo !== produto.photo) changed = true;
      return { ...produto, photo };
    }));

    return {
      changed,
      payload: anexarMetaReducaoFotos({ ...original, produtos }, {
        fotosCompactadasAntesDoEnvio: changed,
        fotoMaxEdge: maxEdge,
      }),
    };
  }

  return { payload, changed: false };
}

function anexarMetaReducaoFotos(payload: Record<string, any>, meta: Record<string, any>): Record<string, any> {
  return {
    ...payload,
    _meta: {
      ...(payload._meta ?? {}),
      ...meta,
      maxFotosMantidas: MAX_FOTOS_TRIGGER_RETRY,
    },
  };
}

function reduzirFotosParaTrigger(payload: object): { payload: object; changed: boolean } {
  const original = payload as Record<string, any>;
  let fotosMantidas = 0;
  let changed = false;

  if (Array.isArray(original.itens)) {
    const itens = original.itens.map((item: Record<string, any>) => {
      const precisaFoto = item.status === "nao_tem" || item.status === "nao_tem_tudo";
      const podeManter = precisaFoto && fotosMantidas < MAX_FOTOS_TRIGGER_RETRY;

      if (podeManter && isFotoBase64(item.photo)) {
        fotosMantidas += 1;
        return item;
      }

      if (item.photo) {
        changed = true;
        return { ...item, photo: null };
      }

      return item;
    });

    return {
      changed,
      payload: anexarMetaReducaoFotos({
        ...original,
        itens,
      }, { fotosReduzidasNoRetry: changed }),
    };
  }

  if (Array.isArray(original.produtos)) {
    const produtos = original.produtos.map((produto: Record<string, any>) => {
      const quantidade = Number(produto.quantidade ?? produto.quantity ?? 0);
      const precisaFoto = quantidade === 0;
      const podeManter = precisaFoto && fotosMantidas < MAX_FOTOS_TRIGGER_RETRY;

      if (podeManter && isFotoBase64(produto.photo)) {
        fotosMantidas += 1;
        return produto;
      }

      if (produto.photo) {
        changed = true;
        return { ...produto, photo: null };
      }

      return produto;
    });

    return {
      changed,
      payload: anexarMetaReducaoFotos({
        ...original,
        produtos,
      }, { fotosReduzidasNoRetry: changed }),
    };
  }

  return { payload, changed: false };
}

function removerTodasFotosParaTrigger(payload: object): { payload: object; changed: boolean } {
  const original = payload as Record<string, any>;
  let changed = false;

  if (Array.isArray(original.itens)) {
    const itens = original.itens.map((item: Record<string, any>) => {
      if (!item.photo) return item;
      changed = true;
      return { ...item, photo: null };
    });

    return {
      changed,
      payload: anexarMetaReducaoFotos({
        ...original,
        itens,
      }, { fotosRemovidasPorLimiteTrigger: changed }),
    };
  }

  if (Array.isArray(original.produtos)) {
    const produtos = original.produtos.map((produto: Record<string, any>) => {
      if (!produto.photo) return produto;
      changed = true;
      return { ...produto, photo: null };
    });

    return {
      changed,
      payload: anexarMetaReducaoFotos({
        ...original,
        produtos,
      }, { fotosRemovidasPorLimiteTrigger: changed }),
    };
  }

  return { payload, changed: false };
}

async function prepararPayloadParaTrigger(payload: object): Promise<{ payload: object; changed: boolean; motivo?: string }> {
  const tamanhoOriginalKb = getPayloadSizeKb(payload);
  if (tamanhoOriginalKb <= MAX_TRIGGER_PAYLOAD_KB) {
    return { payload, changed: false };
  }

  const compacto = await compactarFotosParaTrigger(payload, FOTO_TRIGGER_COMPACTA_MAX_EDGE, FOTO_TRIGGER_COMPACTA_QUALITY);
  if (compacto.changed && getPayloadSizeKb(compacto.payload) <= MAX_TRIGGER_PAYLOAD_KB) {
    return {
      payload: anexarMetaReducaoFotos(compacto.payload as Record<string, any>, {
        payloadOriginalKb: tamanhoOriginalKb,
        payloadCompactadoKb: getPayloadSizeKb(compacto.payload),
      }),
      changed: true,
      motivo: "fotos compactadas",
    };
  }

  const minimo = await compactarFotosParaTrigger(compacto.payload, FOTO_TRIGGER_MINIMA_MAX_EDGE, FOTO_TRIGGER_MINIMA_QUALITY);
  if (minimo.changed && getPayloadSizeKb(minimo.payload) <= MAX_TRIGGER_PAYLOAD_KB) {
    return {
      payload: anexarMetaReducaoFotos(minimo.payload as Record<string, any>, {
        payloadOriginalKb: tamanhoOriginalKb,
        payloadCompactadoKb: getPayloadSizeKb(minimo.payload),
      }),
      changed: true,
      motivo: "fotos compactadas no limite",
    };
  }

  const reduzido = reduzirFotosParaTrigger(payload);
  if (reduzido.changed && getPayloadSizeKb(reduzido.payload) <= MAX_TRIGGER_PAYLOAD_KB) {
    return {
      payload: anexarMetaReducaoFotos(reduzido.payload as Record<string, any>, {
        fotosReduzidasAntesDoEnvio: true,
        payloadOriginalKb: tamanhoOriginalKb,
      }),
      changed: true,
      motivo: "fotos nao essenciais",
    };
  }

  const semFotos = removerTodasFotosParaTrigger(reduzido.payload);
  if (semFotos.changed) {
    return {
      payload: anexarMetaReducaoFotos(semFotos.payload as Record<string, any>, {
        fotosReduzidasAntesDoEnvio: true,
        payloadOriginalKb: tamanhoOriginalKb,
      }),
      changed: true,
      motivo: "limite de tamanho",
    };
  }

  return { payload, changed: false };
}

function normalizarEmpresa(value: unknown): EmpresaKey {
  const empresa = String(value ?? "NEWSHOP").trim().toUpperCase();
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

async function dispararTrigger(taskId: string, payload: object) {
  if (!TRIGGER_API_KEY) {
    throw new Error("[Trigger.dev] VITE_TRIGGER_API_KEY nao configurada");
  }

  const disparar = (nextPayload: object) => fetch(`https://api.trigger.dev/api/v1/tasks/${taskId}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIGGER_API_KEY}`,
    },
    body: JSON.stringify({ payload: nextPayload }),
  });

  const payloadPreparado = await prepararPayloadParaTrigger(payload);
  let payloadAtual = payloadPreparado.payload;

  if (payloadPreparado.changed) {
    console.warn(
      `[Trigger.dev] ${taskId} payload ${getPayloadSizeKb(payload)}KB reduzido para ${getPayloadSizeKb(payloadAtual)}KB antes do envio (${payloadPreparado.motivo}).`
    );
  }

  let res = await disparar(payloadAtual);

  if (!res.ok && res.status === 400) {
    const firstError = await res.text().catch(() => "");
    const retry = removerTodasFotosParaTrigger(payloadAtual);

    if (retry.changed) {
      console.warn(
        `[Trigger.dev] ${taskId} retornou 400 com payload de ${getPayloadSizeKb(payloadAtual)} KB. Tentando retry sem fotos.`,
        firstError
      );
      payloadAtual = retry.payload;
      res = await disparar(payloadAtual);
    } else {
      throw new Error(`[Trigger.dev] Erro 400 ao disparar ${taskId}: ${firstError || "sem detalhe"}`);
    }
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}: ${errorText || "sem detalhe"} | payload=${getPayloadSizeKb(payloadAtual)}KB`);
  }

  console.info(`[Trigger.dev] ${taskId} disparada`);
}

export async function enviarParaClickUp(payload: WebhookPayload): Promise<void> {
  const { flag } = payload;
  const empresa = normalizarEmpresa(payload.empresa);
  const p = { ...payload, empresa, dataDownload: new Date().toISOString() };

  if (empresa === "NEWSHOP") {
    await dispararTrigger("lista-baixada", p);
    return;
  }

  if (empresa === "SOYE" || empresa === "FACIL") {
    await dispararTrigger("lista-baixada-sf", p);
    return;
  }

  console.warn("[webhookRouter] Combinacao nao reconhecida:", flag, empresa);
}

export async function enviarConferenciaParaClickUp(payload: object & { flag?: string; empresa?: string }): Promise<void> {
  const flag = payload.flag ?? "loja";
  const empresa = normalizarEmpresa(payload.empresa);
  const p = { ...payload, empresa, dataConferencia: new Date().toISOString() };

  if (empresa === "NEWSHOP") {
    await dispararTrigger("conferencia-baixada", p);
    await dispararTrigger("relatorio-diretoria", p).catch((error) => {
      console.warn("[webhookRouter] TASK 3 relatorio-diretoria falhou:", error);
    });
    return;
  }

  if (empresa === "SOYE" || empresa === "FACIL") {
    await dispararTrigger("conferencia-baixada-sf", p);
    await dispararTrigger("relatorio-diretoria", p).catch((error) => {
      console.warn("[webhookRouter] TASK 3 relatorio-diretoria falhou:", error);
    });
    return;
  }

  console.warn("[webhookRouter] Conferencia - combinacao nao reconhecida:", flag, empresa);
}

export async function dispararWebhookListaBaixada(payload: object) {
  await dispararTrigger("lista-baixada", {
    ...payload,
    dataDownload: new Date().toISOString(),
  });
}

export async function dispararWebhookConferenciaBaixada(payload: object) {
  await dispararTrigger("conferencia-baixada", {
    ...payload,
    dataConferencia: new Date().toISOString(),
  });
}
