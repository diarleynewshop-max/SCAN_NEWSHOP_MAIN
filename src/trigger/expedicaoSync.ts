import { task } from "@trigger.dev/sdk/v3";

const EXPEDICAO_API_URL = "https://wvykzzbzwyrbggzxkypf.supabase.co/functions/v1/expedicao-integration";

if (!process.env.EXPEDICAO_API_KEY) {
  console.warn("[expedicaoSync] EXPEDICAO_API_KEY nao configurada — chamadas a API serao ignoradas.");
}

interface ItemExpedicao {
  codigo: string;
  ean?: string | null;
  quantidadeReal: number;
}

interface PayloadExpedicaoSync {
  itens: ItemExpedicao[];
  conferente?: string;
  empresa?: string;
  dataConferencia?: string;
}

export const expedicaoSync = task({
  id: "expedicao-sync",
  machine: "small-1x",
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 20_000 },
  run: async (payload: PayloadExpedicaoSync) => {
    const apiKey = process.env.EXPEDICAO_API_KEY;
    if (!apiKey) {
      console.warn("[expedicaoSync] EXPEDICAO_API_KEY ausente. Abortando sem erro.");
      return { skipped: true };
    }

    if (!payload.itens || payload.itens.length === 0) {
      console.log("[expedicaoSync] Nenhum item para enviar.");
      return { enviado: false, motivo: "sem_itens" };
    }

    const itensApi = payload.itens.map((item) => ({
      descricao: item.codigo,
      ...(item.ean ? { ean: item.ean } : {}),
      quantidade: item.quantidadeReal,
    }));

    const dataFormatada = payload.dataConferencia
      ? new Date(payload.dataConferencia).toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });

    const body = {
      usuario: payload.conferente ?? "App Conferencia",
      descricao: `Conferencia ${payload.empresa ?? "NEWSHOP"} - ${dataFormatada}`,
      itens: itensApi,
    };

    console.log(`[expedicaoSync] Enviando ${itensApi.length} item(ns) para expedicao-integration`);

    const response = await fetch(EXPEDICAO_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const responseText = await response.text();
    console.log(`[expedicaoSync] status=${response.status} body=${responseText}`);

    if (!response.ok) {
      throw new Error(`expedicao-integration retornou ${response.status}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log(`[expedicaoSync] Expedicao criada: ${result?.result?.numeroFormatado ?? result?.result?.numero}`);
    return { enviado: true, expedicao: result?.result };
  },
});
