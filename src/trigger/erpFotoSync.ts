import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import FormDataNode from "form-data";
import axios from "axios";

type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";

const HOSTS: Record<EmpresaKey, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

function getEnv(empresa: EmpresaKey, key: "URL" | "USERNAME" | "PASSWORD" | "TOKEN"): string {
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}`] ||
    ""
  );
}

function getWebCookie(empresa: EmpresaKey): string {
  return process.env[`ERP_WEB_COOKIE_${empresa}`] || process.env.ERP_WEB_COOKIE || "";
}

function resolveBaseUrl(empresa: EmpresaKey): string {
  const configuredUrl = (getEnv(empresa, "URL") || `https://${HOSTS[empresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function normalizeEmpresa(value: string): EmpresaKey {
  const upper = value.trim().toUpperCase();
  if (upper.includes("SOYE")) return "SOYE";
  if (upper.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

async function getAccessToken(empresa: EmpresaKey, baseUrl: string): Promise<string> {
  const configuredToken = getEnv(empresa, "TOKEN");
  if (configuredToken) return configuredToken;

  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  if (!username || !password) {
    throw new Error(`Credenciais do ERP nao configuradas para ${empresa}`);
  }

  const res = await axios.post(`${baseUrl}/auth`, { username, password }, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    validateStatus: () => true,
    timeout: 15_000,
  });

  if (res.status >= 400) {
    throw new Error(`Login ERP falhou (${res.status}): ${JSON.stringify(res.data)}`);
  }

  const data = res.data as Record<string, unknown>;
  const token =
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.token === "string" && data.token) ||
    (typeof data.jwt === "string" && data.jwt) ||
    "";

  if (!token) throw new Error("ERP nao retornou access token no login");
  return token;
}

function findUuid(value: unknown): string {
  if (typeof value === "string") {
    return value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] || "";
  }
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  for (const v of [record.uuid, record.uid, record.id, record.nome, record.name]) {
    const found = findUuid(v);
    if (found) return found;
  }
  for (const v of Object.values(record)) {
    const found = findUuid(v);
    if (found) return found;
  }
  return "";
}

async function comprimirFotoParaErp(base64: string): Promise<Buffer> {
  const raw = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
  const buffer = Buffer.from(raw, "base64");
  return sharp(buffer)
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
}

async function loginErpWeb(origin: string, empresa: EmpresaKey): Promise<string> {
  const username = getEnv(empresa, "USERNAME");
  const password = getEnv(empresa, "PASSWORD");
  if (!username || !password) {
    console.warn("[erp-foto-sync] Login web: sem credenciais");
    return "";
  }

  const extractJsessionId = (res: { headers: Record<string, unknown> }): string => {
    const raw = res.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
    const found = cookies
      .map((c: string) => c.split(";")[0])
      .find((c: string) => c.startsWith("JSESSIONID="));
    return found || "";
  };

  const attempts = [
    `${origin}/j_spring_security_check?j_username=${encodeURIComponent(username)}&j_password=${encodeURIComponent(password)}`,
    `${origin}/j_spring_security_check`,
  ];

  for (const url of attempts) {
    try {
      const isQueryParam = url.includes("j_username=");
      const res = await axios.post(
        url,
        isQueryParam ? undefined : `j_username=${encodeURIComponent(username)}&j_password=${encodeURIComponent(password)}`,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          maxRedirects: 5,
          validateStatus: () => true,
          timeout: 15_000,
        }
      );

      const jsessionId = extractJsessionId(res);
      if (jsessionId) {
        console.info(`[erp-foto-sync] Login web OK — ${jsessionId.slice(0, 25)}...`);
        return jsessionId;
      }

      console.warn(`[erp-foto-sync] Login web ${isQueryParam ? "query" : "body"}: status=${res.status}, sem JSESSIONID nos cookies`);
    } catch (err) {
      console.warn(`[erp-foto-sync] Login web erro: ${err instanceof Error ? err.message : err}`);
    }
  }

  return "";
}

interface UploadResult {
  uuid: string | undefined;
  mode: string;
  directUpdate?: boolean;
}

