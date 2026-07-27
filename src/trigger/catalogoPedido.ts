import { task } from "@trigger.dev/sdk/v3";

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const err = error as Record<string, unknown>;
    const message =
      asString(err.message)
      || asString(err.details)
      || asString(err.hint)
      || asString(err.code)
      || asString(err.error);
    if (message) return message;
  }
  return asString(error) || "Erro desconhecido.";
}

function resolveScanPedidoUrl(): string {
  const raw =
    process.env.CATALOGO_PEDIDOS_SCAN_API_URL
    || process.env.SCAN_PEDIDOS_API_URL
    || process.env.SCAN_NEWSHOP_PEDIDOS_API_URL
    || "https://scan-newshop-main.vercel.app/api/catalogo-pedido";

  const trimmed = raw.replace(/\/+$/, "");
  return /\/api\/catalogo-pedido$/i.test(trimmed)
    ? trimmed
    : `${trimmed}/api/catalogo-pedido`;
}

function getScanApiKey(): string {
  return asString(process.env.CATALOGO_PEDIDOS_API_KEY || process.env.SCAN_PEDIDOS_API_KEY);
}

export const catalogoPedido = task({
  id: "catalogo-pedido",
  machine: "small-1x",
  maxDuration: 120,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async (payload: Record<string, unknown>) => {
    const numeroPedido = payload.numeroPedido ?? payload.codigoPedido ?? payload.pedidoCodigo;
    const loja = payload.loja ?? payload.empresa ?? payload.lojaId;
    const cliente = payload.nomeCliente ?? payload.clienteNome ?? payload.cliente;

    try {
      const apiKey = getScanApiKey();
      if (!apiKey) {
        throw new Error("CATALOGO_PEDIDOS_API_KEY nao configurada no Trigger.dev.");
      }

      console.info("[catalogo-pedido-trigger] encaminhando pedido para o SCAN", {
        numeroPedido,
        loja,
        cliente,
      });

      const response = await fetch(resolveScanPedidoUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = text ? JSON.parse(text) as Record<string, unknown> : {};
      } catch {
        throw new Error(`SCAN respondeu ${response.status}: ${text.slice(0, 160)}`);
      }

      if (!response.ok || data.ok === false) {
        throw new Error(asString(data.error) || asString(data.message) || `SCAN respondeu ${response.status}`);
      }

      console.info("[catalogo-pedido-trigger] SCAN aceitou o pedido", {
        numeroPedido,
        loja,
        scanPedidoId: data.pedidoId,
        conferenceId: data.conferenceId,
      });

      return {
        ok: true,
        numeroPedido,
        loja,
        cliente,
        scan: data,
      };
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("[catalogo-pedido-trigger] falha ao encaminhar pedido para o SCAN", {
        message,
        numeroPedido,
        loja,
        cliente,
      });
      throw error instanceof Error ? error : new Error(message);
    }
  },
});
