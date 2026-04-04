/**
 * webhookRouter.ts
 * Roteia o envio para o ClickUp correto via Trigger.dev baseado em flag + empresa.
 *
 * TASK 1 (lista-baixada)       TASK 2 (conferencia-baixada)
 * ─────────────────────────────────────────────────────────
 * LOJA NEWSHOP → "lista-baixada"          / "conferencia-baixada"       (CLICKUP_TOKEN)
 * LOJA SOYE    → "lista-baixada-sf"       / "conferencia-baixada-sf"    (CLICKUP_TOKEN_SF)
 * LOJA FACIL   → "lista-baixada-sf"       / "conferencia-baixada-sf"    (CLICKUP_TOKEN_SF)
 */

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ListFlag = "loja";

export interface WebhookPayload {
  flag:        ListFlag;
  empresa:     string;
  pessoa:      string;
  titulo:      string;
  totalItens:  number;
  dataCriacao: string;
  produtos: Array<{
    barcode:    string;
    sku:        string;
    quantidade: number;
    removeTag:  boolean;
    photo:      string | null;
  }>;
}

// ── Trigger.dev helper ────────────────────────────────────────────────────────
async function dispararTrigger(taskId: string, payload: object) {
  if (!TRIGGER_API_KEY) {
    throw new Error("[Trigger.dev] VITE_TRIGGER_API_KEY não configurada");
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
  console.info(`[Trigger.dev] ✅ ${taskId} disparada`);
}

// ── ROTEADOR: TASK 1 (lista baixada) ─────────────────────────────────────────
export async function enviarParaClickUp(payload: WebhookPayload): Promise<void> {
  const { flag, empresa } = payload;
  const p = { ...payload, dataDownload: new Date().toISOString() };

  if (flag === "loja") {
    if (empresa === "NEWSHOP") {
      await dispararTrigger("lista-baixada", p);     // index.ts → CLICKUP_TOKEN
      return;
    }
    if (empresa === "SOYE" || empresa === "FACIL") {
      await dispararTrigger("lista-baixada-sf", p);  // indexSF.ts → CLICKUP_TOKEN_SF
      return;
    }
  }

  console.warn("[webhookRouter] Combinação não reconhecida:", flag, empresa);
}

// ── ROTEADOR: TASK 2 (conferência) ───────────────────────────────────────────
export async function enviarConferenciaParaClickUp(payload: object & { flag?: string; empresa?: string }): Promise<void> {
  const flag    = payload.flag    ?? "loja";
  const empresa = payload.empresa ?? "NEWSHOP";
  const p = { ...payload, dataConferencia: new Date().toISOString() };

  if (flag === "loja") {
    if (empresa === "NEWSHOP") {
      await dispararTrigger("conferencia-baixada", p);    // index.ts → CLICKUP_TOKEN
      return;
    }
    if (empresa === "SOYE" || empresa === "FACIL") {
      await dispararTrigger("conferencia-baixada-sf", p); // indexSF.ts → CLICKUP_TOKEN_SF
      return;
    }
  }

  console.warn("[webhookRouter] Conferência — combinação não reconhecida:", flag, empresa);
}

// ── Compatibilidade com imports antigos ───────────────────────────────────────
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