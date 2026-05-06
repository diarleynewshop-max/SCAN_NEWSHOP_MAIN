import { task } from "@trigger.dev/sdk/v3";
import sharp from "sharp";

type EmpresaRelatorio = "NEWSHOP" | "SOYE" | "FACIL";
type FlagRelatorio = "loja" | "cd";
type ErpProduto = Record<string, unknown> & { id?: number | string };

const MAX_CLICKUP_DESCRIPTION_CHARS = 12000;
const RELATORIO_STATUS_CANDIDATES = ["Relatorio", "RELATORIO", "Relatório", "RELATÓRIO"];
const ERP_PHOTO_CONCURRENCY = 4;
const ERP_PHOTO_MAX_ITEMS = 120;
const DEFAULT_RELATORIO_LISTS: Record<EmpresaRelatorio, string> = {
  NEWSHOP: "901325900510",
  SOYE: "901326607319",
  FACIL: "901326607320",
};
const ERP_HOSTS: Record<EmpresaRelatorio, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  SOYE: "soye.varejofacil.com",
  FACIL: "facil.varejofacil.com",
};
const erpTokenCache = new Map<string, string>();

function normalizarEmpresa(value: unknown): EmpresaRelatorio {
  const empresa = String(value ?? "NEWSHOP").trim().toUpperCase();
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function normalizarFlag(value: unknown): FlagRelatorio {
  return String(value ?? "loja").trim().toLowerCase() === "cd" ? "cd" : "loja";
}

function getPrimeiraEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function getClickUpToken(empresa: EmpresaRelatorio): string {
  if (empresa === "NEWSHOP") {
    return getPrimeiraEnv("CLICKUP_TOKEN", "CLICKUP_API_TOKEN", "VITE_CLICKUP_TOKEN_NEWSHOP") ?? "";
  }

  return getPrimeiraEnv("CLICKUP_TOKEN_SF", "CLICKUP_API_TOKEN_SF", "CLICKUP_API_TOKEN", "VITE_CLICKUP_TOKEN_SF") ?? "";
}

function getErpEnv(empresa: EmpresaRelatorio, key: "URL" | "USERNAME" | "PASSWORD" | "TOKEN"): string {
  return (
    process.env[`ERP_API_${key}_${empresa}`] ||
    process.env[`VITE_ERP_API_${key}_${empresa}`] ||
    process.env[`ERP_API_${key}`] ||
    process.env[`VITE_ERP_API_${key}`] ||
    ""
  );
}

function getErpApiBaseUrl(empresa: EmpresaRelatorio): string {
  const configuredUrl = (getErpEnv(empresa, "URL") || `https://${ERP_HOSTS[empresa]}`).replace(/\/$/, "");
  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
}

function resolveTokenFromAuth(data: Record<string, unknown>): string {
  return (
    (typeof data.accessToken === "string" && data.accessToken) ||
    (typeof data.access_token === "string" && data.access_token) ||
    (typeof data.token === "string" && data.token) ||
    (typeof data.jwt === "string" && data.jwt) ||
    ""
  );
}

async function getErpAccessToken(empresa: EmpresaRelatorio, apiBaseUrl: string): Promise<string> {
  const configuredToken = getErpEnv(empresa, "TOKEN");
  if (configuredToken) return configuredToken;

  const username = getErpEnv(empresa, "USERNAME");
  const password = getErpEnv(empresa, "PASSWORD");
  if (!username || !password) throw new Error(`Credenciais ERP nao configuradas para ${empresa}.`);

  const cacheKey = `${empresa}:${apiBaseUrl}:${username}`;
  const cached = erpTokenCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(`${apiBaseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) throw new Error(`ERP auth ${response.status} para ${empresa}.`);

  const token = resolveTokenFromAuth((await response.json()) as Record<string, unknown>);
  if (!token) throw new Error(`ERP nao retornou token para ${empresa}.`);

  erpTokenCache.set(cacheKey, token);
  return token;
}

async function fetchErpJson<T>(apiBaseUrl: string, token: string, path: string): Promise<T | null> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: token, Accept: "application/json" },
  });

  if (response.status === 401) erpTokenCache.clear();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ERP ${response.status} em ${path}`);

  return (await response.json()) as T;
}

function normalizarEans(codigo: string): string[] {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];
  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));
  return [...new Set(candidatos.filter(Boolean))];
}

