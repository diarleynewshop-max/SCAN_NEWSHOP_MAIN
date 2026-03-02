const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;

async function dispararTask(taskId: string, payload: object) {
  try {
    await fetch(`https://api.trigger.dev/api/v1/tasks/${taskId}/trigger`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TRIGGER_API_KEY}`,
      },
      body: JSON.stringify({ payload }),
    });
    console.info(`[Trigger.dev] ✅ ${taskId} disparada`);
  } catch (err) {
    console.warn(`[Trigger.dev] ❌ Falha:`, err);
  }
}

export async function dispararWebhookListaBaixada(payload: any) {
  await dispararTask("lista-baixada", {
    ...payload,
    dataDownload: new Date().toISOString(),
  });
}

export async function dispararWebhookConferenciaBaixada(payload: any) {
  await dispararTask("conferencia-baixada", {
    ...payload,
    dataConferencia: new Date().toISOString(),
  });
}
