// Trigger via serverless API (do not expose API key in frontend)
async function dispararTask(taskId: string, payload: object) {
  try {
    const res = await fetch(`/api/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ taskId, payload }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}: ${text}`);
      return;
    }
    console.info(`[Trigger.dev] ✅ ${taskId} disparada`);
  } catch (err) {
    console.warn(`[Trigger.dev] ❌ Falha de rede:`, err);
  }
}

export async function dispararWebhookListaBaixada(payload: object) {
  await dispararTask("lista-baixada", {
    ...payload,
    dataDownload: new Date().toISOString(),
  });
}

export async function dispararWebhookConferenciaBaixada(payload: object) {
  await dispararTask("conferencia-baixada", {
    ...payload,
    dataConferencia: new Date().toISOString(),
  });
}
