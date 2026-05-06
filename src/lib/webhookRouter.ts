/**
 * webhookRouter.ts
 * Roteia o envio para o ClickUp correto via Trigger.dev baseado em flag + empresa.
 *
 * Tanto LOJA quanto CD usam o mesmo task do Trigger.dev.
 * O worker decide o destino final olhando `payload.flag`.
 */

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;
const MAX_FOTOS_TRIGGER_RETRY = 10;

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
      payload: {
        ...original,
        itens,
        _meta: {
          ...(original._meta ?? {}),
          fotosReduzidasNoRetry: changed,
          maxFotosMantidas: MAX_FOTOS_TRIGGER_RETRY,
        },
      },
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
      payload: {
        ...original,
        produtos,
        _meta: {
          ...(original._meta ?? {}),
          fotosReduzidasNoRetry: changed,
          maxFotosMantidas: MAX_FOTOS_TRIGGER_RETRY,
        },
      },
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

  let res = await disparar(payload);

  if (!res.ok && res.status === 400) {
    const firstError = await res.text().catch(() => "");
    const retry = reduzirFotosParaTrigger(payload);

    if (retry.changed) {
      console.warn(
        `[Trigger.dev] ${taskId} retornou 400 com payload de ${getPayloadSizeKb(payload)} KB. Tentando retry sem fotos excedentes.`,
        firstError
      );
      res = await disparar(retry.payload);
    } else {
      throw new Error(`[Trigger.dev] Erro 400 ao disparar ${taskId}: ${firstError || "sem detalhe"}`);
    }
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}: ${errorText || "sem detalhe"} | payload=${getPayloadSizeKb(payload)}KB`);
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
