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

type ListFlag = "loja" | "cd";

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

function prepararPayloadParaTrigger(payload: object): { payload: object; changed: boolean; motivo?: string } {
  const tamanhoOriginalKb = getPayloadSizeKb(payload);
  if (tamanhoOriginalKb <= MAX_TRIGGER_PAYLOAD_KB) {
    return { payload, changed: false };
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

  const payloadPreparado = prepararPayloadParaTrigger(payload);
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
  const { flag, empresa } = payload;
  const p = { ...payload, dataDownload: new Date().toISOString() };

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
  const empresa = payload.empresa ?? "NEWSHOP";
  const p = { ...payload, dataConferencia: new Date().toISOString() };

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
