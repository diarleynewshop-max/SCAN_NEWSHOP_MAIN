/**
 * webhookRouter.ts
 * Roteia o envio para o ClickUp correto via Trigger.dev baseado em flag + empresa.
 *
 * Tanto LOJA quanto CD usam o mesmo task do Trigger.dev.
 * O worker decide o destino final olhando `payload.flag`.
 */

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;

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
    photo: string | null;
  }>;
}

async function dispararTrigger(taskId: string, payload: object) {
  if (!TRIGGER_API_KEY) {
    throw new Error("[Trigger.dev] VITE_TRIGGER_API_KEY nao configurada");
  }

  const res = await fetch(`https://api.trigger.dev/api/v1/tasks/${taskId}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIGGER_API_KEY}`,
    },
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    throw new Error(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}`);
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
    return;
  }

  if (empresa === "SOYE" || empresa === "FACIL") {
    await dispararTrigger("conferencia-baixada-sf", p);
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
