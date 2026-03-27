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

<<<<<<< HEAD
// API calls are proxied to/server-side; remove frontend dependency on TRIGGER API key here
=======
const TRIGGER_API_KEY = import.meta.env.VITE_TRIGGER_API_KEY as string;
>>>>>>> 98e65c1c5b8004a1a82ee777f4f99c0476c626f2

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
<<<<<<< HEAD
  // Use the serverless API proxy; no client-side key usage
  console.log(`[Trigger.dev] 🔧 Disparando task: ${taskId}`);
  try {
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, payload }),
    });
=======
  if (!TRIGGER_API_KEY) {
    throw new Error("[Trigger.dev] VITE_TRIGGER_API_KEY não configurada");
  }
  
  console.log(`[Trigger.dev] 🔧 Disparando task: ${taskId}`);
  
  try {
    // USAR PROXY SERVER-SIDE (sem CORS)
    const res = await fetch('/api/trigger-proxy', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        task: taskId,
        payload 
      }),
    });
    
>>>>>>> 98e65c1c5b8004a1a82ee777f4f99c0476c626f2
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`[Trigger.dev] Erro ${res.status} ao disparar ${taskId}: ${errorText}`);
    }
<<<<<<< HEAD
=======
    
>>>>>>> 98e65c1c5b8004a1a82ee777f4f99c0476c626f2
    const result = await res.json();
    console.info(`[Trigger.dev] ✅ ${taskId} disparada com sucesso:`, result.runId);
    return result;
  } catch (error) {
    console.error(`[Trigger.dev] 💥 Erro ao disparar ${taskId}:`, error);
    throw error;
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
