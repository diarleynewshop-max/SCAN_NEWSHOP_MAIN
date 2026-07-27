import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "crypto";
import {
  getCatalogoPedidoErrorMessage,
  receiveCatalogoPedido,
} from "../src/lib/catalogoPedidoReceiver";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-api-key, content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function headerValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getRequestToken(req: VercelRequest): string {
  const apiKey = headerValue(req.headers["x-api-key"]).trim();
  if (apiKey) return apiKey;

  const authorization = headerValue(req.headers.authorization).trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function assertAuthorized(req: VercelRequest) {
  const configured = String(process.env.CATALOGO_PEDIDOS_API_KEY ?? "").trim();
  if (!configured) {
    throw Object.assign(new Error("CATALOGO_PEDIDOS_API_KEY nao configurada."), { statusCode: 500 });
  }

  const received = getRequestToken(req);
  if (!received || !safeEquals(received, configured)) {
    throw Object.assign(new Error("Nao autorizado."), { statusCode: 401 });
  }
}

function parseBody(req: VercelRequest): Record<string, unknown> {
  const body = req.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  if (typeof body === "string") return JSON.parse(body) as Record<string, unknown>;
  if (typeof body === "object") return body as Record<string, unknown>;
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metodo nao permitido." });

  try {
    assertAuthorized(req);
    const body = parseBody(req);
    const result = await receiveCatalogoPedido(body);
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = Number((error as { statusCode?: number }).statusCode ?? 400);
    const message = getCatalogoPedidoErrorMessage(error);
    console.error("[catalogo-pedido] falha ao receber pedido", {
      message,
      error,
    });
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      ok: false,
      error: message,
    });
  }
}
