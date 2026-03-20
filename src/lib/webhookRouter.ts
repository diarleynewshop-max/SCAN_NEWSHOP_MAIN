/**
 * webhookRouter.ts
 * Roteia o envio para o ClickUp correto via Trigger.dev baseado em flag + empresa.
 *
 * TASK 1 (lista-baixada)       TASK 2 (conferencia-baixada)
 * ─────────────────────────────────────────────────────────
 * LOJA NEWSHOP → "lista-baixada"          / "conferencia-baixada"       (CLICKUP_TOKEN)
 * CD   NEWSHOP → "lista-baixada"          / "conferencia-baixada"       (CLICKUP_TOKEN + CD list)
 * LOJA SOYE    → "lista-baixada-sf"       / "conferencia-baixada-sf"    (CLICKUP_TOKEN_SF)
 * LOJA FACIL   → "lista-baixada-sf"       / "conferencia-baixada-sf"    (CLICKUP_TOKEN_SF)
 * CD SOYE/FACIL → não configurado ainda
 */

const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type ListFlag = "loja" | "cd";

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
    console.warn("[Trigger.dev] VITE_TRIGGER_API_KEY não configurada");
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
    if (!res.ok) console.warn(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}`);
    else         console.info(`[Trigger.dev] ✅ ${taskId} disparada`);
  } catch (err) {
    console.warn("[Trigger.dev] ❌ Falha de rede:", err);
  }
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

  if (flag === "cd") {
    if (empresa === "NEWSHOP") {
      await dispararTrigger("lista-baixada", p);     // index.ts → CLICKUP_TOKEN + CD list
      return;
    }
    if (empresa === "SOYE" || empresa === "FACIL") {
      await dispararTrigger("lista-baixada-sf", p);  // indexSF.ts → CLICKUP_TOKEN_SF + CD list
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

  if (flag === "cd") {
    if (empresa === "NEWSHOP") {
      await dispararTrigger("conferencia-baixada", p);    // index.ts → CLICKUP_TOKEN + CD list
      return;
    }
    if (empresa === "SOYE" || empresa === "FACIL") {
      await dispararTrigger("conferencia-baixada-sf", p); // indexSF.ts → CLICKUP_TOKEN_SF + CD list
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