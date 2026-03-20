const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;

async function dispararTask(taskId: string, payload: object) {
  if (!TRIGGER_API_KEY) {
    console.warn("[Trigger.dev] Chave não configurada. Defina VITE_TRIGGER_API_KEY no .env");
    return;
  }
  try {
    const res = await fetch(`https://api.trigger.dev/api/v1/tasks/${taskId}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TRIGGER_API_KEY}`,
      },
      body: JSON.stringify({ payload }),
    });
    if (!res.ok) {
      console.warn(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}`);
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