async function tentarUploadImagem(
  baseUrl: string,
  token: string,
  imageBuffer: Buffer,
  barcode: string,
  webCookie: string,
  empresa: EmpresaKey,
  produtoId?: string
): Promise<UploadResult> {
  const origin = baseUrl.replace(/\/api$/, "");
  const filename = `nao_tem_${barcode}.jpg`;

  const freshCookie = await loginErpWeb(origin, empresa);
  const sessionCookie = freshCookie || webCookie;

  const strategies = [
    {
      mode: "erp-frame-multipart-upload",
      url: `${origin}/arquivo/upload`,
      useToken: false,
      buildBody: () => {
        const form = new FormDataNode();
        form.append("upload", imageBuffer, { filename, contentType: "image/jpeg" });
        return {
          body: form,
          headers: {
            ...form.getHeaders(),
            Cookie: sessionCookie,
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: origin,
            Referer: `${origin}/arquivo/frame`,
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        };
      },
      skip: !sessionCookie,
    },
    {
      mode: "api-multipart-upload",
      url: `${baseUrl}/v1/arquivo/upload`,
      useToken: true,
      buildBody: () => {
        const form = new FormDataNode();
        form.append("upload", imageBuffer, { filename, contentType: "image/jpeg" });
        return { body: form, headers: form.getHeaders() };
      },
      skip: false,
    },
    {
      mode: "json-arquivo-base64",
      url: `${baseUrl}/v1/arquivo/upload`,
      useToken: true,
      buildBody: () => ({
        body: JSON.stringify({
          nome: filename,
          descricao: barcode,
          mimeType: "image/jpeg",
          arquivo: imageBuffer.toString("base64"),
        }),
        headers: { "Content-Type": "application/json" },
      }),
      skip: false,
    },
    {
      mode: "json-file-base64",
      url: `${baseUrl}/v1/arquivo/upload`,
      useToken: true,
      buildBody: () => ({
        body: JSON.stringify({
          filename,
          codigo: barcode,
          contentType: "image/jpeg",
          file: imageBuffer.toString("base64"),
        }),
        headers: { "Content-Type": "application/json" },
      }),
      skip: false,
    },
    {
      mode: "totvs-produto-imagem",
      url: `${origin}/CadastrosEstruturaisAPI/api/v1/Produto/produto-imagem`,
      useToken: true,
      buildBody: () => ({
        body: JSON.stringify({
          idProduto: produtoId ? Number(produtoId) : undefined,
          descricao: barcode.slice(0, 40),
          imagem: imageBuffer.toString("base64"),
          indPrincipal: "S",
          dispImagem: "F",
          statusEcomm: "A",
        }),
        headers: { "Content-Type": "application/json" },
      }),
      skip: false,
    },
    {
      mode: "frame-multipart-with-token",
      url: `${origin}/arquivo/upload`,
      useToken: false,
      buildBody: () => {
        const form = new FormDataNode();
        form.append("upload", imageBuffer, { filename, contentType: "image/jpeg" });
        return {
          body: form,
          headers: {
            ...form.getHeaders(),
            Authorization: token,
            Accept: "application/json, text/javascript, */*; q=0.01",
            Origin: origin,
            Referer: `${origin}/arquivo/frame`,
            "X-Requested-With": "XMLHttpRequest",
          },
        };
      },
      skip: false,
    },
  ];

  for (const strategy of strategies) {
    if (strategy.skip) continue;

    try {
      const { body, headers } = strategy.buildBody();
      const res = await axios.post(strategy.url, body, {
        headers: {
          ...(strategy.useToken ? { Authorization: token } : {}),
          Accept: "application/json",
          ...headers,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: () => true,
        timeout: 30_000,
      });

      const contentType = res.headers["content-type"] || "";
      if (res.status >= 200 && res.status < 300 && !contentType.includes("text/html")) {
        const uuid = findUuid(res.data);
        console.info(`[erp-foto-sync] Upload OK via ${strategy.mode} — uuid=${uuid || "(sem uuid, directUpdate)"}`);
        return { uuid: uuid || undefined, mode: strategy.mode, directUpdate: !uuid };
      }

      const preview = typeof res.data === "string" ? res.data.slice(0, 300) : JSON.stringify(res.data).slice(0, 300);
      console.warn(`[erp-foto-sync] Upload ${strategy.mode} falhou: status=${res.status} ct=${contentType} body=${preview}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[erp-foto-sync] Upload ${strategy.mode} erro: ${msg}`);
    }
  }

  throw new Error("Nenhuma estrategia de upload funcionou no ERP");
}

async function lerProdutoCompleto(
  baseUrl: string,
  token: string,
  produtoId: string
): Promise<Record<string, unknown>> {
  const res = await axios.get(`${baseUrl}/v1/produto/produtos/${produtoId}`, {
    headers: { Authorization: token, Accept: "application/json" },
    validateStatus: () => true,
    timeout: 15_000,
  });

  if (res.status >= 400) {
    throw new Error(`Ler produto ERP: status ${res.status} para produtoId=${produtoId}`);
  }

  return res.data as Record<string, unknown>;
}

async function salvarProdutoComImagem(
  baseUrl: string,
  token: string,
  produtoId: string,
  produto: Record<string, unknown>,
  imagemUuid: string
): Promise<void> {
  const payload = { ...produto, imagem: imagemUuid };

  const res = await axios.put(
    `${baseUrl}/v1/produto/produtos/${encodeURIComponent(produtoId)}`,
    JSON.stringify(payload),
    {
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      validateStatus: () => true,
      timeout: 20_000,
    }
  );

  if (res.status >= 400) {
    throw new Error(`Salvar produto ERP: status ${res.status} — ${JSON.stringify(res.data).slice(0, 500)}`);
  }
}

interface ErpFotoSyncItem {
  erpProdutoId: string;
  photoBase64: string;
  barcode: string;
}

interface ErpFotoSyncPayload {
  empresa: string;
  itens: ErpFotoSyncItem[];
}

interface ErpFotoSyncResult {
  empresa: string;
  total: number;
  sucesso: number;
  falha: number;
  detalhes: Array<{
    erpProdutoId: string;
    barcode: string;
    ok: boolean;
    uuid?: string;
    mode?: string;
    erro?: string;
  }>;
}

export const erpFotoSync = task({
  id: "erp-foto-sync",
  machine: "small-1x",
  maxDuration: 300,
  retry: { maxAttempts: 2, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 30_000 },
  run: async (payload: ErpFotoSyncPayload): Promise<ErpFotoSyncResult> => {
    const enabled = process.env.ERP_FOTO_SYNC_ENABLED === "true";
    if (!enabled) {
      console.info("[erp-foto-sync] Feature flag desabilitada. Pulando.");
      return { empresa: payload.empresa, total: payload.itens.length, sucesso: 0, falha: 0, detalhes: [] };
    }

    const empresa = normalizeEmpresa(payload.empresa);
    const baseUrl = resolveBaseUrl(empresa);
    const webCookie = getWebCookie(empresa);

    console.info(`[erp-foto-sync] Iniciando sync de ${payload.itens.length} foto(s) para ${empresa} — baseUrl=${baseUrl}`);

    const token = await getAccessToken(empresa, baseUrl);
    console.info("[erp-foto-sync] Auth OK — token obtido");

    const result: ErpFotoSyncResult = {
      empresa,
      total: payload.itens.length,
      sucesso: 0,
      falha: 0,
      detalhes: [],
    };

    for (const item of payload.itens) {
      const detalhe: ErpFotoSyncResult["detalhes"][0] = {
        erpProdutoId: item.erpProdutoId,
        barcode: item.barcode,
        ok: false,
      };

      try {
        console.info(`[erp-foto-sync] Processando produtoId=${item.erpProdutoId} (${item.barcode})`);

        const imageBuffer = await comprimirFotoParaErp(item.photoBase64);
        console.info(`[erp-foto-sync] Foto comprimida: ${imageBuffer.length} bytes`);

        const upload = await tentarUploadImagem(baseUrl, token, imageBuffer, item.barcode, webCookie, empresa, item.erpProdutoId);
        detalhe.uuid = upload.uuid;
        detalhe.mode = upload.mode;

        if (upload.directUpdate) {
          console.info(`[erp-foto-sync] Upload directUpdate — sem necessidade de PUT`);
          detalhe.ok = true;
          result.sucesso += 1;
        } else if (upload.uuid) {
          const produto = await lerProdutoCompleto(baseUrl, token, item.erpProdutoId);
          console.info(`[erp-foto-sync] Produto lido — ${Object.keys(produto).length} campos`);

          await salvarProdutoComImagem(baseUrl, token, item.erpProdutoId, produto, upload.uuid);
          console.info(`[erp-foto-sync] PUT OK — imagem=${upload.uuid}`);

          detalhe.ok = true;
          result.sucesso += 1;
        } else {
          detalhe.erro = "Upload aceito mas sem UUID — nao foi possivel vincular ao produto";
          result.falha += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[erp-foto-sync] ERRO produtoId=${item.erpProdutoId}: ${msg}`);
        detalhe.erro = msg;
        result.falha += 1;
      }

      result.detalhes.push(detalhe);
    }

    console.info(`[erp-foto-sync] Concluido: ${result.sucesso} OK, ${result.falha} falha(s)`);
    return result;
  },
});
