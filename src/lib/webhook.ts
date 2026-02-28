const TRIGGER_API_KEY = "tr_prod_7kJCCh7ASjpbnh69jS8c";

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