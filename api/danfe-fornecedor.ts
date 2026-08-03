import type { VercelRequest, VercelResponse } from "@vercel/node";

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

function getSingle(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function getDanfeConfig() {
  const baseUrl = (
    process.env.DANFE_COLLECTOR_API_URL ||
    process.env.DANFE_API_URL ||
    "https://danfe.newgrup.cloud"
  ).replace(/\/$/, "");
  const apiKey = process.env.DANFE_COLLECTOR_API_KEY || process.env.DANFE_API_KEY || "";
  return { baseUrl, apiKey };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Metodo nao permitido" });

  try {
    const cnpj = onlyDigits(getSingle(req.query.cnpj));
    const uf = getSingle(req.query.uf).trim().toUpperCase().slice(0, 2);

    if (cnpj.length !== 14) {
      return res.status(400).json({ error: "Informe um CNPJ valido com 14 digitos." });
    }

    const { baseUrl, apiKey } = getDanfeConfig();
    if (!apiKey) {
      return res.status(500).json({ error: "DANFE_COLLECTOR_API_KEY nao configurada." });
    }

    const url = new URL(`${baseUrl}/api/v1/fornecedor-ie`);
    url.searchParams.set("cnpj", cnpj);
    if (uf) url.searchParams.set("uf", uf);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const text = await response.text().catch(() => "");
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }
    }

    if (!response.ok) {
      const message = typeof data === "object" && data && "error" in data
        ? String((data as { error?: unknown }).error)
        : `DanfeCollector retornou ${response.status}`;
      return res.status(response.status).json({ error: message, detail: data });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Falha ao consultar DanfeCollector.",
    });
  }
}
