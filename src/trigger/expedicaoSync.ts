import { task } from "@trigger.dev/sdk/v3";
import { escolherDescricaoProdutoExterno, normalizarCodigoExterno14 } from "../lib/codigoExterno";

const SEPARACAO_API_URL = "https://api-recebimento.newgrup.cloud/functions/v1/separacao-integration";

// O Hexon unificou NEWSHOP e FACIL: todas as empresas usam a mesma credencial.
if (!process.env.HEXON_API_KEY) {
  console.warn("[expedicaoSync] HEXON_API_KEY nao configurada.");
}

interface ItemExpedicao {
  descricao: string;
  ean: string;
  quantidadeReal: number;
  externalItemRef?: string;
  itemDescricao?: string;
}

interface PayloadExpedicaoSync {
  itens: ItemExpedicao[];
  conferente?: string;
  empresa?: string;
  flag?: string;
  pedidoId?: string | null;
  conferenceId?: string | null;
  dataConferencia?: string;
}

export const expedicaoSync = task({
  id: "expedicao-sync",
  machine: "small-1x",
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 20_000 },
  run: async (payload: PayloadExpedicaoSync) => {
    const lojaLabel = (payload.empresa ?? "NEWSHOP").toUpperCase();
    const apiKey = process.env.HEXON_API_KEY;

    if (!apiKey) {
      console.warn(`[expedicaoSync] API key ausente para loja=${lojaLabel}. Abortando sem erro.`);
      return { skipped: true };
    }

    if (!payload.itens || payload.itens.length === 0) {
      console.log("[expedicaoSync] Nenhum item para enviar.");
      return { enviado: false, motivo: "sem_itens" };
    }

    const itensApi = payload.itens.map((item) => {
      const ean = normalizarCodigoExterno14(item.ean);
      const descricao = escolherDescricaoProdutoExterno({
        descricao: item.descricao,
        itemDescricao: item.itemDescricao,
        codigo: ean,
      });
      return {
        descricao,
        ean,
        quantidade: item.quantidadeReal,
        volume: 0,
        statusItem: "reposicao",
        encontrado: true,
        itemDescricao: descricao,
        externalItemRef: item.externalItemRef || ean,
      };
    });

    const dataFormatada = payload.dataConferencia
      ? new Date(payload.dataConferencia).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const referencia = String(payload.pedidoId || payload.conferenceId || "").trim();
    const externalRef = referencia ? `SCAN-${referencia}` : `SCAN-${lojaLabel}-${Date.now()}`;
    const flag = String(payload.flag ?? "").toLowerCase();
    const origemContexto = flag === "cd" || flag === "loja" ? flag : null;

    const body = {
      externalRef,
      descricao: `Conferencia ${lojaLabel} - ${dataFormatada} - ${payload.conferente ?? "App Conferencia"}`,
      destino: null,
      origemLocal: null,
      origemContexto,
      itens: itensApi,
    };

    console.log(`[expedicaoSync] Enviando separacao externa com ${itensApi.length} item(ns) [loja=${lojaLabel}]`);

    const response = await fetch(SEPARACAO_API_URL, {
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
      throw new Error(`separacao-integration retornou ${response.status}: ${responseText}`);
    }

    const result = JSON.parse(responseText);
    console.log(`[expedicaoSync] Separacao externa criada: ${result?.result?.id ?? result?.result?.externalRef}`);
    return { enviado: true, separacao: result?.result };
  },
});
