const WEBHOOK_LISTA = import.meta.env.VITE_WEBHOOK_LISTA as string;
const WEBHOOK_CONFERENCIA = import.meta.env.VITE_WEBHOOK_CONFERENCIA as string;

async function dispararWebhook(url: string, payload: object) {
  if (!url) {
    console.warn("[Webhook] URL não configurada.");
    return;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn(`[Webhook] Erro ${res.status}`);
    else console.info(`[Webhook] ✅ Disparado`);
  } catch (err) {
    console.warn(`[Webhook] ❌ Falha:`, err);
  }
}

export async function dispararWebhookListaBaixada(payload: object) {
  await dispararWebhook(WEBHOOK_LISTA, {
    ...payload,
    dataDownload: new Date().toISOString(),
  });
}

export async function dispararWebhookConferenciaBaixada(payload: object) {
  await dispararWebhook(WEBHOOK_CONFERENCIA, {
    ...payload,
    dataConferencia: new Date().toISOString(),
  });
}
