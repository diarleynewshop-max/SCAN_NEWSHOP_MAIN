import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";
import FormDataNode from "form-data";
import axios from "axios";
import * as cheerio from "cheerio";

type EmpresaKey = "NEWSHOP" | "SOYE" | "FACIL";

const ERP_URLS: Record<EmpresaKey, string | undefined> = {
  NEWSHOP: process.env.ERP_API_URL_NEWSHOP,
  SOYE: process.env.ERP_API_URL_SOYE,
  FACIL: process.env.ERP_API_URL_FACIL,
};

function getErpCredentials() {
  return {
    username: process.env.ERP_API_USERNAME ?? "",
    password: process.env.ERP_API_PASSWORD ?? "",
  };
}

function normalizeEmpresa(value: string): EmpresaKey {
  const upper = value.trim().toUpperCase();
  if (upper.includes("SOYE")) return "SOYE";
  if (upper.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

async function loginErpWeb(baseUrl: string, username: string, password: string): Promise<string> {
  const loginUrl = `${baseUrl}/j_spring_security_check?j_username=${encodeURIComponent(username)}&j_password=${encodeURIComponent(password)}`;

  const res = await axios.post(loginUrl, null, {
    maxRedirects: 0,
    validateStatus: (s) => s >= 200 && s < 400,
    timeout: 15_000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const cookies = res.headers["set-cookie"];
  if (!cookies) throw new Error("Login ERP: sem set-cookie na resposta");

  const jsessionId = cookies
    .map((c: string) => c.split(";")[0])
    .find((c: string) => c.startsWith("JSESSIONID="));

  if (!jsessionId) throw new Error("Login ERP: JSESSIONID nao encontrado nos cookies");
  return jsessionId;
}

interface FormField {
  name: string;
  value: string;
}

function extrairCamposFormulario(html: string): FormField[] {
  const $ = cheerio.load(html);
  const campos: FormField[] = [];

  $("input").each((_, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    const type = ($(el).attr("type") || "text").toLowerCase();
    if (type === "file" || type === "button" || type === "submit" || type === "reset") return;

    if (type === "checkbox" || type === "radio") {
      if ($(el).is(":checked")) {
        campos.push({ name, value: $(el).attr("value") ?? "on" });
      }
      return;
    }

    campos.push({ name, value: $(el).attr("value") ?? "" });
  });

  $("select").each((_, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    const selected = $(el).find("option:selected");
    campos.push({ name, value: selected.attr("value") ?? selected.text() ?? "" });
  });

  $("textarea").each((_, el) => {
    const name = $(el).attr("name");
    if (!name) return;
    campos.push({ name, value: $(el).text() ?? "" });
  });

  return campos;
}

async function lerFormularioProduto(
  baseUrl: string,
  cookie: string,
  produtoId: string
): Promise<FormField[]> {
  const url = `${baseUrl}/produto/cadastro/edita/${produtoId}`;
  const res = await axios.get(url, {
    headers: { Cookie: cookie },
    validateStatus: () => true,
    timeout: 20_000,
  });

  if (res.status !== 200) {
    throw new Error(`Ler formulario ERP: status ${res.status} para produtoId=${produtoId}`);
  }

  return extrairCamposFormulario(res.data);
}

async function uploadImagemErp(
  baseUrl: string,
  cookie: string,
  imageBuffer: Buffer,
  filename: string
): Promise<string> {
  const form = new FormDataNode();
  form.append("upload", imageBuffer, { filename, contentType: "image/jpeg" });

  const res = await axios.post(`${baseUrl}/arquivo/upload`, form, {
    headers: {
      Cookie: cookie,
      ...form.getHeaders(),
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: () => true,
    timeout: 30_000,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload imagem ERP: status ${res.status} — ${JSON.stringify(res.data)}`);
  }

  const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  const uuid = data.uuid ?? data.id ?? data.fileName ?? data.name;
  if (!uuid) throw new Error(`Upload imagem ERP: UUID nao encontrado na resposta — ${JSON.stringify(data)}`);

  return String(uuid);
}

function montarFormData(campos: FormField[], imagemUuid: string): string {
  const params = new URLSearchParams();

  for (const campo of campos) {
    if (campo.name === "produto.imagem") {
      params.append(campo.name, imagemUuid);
    } else {
      params.append(campo.name, campo.value);
    }
  }

  const hasImagemField = campos.some((c) => c.name === "produto.imagem");
  if (!hasImagemField) {
    params.append("produto.imagem", imagemUuid);
  }

  return params.toString();
}

async function salvarProdutoErp(
  baseUrl: string,
  cookie: string,
  produtoId: string,
  formBody: string
): Promise<void> {
  const res = await axios.post(`${baseUrl}/produto/cadastro/edita`, formBody, {
    headers: {
      Cookie: cookie,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${baseUrl}/produto/cadastro/edita/${produtoId}`,
    },
    maxRedirects: 5,
    validateStatus: () => true,
    timeout: 20_000,
  });

  if (res.status >= 400) {
    throw new Error(`Salvar produto ERP: status ${res.status}`);
  }
}

async function validarImagemSalva(
  baseUrl: string,
  cookie: string,
  produtoId: string,
  uuidEsperado: string
): Promise<boolean> {
  const campos = await lerFormularioProduto(baseUrl, cookie, produtoId);
  const imagemSalva = campos.find((c) => c.name === "produto.imagem")?.value;
  return imagemSalva === uuidEsperado;
}

async function comprimirFotoParaErp(base64: string): Promise<Buffer> {
  const raw = base64.includes(";base64,") ? base64.split(";base64,")[1] : base64;
  const buffer = Buffer.from(raw, "base64");

  return sharp(buffer)
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer();
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
    validado?: boolean;
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
    const baseUrl = ERP_URLS[empresa];
    if (!baseUrl) {
      throw new Error(`[erp-foto-sync] URL nao configurada para empresa ${empresa}`);
    }

    const { username, password } = getErpCredentials();
    if (!username || !password) {
      throw new Error("[erp-foto-sync] ERP_API_USERNAME ou ERP_API_PASSWORD nao configurados");
    }

    console.info(`[erp-foto-sync] Iniciando sync de ${payload.itens.length} foto(s) para ${empresa}`);

    const cookie = await loginErpWeb(baseUrl, username, password);
    console.info(`[erp-foto-sync] Login OK — sessao obtida`);

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

        const campos = await lerFormularioProduto(baseUrl, cookie, item.erpProdutoId);
        console.info(`[erp-foto-sync] Formulario lido: ${campos.length} campos`);

        const imageBuffer = await comprimirFotoParaErp(item.photoBase64);
        console.info(`[erp-foto-sync] Foto comprimida: ${imageBuffer.length} bytes`);

        const uuid = await uploadImagemErp(baseUrl, cookie, imageBuffer, `produto_${item.barcode}.jpg`);
        console.info(`[erp-foto-sync] Upload OK — uuid=${uuid}`);
        detalhe.uuid = uuid;

        const formBody = montarFormData(campos, uuid);
        await salvarProdutoErp(baseUrl, cookie, item.erpProdutoId, formBody);
        console.info(`[erp-foto-sync] Produto salvo`);

        const validado = await validarImagemSalva(baseUrl, cookie, item.erpProdutoId, uuid);
        detalhe.validado = validado;

        if (!validado) {
          console.warn(`[erp-foto-sync] AVISO: validacao falhou para produtoId=${item.erpProdutoId}. UUID esperado=${uuid}`);
        }

        detalhe.ok = true;
        result.sucesso += 1;
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