async function buscarProdutoErp(apiBaseUrl: string, token: string, codigo: string): Promise<ErpProduto | null> {
  for (const candidato of normalizarEans(codigo)) {
    const fiql = encodeURIComponent(`id==${candidato}`);
    const codAux = await fetchErpJson<{ items?: Array<{ produtoId?: number }> }>(
      apiBaseUrl,
      token,
      `/v1/produto/codigos-auxiliares?q=${fiql}&count=5`
    ).catch(() => null);
    const produtoId = codAux?.items?.find((item) => item?.produtoId)?.produtoId;
    if (produtoId) {
      const produto = await fetchErpJson<ErpProduto>(apiBaseUrl, token, `/v1/produto/produtos/${produtoId}`).catch(() => null);
      if (produto?.id) return produto;
    }
  }

  return await fetchErpJson<ErpProduto>(apiBaseUrl, token, `/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`).catch(() => null);
}

function findImageReference(value: unknown, depth = 0): string | null {
  if (depth > 4 || !value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageReference(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["imagem", "imagemUrl", "urlImagem", "foto", "fotoUrl", "image", "imageUrl", "url", "src"]) {
    const found = findImageReference(record[key], depth + 1);
    if (found) return found;
  }

  return null;
}

function buildImageCandidates(originUrl: string, src: string, produtoId: string): string[] {
  const trimmed = src.trim();
  if (!trimmed) return [];
  if (/^data:image\//i.test(trimmed)) return [trimmed];
  if (/^https?:\/\//i.test(trimmed)) return [trimmed];
  if (trimmed.startsWith("/")) return [`${originUrl}${trimmed}`];

  const encoded = encodeURIComponent(trimmed);
  return [
    `${originUrl}/arquivo/view?uuid=${encoded}`,
    `${originUrl}/arquivo/download?uuid=${encoded}`,
    `${originUrl}/api/v1/produto/produtos/${encodeURIComponent(produtoId)}/imagens/${encoded}`,
    `${originUrl}/api/v1/produto/produtos/${encodeURIComponent(produtoId)}/imagem/${encoded}`,
    `${originUrl}/api/v1/produto/produtos/${encodeURIComponent(produtoId)}/imagens`,
    `${originUrl}/api/v1/produto/produtos/${encodeURIComponent(produtoId)}/imagem`,
    `${originUrl}/${encoded}`,
  ];
}

async function fetchImageDataUrl(originUrl: string, token: string, src: string, produtoId: string): Promise<string | null> {
  for (const url of buildImageCandidates(originUrl, src, produtoId)) {
    if (url.startsWith("data:image/")) return url;

    const response = await fetch(url, {
      headers: { Authorization: token, Accept: "image/*,*/*" },
    }).catch(() => null);

    const contentType = response?.headers.get("content-type") || "";
    if (!response?.ok || !contentType.startsWith("image/")) continue;

    const input = Buffer.from(await response.arrayBuffer());
    const output = await sharp(input)
      .resize({ width: 420, height: 420, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 68 })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  }

  return null;
}

async function buscarFotoErpPorCodigo(empresa: EmpresaRelatorio, codigo: unknown): Promise<string | null> {
  const codigoLimpo = String(codigo ?? "").trim();
  if (!codigoLimpo) return null;

  try {
    const apiBaseUrl = getErpApiBaseUrl(empresa);
    const originUrl = apiBaseUrl.replace(/\/api$/, "");
    const token = await getErpAccessToken(empresa, apiBaseUrl);
    const produto = await buscarProdutoErp(apiBaseUrl, token, codigoLimpo);
    if (!produto?.id) return null;

    const src = findImageReference(produto.imagens) || findImageReference(produto);
    if (!src) return null;

    return await fetchImageDataUrl(originUrl, token, src, String(produto.id));
  } catch (error) {
    console.warn("[TASK 3] Foto ERP nao carregada", {
      empresa,
      codigo: codigoLimpo,
      erro: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

function getRelatorioListId(empresa: EmpresaRelatorio): string {
  const listId = empresa === "NEWSHOP"
    ? getPrimeiraEnv(
        "CLICKUP_RELATORIO_LIST_ID_NEWSHOP",
        "CLICKUP_LIST_ID_RELATORIO_NEWSHOP",
        "CLICKUP_RELATORIO_LIST_ID",
        "CLICKUP_LIST_ID_RELATORIO",
        "CLICKUP_LIST_ID"
      )
    : getPrimeiraEnv(
        `CLICKUP_RELATORIO_LIST_ID_${empresa}`,
        `CLICKUP_LIST_ID_RELATORIO_${empresa}`,
        "CLICKUP_RELATORIO_LIST_ID_SF",
        "CLICKUP_LIST_ID_RELATORIO_SF",
        `CLICKUP_LIST_ID_${empresa}_LOJA`,
        `CLICKUP_LOJA_LIST_ID_${empresa}`,
        `CLICKUP_LIST_ID_${empresa}`,
        "CLICKUP_LIST_ID_SF"
      );

  if (listId) return listId;

  if (empresa !== "NEWSHOP") {
    console.warn(
      `[TASK 3] Lista de relatorio ${empresa} nao configurada. Usando lista LOJA ${empresa} para evitar envio para NEWSHOP.`
    );
  }

  return DEFAULT_RELATORIO_LISTS[empresa];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizarNomeArquivo(value: unknown): string {
  return String(value ?? "relatorio")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "relatorio";
}

function statusLabel(status: unknown): string {
  const value = String(status ?? "");
  if (value === "nao_tem") return "Nao tem";
  if (value === "nao_tem_tudo" || value === "parcial") return "Parcial";
  if (value === "pendente") return "Pendente";
  return "Separado";
}

function calcularResumo(itens: any[]) {
  return {
    separado: itens.filter((item) => item.status === "separado").length,
    naoTem: itens.filter((item) => item.status === "nao_tem").length,
    parcial: itens.filter((item) => item.status === "nao_tem_tudo" || item.status === "parcial").length,
    pendente: itens.filter((item) => item.status === "pendente").length,
  };
}

async function enriquecerItensComFotosErp(empresa: EmpresaRelatorio, itens: any[]): Promise<any[]> {
  const codigoJaBuscado = new Map<string, string | null>();
  let buscados = 0;

  return await mapWithConcurrency(itens, ERP_PHOTO_CONCURRENCY, async (item) => {
    if (typeof item?.photo === "string" && item.photo.startsWith("data:image/")) return item;
    if (buscados >= ERP_PHOTO_MAX_ITEMS) return item;

    const codigo = String(item?.codigo ?? "").trim();
    if (!codigo) return item;

    if (!codigoJaBuscado.has(codigo)) {
      buscados += 1;
      codigoJaBuscado.set(codigo, await buscarFotoErpPorCodigo(empresa, codigo));
    }

    return { ...item, photo: codigoJaBuscado.get(codigo) ?? item.photo ?? null };
  });
}

function montarHtmlRelatorio(payload: any, empresa: EmpresaRelatorio, flag: FlagRelatorio, dataLabel: string, itens: any[]): string {
  const resumo = payload.resumo ?? calcularResumo(itens);
  const total = itens.length;
  const faltantes = itens.filter((item: any) => item.status === "nao_tem").length;
  const parciais = itens.filter((item: any) => item.status === "nao_tem_tudo" || item.status === "parcial").length;
  const criticos = faltantes + parciais;
  const cards = itens.map((item: any) => {
    const status = item.status === "nao_tem_tudo" ? "parcial" : String(item.status ?? "separado");
    const photo = typeof item.photo === "string" && item.photo.startsWith("data:image/") ? item.photo : null;
    const statusClass = escapeHtml(status);
    const real = item.quantidadeReal ?? item.real ?? "-";

    return `<article class="card ${statusClass}">
      <div class="photo-wrap">${photo ? `<img class="photo" src="${photo}" alt="${escapeHtml(item.codigo)}" loading="lazy">` : `<div class="no-photo">Sem foto</div>`}</div>
      <div class="body">
        <div class="topline">
          <span class="code">${escapeHtml(item.codigo)}</span>
          <span class="tag ${statusClass}">${escapeHtml(statusLabel(item.status))}</span>
        </div>
        <div class="sku">${escapeHtml(item.sku || "SKU nao informado")}</div>
        <div class="meta">${escapeHtml(item.secao || "Sem secao")} | ${escapeHtml(item.digito || "-")}</div>
        <div class="qty">
          <span><small>Pedido</small>${escapeHtml(item.quantidadePedida ?? item.pedido ?? "-")}</span>
          <span><small>Real</small>${escapeHtml(real)}</span>
        </div>
      </div>
    </article>`;
  }).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Relatorio ${escapeHtml(empresa)} ${escapeHtml(dataLabel)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f3f4f2;color:#171717;font-family:Arial,sans-serif;padding:22px}
    header,.stats,.summary,.grid{max-width:1320px;margin:0 auto}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px;border-bottom:2px solid #171717;padding-bottom:12px}
    h1{font-size:24px;margin:0;font-weight:900}.muted{color:#555;font-size:12px;margin-top:4px}.pill{border:1px solid #222;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:800;background:#fff}
    .stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin-bottom:12px}
    .stat{background:#fff;border:1px solid #d8d8d4;border-radius:8px;padding:10px}.stat strong{display:block;font-size:24px;line-height:1}.stat span{font-size:11px;color:#666;text-transform:uppercase;font-weight:800}
    .summary{background:#fff;border:1px solid #d8d8d4;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:13px;display:flex;gap:18px;flex-wrap:wrap}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:10px}.card{background:#fff;border:1px solid #d8d8d4;border-left:5px solid #22c55e;border-radius:8px;overflow:hidden;break-inside:avoid}
    .card.nao_tem{border-left-color:#ef4444}.card.parcial{border-left-color:#eab308}.card.pendente{border-left-color:#9ca3af}
    .photo-wrap{background:#e9e9e4}.photo,.no-photo{width:100%;aspect-ratio:1;display:block}.photo{object-fit:cover}.no-photo{display:flex;align-items:center;justify-content:center;color:#777;font-weight:800;font-size:12px}
    .body{padding:9px}.topline{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}.code{font-family:monospace;font-weight:900;font-size:13px;word-break:break-all}
    .sku{font-size:11px;color:#555;min-height:28px;margin-top:4px;line-height:1.25}.meta{font-size:10px;color:#777;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .qty{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}.qty span{background:#f4f4f1;border-radius:6px;padding:6px;font-size:20px;font-weight:900}.qty small{display:block;font-size:9px;color:#666;text-transform:uppercase;margin-bottom:2px}
    .tag{font-size:10px;font-weight:900;border-radius:5px;padding:4px 6px;white-space:nowrap;background:#dcfce7;color:#166534}.tag.nao_tem{background:#fee2e2;color:#991b1b}.tag.parcial{background:#fef3c7;color:#92400e}.tag.pendente{background:#e5e7eb;color:#374151}
    @media(max-width:700px){body{padding:12px}header{display:block}.pill{display:inline-block;margin-top:8px}.stats{grid-template-columns:repeat(2,1fr)}.grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Relatorio de conferencia</h1>
      <div class="muted">${escapeHtml(dataLabel)} | Conferente: ${escapeHtml(payload.conferente || "-")}</div>
    </div>
    <div class="pill">${escapeHtml(empresa)} | ${escapeHtml(flag.toUpperCase())}</div>
  </header>
  <section class="stats">
    <div class="stat"><strong>${total}</strong><span>Total</span></div>
    <div class="stat"><strong>${resumo.separado ?? 0}</strong><span>Separado</span></div>
    <div class="stat"><strong>${resumo.naoTem ?? 0}</strong><span>Nao tem</span></div>
    <div class="stat"><strong>${resumo.parcial ?? 0}</strong><span>Parcial</span></div>
    <div class="stat"><strong>${resumo.pendente ?? 0}</strong><span>Pendente</span></div>
  </section>
  <section class="summary">
    <strong>Criticos: ${criticos}</strong>
    <span>Faltantes: ${faltantes}</span>
    <span>Parciais: ${parciais}</span>
  </section>
  <main class="grid">${cards}</main>
</body>
</html>`;
}

async function criarTarefaClickUp(token: string, listId: string, nome: string, descricao: string): Promise<string> {
  const baseBody = { name: nome, description: descricao.slice(0, MAX_CLICKUP_DESCRIPTION_CHARS) };
  console.log(`[TASK 3] Criando task ClickUp | lista=${listId} | nome="${nome}"`);
  let lastError = "";

  for (const status of RELATORIO_STATUS_CANDIDATES) {
    const response = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ ...baseBody, status }),
    });
    console.log(`[TASK 3] Criar com status "${status}" retornou ${response.status}`);

    if (response.ok) {
      const data = await response.json();
      return data.id;
    }

    lastError = await response.text();
  }

  throw new Error(
    `ClickUp nao aceitou status de relatorio na lista ${listId}. Crie/renomeie o status para "Relatorio" ou configure a lista correta. Ultimo erro: ${lastError}`
  );
}

async function anexarHtmlNaTarefa(token: string, taskId: string, nomeArquivo: string, html: string) {
  const formData = new FormData();
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  formData.append("attachment", blob, `${nomeArquivo}.html`);
  console.log(`[TASK 3] Anexando HTML | task=${taskId} | arquivo=${nomeArquivo}.html | bytes=${html.length}`);

  const response = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
    method: "POST",
    headers: {
      Authorization: token,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`ClickUp ${response.status} ao anexar HTML: ${await response.text()}`);
  }

  console.log(`[TASK 3] HTML anexado | task=${taskId} | status=${response.status}`);
}

export const relatorioDiretoria = task({
  id: "relatorio-diretoria",
  machine: "small-1x",
  maxDuration: 1000,
  run: async (payload: any) => {
    const empresa = normalizarEmpresa(payload.empresa);
    const flag = normalizarFlag(payload.flag);
    const token = getClickUpToken(empresa);
    const listId = getRelatorioListId(empresa);
    const dataBase = payload.dataConferencia ? new Date(payload.dataConferencia) : new Date();
    const dataLabel = dataBase.toLocaleString("pt-BR", { timeZone: "America/Fortaleza" });
    const itensBase = Array.isArray(payload.itens) ? payload.itens : [];
    const itens = await enriquecerItensComFotosErp(empresa, itensBase);
    const resumo = payload.resumo ?? calcularResumo(itens);

    if (!token) throw new Error(`Token ClickUp nao configurado para ${empresa}.`);

    console.log(`[TASK 3] Inicio | empresa=${empresa} | flag=${flag} | lista=${listId} | itens=${itens.length}`);

    const nome = `TASK 3 - Relatorio - ${empresa} ${flag.toUpperCase()} - ${payload.conferente || "Sem conferente"} - ${dataLabel}`;
    const descricao = `TASK 3 - Relatorio de conferencia para diretoria.

Empresa: ${empresa}
Tipo: ${flag.toUpperCase()}
Conferente: ${payload.conferente || "-"}
Data: ${dataLabel}
Total: ${payload.totalItens ?? itens.length}

Separado: ${resumo.separado ?? 0}
Nao tem: ${resumo.naoTem ?? 0}
Parcial: ${resumo.parcial ?? 0}
Pendente: ${resumo.pendente ?? 0}

HTML com fotos anexado nesta task.`;

    const html = montarHtmlRelatorio({ ...payload, resumo }, empresa, flag, dataLabel, itens);
    const taskId = await criarTarefaClickUp(token, listId, nome, descricao);
    const nomeArquivo = sanitizarNomeArquivo(`relatorio_${empresa}_${flag}_${payload.conferente || "sem_conferente"}_${dataLabel}`);
    await anexarHtmlNaTarefa(token, taskId, nomeArquivo, html);

    console.log(`[TASK 3] Relatorio criado em ${empresa}: ${taskId} | lista=${listId} | url=https://app.clickup.com/t/${taskId}`);
    return { taskId, empresa, flag, listId, url: `https://app.clickup.com/t/${taskId}`, totalItens: itens.length };
  },
});
