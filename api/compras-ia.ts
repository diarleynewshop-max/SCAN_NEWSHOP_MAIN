import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const config = {
  maxDuration: 60,
};

type Empresa = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";
type LoginFlag = "loja" | "cd";
type UserRole = "operador" | "compras" | "admin" | "super";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ComprasIaSkillId = "comparativo" | "melhor_pior_item" | "faltas_secao" | "resumo_geral";

type BuyManSkill = {
  id: ComprasIaSkillId;
  label: string;
  criterios: string[];
  prompt: string;
};

type RequestBody = {
  pergunta?: unknown;
  historico?: unknown;
  empresa?: unknown;
  flag?: unknown;
  actorLogin?: unknown;
  actorSenha?: unknown;
  requestId?: unknown;
  questionKey?: unknown;
};

type UsuarioLoginRow = {
  id?: string;
  login?: string;
  nome?: string;
  role?: string;
  empresas?: string[];
};

type ItemFrequenciaRow = {
  empresa: string | null;
  flag: string | null;
  data: string | null;
  codigo: string | null;
  sku: string | null;
  secao: string | null;
  descricao?: string | null;
  vezes: number | null;
  total_pedido: number | null;
  total_real: number | null;
};

type CompraRow = {
  empresa: string | null;
  codigo: string | null;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  foto_url: string | null;
  status: string | null;
  vezes_pedido: number | null;
  pedido_feito?: number | boolean | null;
  updated_at: string | null;
};

type PedidoRow = {
  empresa: string | null;
  flag: string | null;
  status: string | null;
  titulo: string | null;
  pessoa: string | null;
  listeiro: string | null;
  conferente: string | null;
  data_conferencia: string | null;
  total_itens: number | null;
  resumo_separado: number | null;
  resumo_nao_tem: number | null;
  resumo_parcial: number | null;
  resumo_pendente: number | null;
  updated_at: string | null;
};

type SecaoRow = {
  empresa: string | null;
  flag: string | null;
  data: string | null;
  secao: string | null;
  total: number | null;
  separado: number | null;
  nao_tem: number | null;
  parcial: number | null;
  pendente: number | null;
  total_pedido: number | null;
  total_real: number | null;
};

type ItemResumo = {
  codigo: string;
  sku: string;
  descricao: string;
  secao: string;
  foto_url: string | null;
  status: string;
  pedido_feito: boolean | null;
  updated_at: string;
  vezes: number;
  total_pedido: number;
  total_real: number;
};

type ProdutoIaCard = {
  grupo: "mais_pedidos" | "menos_pedidos" | "top" | "citados";
  posicao: number;
  titulo: string;
  codigo: string;
  sku: string;
  descricao: string;
  secao: string;
  fotoUrl: string | null;
  status: string;
  pedidoFeito: boolean | null;
  atualizadoEm: string;
  vezes: number;
  totalPedido: number;
  totalReal: number;
  origem: string;
};

type RespostaAutomatica = {
  resposta: string;
  produtos: ProdutoIaCard[];
};

type QueryMeta = {
  periodo_inicio: string;
  periodo_fim: string;
  empresa: Empresa;
  flag: LoginFlag;
  linhas_item_frequencia: number;
  linhas_compras: number;
  linhas_pedidos: number;
  pergunta_key: string;
  request_id: string;
  skill: {
    id: ComprasIaSkillId;
    label: string;
    criterios: string[];
  };
  avisos: string[];
};

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function setCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, cache-control, pragma, x-compras-ia-question-key, x-compras-ia-request-id");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "X-Compras-Ia-Question-Key, X-Compras-Ia-Request-Id");
}

function parseBody(req: VercelRequest): RequestBody {
  const body = req.body;
  if (!body) return {};
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString("utf8")) as RequestBody;
  if (typeof body === "string") return JSON.parse(body) as RequestBody;
  if (typeof body === "object") return body as RequestBody;
  return {};
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizarEmpresa(value: unknown): Empresa {
  const empresa = toText(value).toUpperCase();
  if (empresa.includes("SEFULY")) return "SEFULY";
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function normalizarRole(value: unknown): UserRole {
  const role = toText(value).toLowerCase();
  if (role === "compras" || role === "admin" || role === "super") return role;
  return "operador";
}

function normalizarFlag(value: unknown): LoginFlag {
  return toText(value).toLowerCase() === "cd" ? "cd" : "loja";
}

function normalizarEmpresas(values: unknown): Empresa[] {
  if (!Array.isArray(values)) return [];
  const empresas = values.map(normalizarEmpresa);
  return Array.from(new Set(empresas));
}

function empresaCompras(empresa: Empresa): "NEWSHOP" | "SF" | "SEFULY" {
  if (empresa === "SEFULY") return "SEFULY";
  return empresa === "NEWSHOP" ? "NEWSHOP" : "SF";
}

function empresasDashboard(empresa: Empresa): Empresa[] {
  return [empresa];
}

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getSupabaseClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );

  if (!url || !key) {
    throw new HttpError(500, "Supabase nao configurado para a IA de Compras.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

async function validarUsuarioAdmin(
  supabase: SupabaseClient,
  actorLogin: string,
  actorSenha: string,
  empresa: Empresa
): Promise<{ nome: string; role: UserRole }> {
  if (!actorLogin || !actorSenha) {
    throw new HttpError(401, "Informe login e senha para usar a IA.");
  }

  const { data, error } = await supabase.rpc("login_usuario", {
    p_login: actorLogin.trim().toLowerCase(),
    p_senha: actorSenha,
  });

  if (error) {
    console.error("[compras-ia] login_usuario falhou", error);
    throw new HttpError(401, "Login ou senha invalido.");
  }

  const row = Array.isArray(data) ? (data[0] as UsuarioLoginRow | undefined) : undefined;
  if (!row) throw new HttpError(401, "Login ou senha invalido.");

  const role = normalizarRole(row.role);
  if (role !== "admin" && role !== "super") {
    throw new HttpError(403, "IA de Compras liberada apenas para Admin e Super.");
  }

  const permitidas = normalizarEmpresas(row.empresas);
  if (permitidas.length > 0 && !permitidas.includes(empresa)) {
    throw new HttpError(403, "Usuario sem acesso a empresa selecionada.");
  }

  return {
    nome: toText(row.nome) || actorLogin,
    role,
  };
}

async function selectAll<T>(buildQuery: (from: number, to: number) => any, maxRows: number): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize - 1, maxRows - 1);
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function lerItemFrequencia(
  supabase: SupabaseClient,
  empresa: Empresa,
  flag: LoginFlag,
  dataInicio: string,
  dataFim: string,
  avisos: string[]
): Promise<ItemFrequenciaRow[]> {
  const selectComDescricao = "empresa,flag,data,codigo,sku,secao,descricao,vezes,total_pedido,total_real";
  const selectSemDescricao = "empresa,flag,data,codigo,sku,secao,vezes,total_pedido,total_real";

  try {
    return await selectAll<ItemFrequenciaRow>((from, to) => (
      supabase
        .from("dashboard_item_frequencia")
        .select(selectComDescricao)
        .in("empresa", empresasDashboard(empresa))
        .eq("flag", flag)
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: false })
        .order("total_pedido", { ascending: false })
        .range(from, to)
    ), 5000);
  } catch (error) {
    avisos.push("dashboard_item_frequencia sem coluna descricao; usando fallback sem descricao.");
    console.warn("[compras-ia] fallback dashboard_item_frequencia sem descricao", error);
    return await selectAll<ItemFrequenciaRow>((from, to) => (
      supabase
        .from("dashboard_item_frequencia")
        .select(selectSemDescricao)
        .in("empresa", empresasDashboard(empresa))
        .eq("flag", flag)
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: false })
        .order("total_pedido", { ascending: false })
        .range(from, to)
    ), 5000);
  }
}

async function lerCompras(
  supabase: SupabaseClient,
  empresa: Empresa
): Promise<CompraRow[]> {
  return await selectAll<CompraRow>((from, to) => (
    supabase
      .from("compras")
      .select("empresa,codigo,sku,descricao,secao,foto_url,status,vezes_pedido,pedido_feito,updated_at")
      .eq("empresa", empresaCompras(empresa))
      .order("updated_at", { ascending: false })
      .range(from, to)
  ), 3000);
}

async function lerPedidosRecentes(
  supabase: SupabaseClient,
  empresa: Empresa,
  flag: LoginFlag
): Promise<PedidoRow[]> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("empresa,flag,status,titulo,pessoa,listeiro,conferente,data_conferencia,total_itens,resumo_separado,resumo_nao_tem,resumo_parcial,resumo_pendente,updated_at")
    .in("empresa", empresasDashboard(empresa))
    .eq("flag", flag)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return (data ?? []) as PedidoRow[];
}

async function lerSecoes(
  supabase: SupabaseClient,
  empresa: Empresa,
  flag: LoginFlag,
  dataInicio: string,
  dataFim: string
): Promise<SecaoRow[]> {
  return await selectAll<SecaoRow>((from, to) => (
    supabase
      .from("dashboard_por_secao")
      .select("empresa,flag,data,secao,total,separado,nao_tem,parcial,pendente,total_pedido,total_real")
      .in("empresa", empresasDashboard(empresa))
      .eq("flag", flag)
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: false })
      .range(from, to)
  ), 3000);
}

function limparItem(row: ItemFrequenciaRow): ItemResumo {
  const codigo = toText(row.codigo) || "SEM_CODIGO";
  return {
    codigo,
    sku: toText(row.sku),
    descricao: toText(row.descricao) || codigo,
    secao: toText(row.secao) || "Sem categoria",
    foto_url: null,
    status: "",
    pedido_feito: null,
    updated_at: "",
    vezes: toNumber(row.vezes),
    total_pedido: toNumber(row.total_pedido),
    total_real: toNumber(row.total_real),
  };
}

function agregarItens(rows: ItemFrequenciaRow[], limit: number): ItemResumo[] {
  const mapa = new Map<string, ItemResumo>();

  for (const row of rows) {
    const item = limparItem(row);
    const atual = mapa.get(item.codigo);
    if (!atual) {
      mapa.set(item.codigo, item);
      continue;
    }

    atual.vezes += item.vezes;
    atual.total_pedido += item.total_pedido;
    atual.total_real += item.total_real;
    if (atual.descricao === atual.codigo && item.descricao !== item.codigo) atual.descricao = item.descricao;
    if (atual.secao === "Sem categoria" && item.secao !== "Sem categoria") atual.secao = item.secao;
    if (!atual.sku && item.sku) atual.sku = item.sku;
  }

  return [...mapa.values()]
    .sort((a, b) => b.total_pedido - a.total_pedido || b.vezes - a.vezes)
    .slice(0, limit);
}

function extrairDatas(pergunta: string, hoje: string): { datasExatas: string[]; diasMes: string[] } {
  const datasExatas = new Set<string>();
  const diasMes = new Set<string>();
  const texto = pergunta.toLowerCase();
  const [anoAtual, mesAtual] = hoje.split("-");

  for (const match of texto.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/g)) {
    const dia = match[1].padStart(2, "0");
    const mes = match[2].padStart(2, "0");
    const anoRaw = match[3];
    const ano = anoRaw ? (anoRaw.length === 2 ? `20${anoRaw}` : anoRaw) : anoAtual;
    datasExatas.add(`${ano}-${mes}-${dia}`);
  }

  if (/\bdia(s)?\b|\bdata(s)?\b/.test(texto)) {
    for (const match of texto.matchAll(/\b([1-9]|[12]\d|3[01])\b/g)) {
      const numero = match[1].padStart(2, "0");
      const start = Math.max(0, match.index - 10);
      const end = Math.min(texto.length, match.index + match[0].length + 10);
      const contexto = texto.slice(start, end);
      if (/\bdia(s)?\b|\bdata(s)?\b|\be\b|,/.test(contexto)) {
        diasMes.add(numero);
      }
    }
  }

  for (const iso of datasExatas) {
    diasMes.delete(iso.slice(8, 10));
  }

  if (datasExatas.size === 0 && diasMes.size === 0 && /\bhoje\b/.test(texto)) {
    datasExatas.add(hoje);
  }

  if (datasExatas.size === 0 && diasMes.size === 0 && /\bontem\b/.test(texto)) {
    datasExatas.add(addDays(hoje, -1));
  }

  return {
    datasExatas: [...datasExatas],
    diasMes: [...diasMes],
  };
}

function montarTopPorDia(rows: ItemFrequenciaRow[], pergunta: string, hoje: string) {
  const { datasExatas, diasMes } = extrairDatas(pergunta, hoje);
  let candidatas = rows;

  if (datasExatas.length > 0) {
    candidatas = rows.filter((row) => datasExatas.includes(toText(row.data)));
  } else if (diasMes.length > 0) {
    candidatas = rows.filter((row) => diasMes.includes(toText(row.data).slice(8, 10)));
  }

  const porData = new Map<string, ItemFrequenciaRow[]>();
  for (const row of candidatas) {
    const data = toText(row.data);
    if (!data) continue;
    const list = porData.get(data) ?? [];
    list.push(row);
    porData.set(data, list);
  }

  return [...porData.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, datasExatas.length || diasMes.length ? 20 : 10)
    .map(([data, list]) => ({
      data,
      itens: agregarItens(list, 5),
    }));
}

function formatarData(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : isoDate;
}

function filtrarItensPorPergunta(rows: ItemFrequenciaRow[], pergunta: string, hoje: string) {
  const { datasExatas, diasMes } = extrairDatas(pergunta, hoje);
  if (datasExatas.length > 0) {
    return {
      rows: rows.filter((row) => datasExatas.includes(toText(row.data))),
      label: datasExatas.map(formatarData).join(", "),
      temFiltroData: true,
    };
  }

  if (diasMes.length > 0) {
    return {
      rows: rows.filter((row) => diasMes.includes(toText(row.data).slice(8, 10))),
      label: `dias ${diasMes.join(", ")} dentro do periodo lido`,
      temFiltroData: true,
    };
  }

  return {
    rows,
    label: "periodo lido",
    temFiltroData: false,
  };
}

function formatarItemResumo(item: ItemResumo, index: number): string {
  const descricao = item.descricao || item.codigo;
  const sku = item.sku ? ` | SKU: ${item.sku}` : "";
  const pedido = item.total_pedido > 0 ? `${item.total_pedido} un. pedidas` : `${item.vezes} ocorrencia(s)`;
  const real = item.total_real > 0 ? `${item.total_real} un. reais` : "sem qtd. real";
  const status = item.status ? `\n   🛒 Compras: ${item.status}${item.pedido_feito === true ? " | pedido feito" : ""}` : "";
  const foto = item.foto_url ? "\n   🖼️ Foto: card do produto abaixo" : "";

  return [
    `${index + 1}. ${descricao}`,
    `   🔖 Cod: ${item.codigo}${sku}`,
    `   📦 Secao: ${item.secao} | Pedido: ${pedido} | Real: ${real} | Ocorrencias: ${item.vezes}`,
  ].join("\n") + status + foto;
}

function normalizarBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const BUY_MAN_SKILLS: Record<ComprasIaSkillId, BuyManSkill> = {
  comparativo: {
    id: "comparativo",
    label: "Comparativo",
    criterios: [
      "separar claramente os grupos comparados",
      "comparar quantidade pedida, quantidade real, ocorrencias e faltas quando existir",
      "destacar maior alta, maior queda, diferenca absoluta e risco operacional",
      "informar periodo, empresa, flag e filtros usados",
    ],
    prompt: "Skill Comparativo: compare recortes, secoes, dias, status ou produtos sem misturar bases. Mostre diferencas objetivas e conclua com leitura operacional.",
  },
  melhor_pior_item: {
    id: "melhor_pior_item",
    label: "Melhor e pior item",
    criterios: [
      "melhor item = maior total_pedido; se total_pedido faltar, usar ocorrencias",
      "pior item = menor total_pedido acima de zero; se total_pedido faltar, usar ocorrencias",
      "sempre citar codigo, SKU quando existir, secao, status de compras e foto disponivel",
      "explicar o criterio antes do ranking",
    ],
    prompt: "Skill Melhor/Pior Item: ranqueie produtos com criterio explicito. Nao chame item de melhor ou pior sem mostrar a metrica usada.",
  },
  faltas_secao: {
    id: "faltas_secao",
    label: "Faltas e secao",
    criterios: [
      "priorizar nao_tem, parcial e pendente",
      "separar secao, status e pedidos recentes quando houver dados",
      "destacar onde a perda operacional esta concentrada",
      "informar se faltou dado para concluir",
    ],
    prompt: "Skill Faltas/Secao: foque em ruptura, pendencias e secoes criticas. Mostre onde agir primeiro.",
  },
  resumo_geral: {
    id: "resumo_geral",
    label: "Resumo geral",
    criterios: [
      "responder somente a pergunta atual",
      "usar periodo, empresa e flag do contexto",
      "trazer resumo rapido, destaques e proximas acoes de leitura",
      "nao repetir resposta anterior do historico",
    ],
    prompt: "Skill Resumo Geral: responda direto, usando os dados disponiveis e apontando lacunas quando existirem.",
  },
};

function selecionarBuyManSkill(pergunta: string): BuyManSkill {
  const texto = normalizarBusca(pergunta);
  if (/\b(comparativo|comparar|compare|comparacao|versus|vs|diferenca|evolucao|cresceu|caiu|alta|queda)\b/.test(texto)) {
    return BUY_MAN_SKILLS.comparativo;
  }
  if (/\b(melhor|melhores|pior|piores|mais pedido|mais pedidos|menos pedido|menos pedidos|top|ranking|campeao|menor giro|maior giro)\b/.test(texto)) {
    return BUY_MAN_SKILLS.melhor_pior_item;
  }
  if (/\b(falta|faltas|nao tem|ruptura|parcial|pendente|pendentes|secao|secoes)\b/.test(texto)) {
    return BUY_MAN_SKILLS.faltas_secao;
  }
  return BUY_MAN_SKILLS.resumo_geral;
}

function hashPergunta(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function montarPerguntaKey(pergunta: string, empresa: Empresa, flag: LoginFlag): string {
  return hashPergunta(`${empresa}|${flag}|${normalizarBusca(pergunta)}`);
}

function normalizarRequestId(value: unknown, perguntaKey: string): string {
  const raw = toText(value).replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 80);
  return raw || `server-${perguntaKey}-${Date.now().toString(36)}`;
}

function numeroEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function getIaProviderTimeoutMs(): number {
  return numeroEnv("COMPRAS_IA_PROVIDER_TIMEOUT_MS", 9_000, 3_000, 20_000);
}

function getIaTotalTimeoutMs(): number {
  return numeroEnv("COMPRAS_IA_TOTAL_TIMEOUT_MS", 22_000, 8_000, 45_000);
}

function getIaMaxTokens(): number {
  return numeroEnv("COMPRAS_IA_MAX_TOKENS", 900, 300, 1_400);
}

function normalizarChaveProduto(value: string): string {
  return normalizarBusca(value).replace(/[^a-z0-9]/g, "");
}

function chavesProduto(codigo: string, sku: string): string[] {
  return [codigo, sku]
    .map(normalizarChaveProduto)
    .filter((value, index, list) => value && list.indexOf(value) === index);
}

function fotoUrlSegura(value: unknown): string | null {
  const foto = toText(value);
  if (!foto) return null;
  if (/^https?:\/\//i.test(foto)) return foto;
  if (/^data:image\//i.test(foto) && foto.length <= 250_000) return foto;
  return null;
}

function compraPedidoFeito(row: CompraRow): boolean | null {
  if (row.pedido_feito === null || row.pedido_feito === undefined) return null;
  return row.pedido_feito === true || row.pedido_feito === 1;
}

function indexarCompras(compras: CompraRow[]): Map<string, CompraRow> {
  const mapa = new Map<string, CompraRow>();
  for (const row of compras) {
    for (const key of chavesProduto(toText(row.codigo), toText(row.sku))) {
      if (!mapa.has(key)) mapa.set(key, row);
    }
  }
  return mapa;
}

function enriquecerItensComCompras(itens: ItemResumo[], compras: CompraRow[]): ItemResumo[] {
  const index = indexarCompras(compras);

  return itens.map((item) => {
    const compra = chavesProduto(item.codigo, item.sku)
      .map((key) => index.get(key))
      .find(Boolean);
    if (!compra) return item;

    return {
      ...item,
      sku: item.sku || toText(compra.sku),
      descricao: item.descricao && item.descricao !== item.codigo ? item.descricao : (toText(compra.descricao) || item.descricao),
      secao: item.secao !== "Sem categoria" ? item.secao : (toText(compra.secao) || item.secao),
      foto_url: fotoUrlSegura(compra.foto_url),
      status: toText(compra.status),
      pedido_feito: compraPedidoFeito(compra),
      updated_at: toText(compra.updated_at),
    };
  });
}

function produtoCardFromItem(
  item: ItemResumo,
  index: number,
  grupo: ProdutoIaCard["grupo"],
  origem: string
): ProdutoIaCard {
  const titulo = item.descricao || item.sku || item.codigo;
  return {
    grupo,
    posicao: index + 1,
    titulo,
    codigo: item.codigo,
    sku: item.sku,
    descricao: item.descricao,
    secao: item.secao,
    fotoUrl: fotoUrlSegura(item.foto_url),
    status: item.status,
    pedidoFeito: item.pedido_feito,
    atualizadoEm: item.updated_at,
    vezes: item.vezes,
    totalPedido: item.total_pedido,
    totalReal: item.total_real,
    origem,
  };
}

function itemResumoParaContexto(item: ItemResumo) {
  return {
    codigo: item.codigo,
    sku: item.sku,
    descricao: item.descricao,
    secao: item.secao,
    vezes: item.vezes,
    total_pedido: item.total_pedido,
    total_real: item.total_real,
    status_compras: item.status || null,
    pedido_feito: item.pedido_feito,
    foto_disponivel: Boolean(item.foto_url),
  };
}

function perguntaPedeTopItem(pergunta: string): boolean {
  const texto = normalizarBusca(pergunta);

  const falaDeItem = /\b(item|itens|produto|produtos|sku|codigo)\b/.test(texto);
  const falaDeRanking = /\b(mais pedido|mais pedidos|mais pedida|mais pedidas|top|ranking|campeao|maior pedido)\b/.test(texto);
  return falaDeItem && falaDeRanking;
}

function perguntaPedeRankingPorSecao(pergunta: string): boolean {
  const texto = normalizarBusca(pergunta);
  const falaDeSecao = /\bsecao\b/.test(texto);
  const falaDeItem = /\b(item|itens|produto|produtos|sku|codigo)\b/.test(texto);
  const falaDeMaisOuMenos = /\b(mais pedido|mais pedidos|mais pedida|mais pedidas|menos pedido|menos pedidos|menos pedida|menos pedidas|top|ranking)\b/.test(texto);
  return falaDeSecao && falaDeItem && falaDeMaisOuMenos;
}

function extrairSecaoPergunta(pergunta: string): string | null {
  const texto = normalizarBusca(pergunta);
  const match = texto.match(/\bsecao\s+(?:de\s+|do\s+|da\s+)?([a-z0-9 ]{3,80})/);
  const raw = match?.[1]?.trim();
  if (!raw) return null;

  const cortado = raw
    .split(/\b(?:nos|nas|no|na|entre|desde|ate|ultimos|ultimas|periodo|dias?)\b/)[0]
    .trim();
  return cortado || raw;
}

function extrairLimiteRanking(pergunta: string, fallback = 5): number {
  const texto = normalizarBusca(pergunta);
  const match =
    texto.match(/\b([1-9]|1\d|20)\s+(?:item|itens|produto|produtos)\b/) ||
    texto.match(/\btop\s+([1-9]|1\d|20)\b/);
  const value = Number(match?.[1] ?? fallback);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 20) : fallback;
}

function pontuacaoPedido(item: Pick<ItemResumo, "total_pedido" | "vezes">): number {
  return item.total_pedido > 0 ? item.total_pedido : item.vezes;
}

function compraToItemResumo(row: CompraRow): ItemResumo {
  const codigo = toText(row.codigo) || "SEM_CODIGO";
  const vezes = toNumber(row.vezes_pedido);
  return {
    codigo,
    sku: toText(row.sku),
    descricao: toText(row.descricao) || codigo,
    secao: toText(row.secao) || "Sem categoria",
    foto_url: fotoUrlSegura(row.foto_url),
    status: toText(row.status),
    pedido_feito: compraPedidoFeito(row),
    updated_at: toText(row.updated_at),
    vezes,
    total_pedido: vezes,
    total_real: 0,
  };
}

function perguntaPedeComparativo(pergunta: string): boolean {
  const texto = normalizarBusca(pergunta);
  return /\b(comparativo|comparar|compare|comparacao|versus|vs|diferenca|evolucao|alta|queda)\b/.test(texto);
}

function formatarNumero(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatarDelta(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatarNumero(value)}`;
}

function formatarPercentual(delta: number, base: number): string {
  if (!base) return delta ? "sem base anterior" : "0%";
  return `${formatarDelta((delta / base) * 100)}%`;
}

function montarGruposComparativo(
  rows: ItemFrequenciaRow[],
  pergunta: string,
  compras: CompraRow[]
) {
  const hoje = hojeSaoPaulo();
  const { datasExatas, diasMes } = extrairDatas(pergunta, hoje);
  const gruposBase = datasExatas.length >= 2
    ? datasExatas.slice(0, 4).map((iso) => ({
        key: iso,
        label: formatarData(iso),
        rows: rows.filter((row) => toText(row.data) === iso),
        criterio: "data exata",
      }))
    : diasMes.slice(0, 4).map((dia) => ({
        key: dia,
        label: `dia ${dia}`,
        rows: rows.filter((row) => toText(row.data).slice(8, 10) === dia),
        criterio: "dia do mes dentro do periodo lido",
      }));

  return gruposBase
    .map((grupo) => {
      const datas = Array.from(new Set(grupo.rows.map((row) => toText(row.data)).filter(Boolean))).sort();
      const itensTodos = enriquecerItensComCompras(agregarItens(grupo.rows, 2000), compras);
      return {
        ...grupo,
        datas,
        itensTodos,
        itensTop: itensTodos.slice(0, 5),
        totalPedido: grupo.rows.reduce((sum, row) => sum + toNumber(row.total_pedido), 0),
        totalReal: grupo.rows.reduce((sum, row) => sum + toNumber(row.total_real), 0),
        ocorrencias: grupo.rows.reduce((sum, row) => sum + toNumber(row.vezes), 0),
        itensUnicos: new Set(grupo.rows.map((row) => toText(row.codigo)).filter(Boolean)).size,
      };
    });
}

function montarMudancasComparativo(
  grupoA: ReturnType<typeof montarGruposComparativo>[number],
  grupoB: ReturnType<typeof montarGruposComparativo>[number],
  limite = 8
) {
  const mapa = new Map<string, { a?: ItemResumo; b?: ItemResumo }>();

  for (const item of grupoA.itensTodos) {
    mapa.set(item.codigo, { ...(mapa.get(item.codigo) ?? {}), a: item });
  }
  for (const item of grupoB.itensTodos) {
    mapa.set(item.codigo, { ...(mapa.get(item.codigo) ?? {}), b: item });
  }

  return [...mapa.entries()]
    .map(([codigo, value]) => {
      const aPedido = value.a?.total_pedido ?? 0;
      const bPedido = value.b?.total_pedido ?? 0;
      const aReal = value.a?.total_real ?? 0;
      const bReal = value.b?.total_real ?? 0;
      const item = value.b ?? value.a;
      return {
        codigo,
        item,
        aPedido,
        bPedido,
        aReal,
        bReal,
        deltaPedido: bPedido - aPedido,
        deltaReal: bReal - aReal,
      };
    })
    .filter((row) => row.item && (row.aPedido > 0 || row.bPedido > 0 || row.aReal > 0 || row.bReal > 0))
    .sort((a, b) => Math.abs(b.deltaPedido) - Math.abs(a.deltaPedido) || Math.abs(b.deltaReal) - Math.abs(a.deltaReal))
    .slice(0, limite);
}

function formatarMudancaComparativo(
  row: ReturnType<typeof montarMudancasComparativo>[number],
  index: number,
  labelA: string,
  labelB: string
): string {
  const item = row.item;
  if (!item) return "";

  const sku = item.sku ? ` | SKU: ${item.sku}` : "";
  const status = item.status ? `\n   Compras: ${item.status}${item.pedido_feito === true ? " | pedido feito" : ""}` : "";
  const foto = item.foto_url ? "\n   Foto: card do produto abaixo" : "";

  return [
    `${index + 1}. ${item.descricao || item.codigo}`,
    `   Cod: ${item.codigo}${sku} | Secao: ${item.secao}`,
    `   Pedido: ${labelA} ${formatarNumero(row.aPedido)} -> ${labelB} ${formatarNumero(row.bPedido)} (${formatarDelta(row.deltaPedido)})`,
    `   Real: ${labelA} ${formatarNumero(row.aReal)} -> ${labelB} ${formatarNumero(row.bReal)} (${formatarDelta(row.deltaReal)})`,
  ].join("\n") + status + foto;
}

function montarRespostaComparativo(
  pergunta: string,
  rows: ItemFrequenciaRow[],
  compras: CompraRow[],
  dataInicio: string,
  dataFim: string
): RespostaAutomatica | null {
  if (!perguntaPedeComparativo(pergunta)) return null;

  const grupos = montarGruposComparativo(rows, pergunta, compras);
  if (grupos.length < 2) return null;

  const [grupoA, grupoB] = grupos;
  if (!grupoA.rows.length || !grupoB.rows.length) {
    return {
      resposta: [
        "Relatorio comparativo",
        `Periodo lido: ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`,
        `Filtro: ${grupoA.label} x ${grupoB.label}.`,
        "",
        !grupoA.rows.length ? `- Sem dados para ${grupoA.label}.` : `- ${grupoA.label}: ${formatarNumero(grupoA.totalPedido)} un. pedidas.`,
        !grupoB.rows.length ? `- Sem dados para ${grupoB.label}.` : `- ${grupoB.label}: ${formatarNumero(grupoB.totalPedido)} un. pedidas.`,
        "",
        "Informe datas exatas, exemplo 10/07 e 12/07, se quiser comparar dias especificos.",
      ].join("\n"),
      produtos: [],
    };
  }

  const deltaPedido = grupoB.totalPedido - grupoA.totalPedido;
  const deltaReal = grupoB.totalReal - grupoA.totalReal;
  const deltaOcorrencias = grupoB.ocorrencias - grupoA.ocorrencias;
  const mudancas = montarMudancasComparativo(grupoA, grupoB, 8);
  const produtos = mudancas
    .map((row) => row.item)
    .filter((item): item is ItemResumo => Boolean(item))
    .map((item, index) => produtoCardFromItem(item, index, "citados", "comparativo de dias"));

  const criterio = grupoA.criterio === "data exata"
    ? "datas exatas informadas"
    : "dia do mes dentro do periodo lido";
  const datasA = grupoA.datas.length ? grupoA.datas.map(formatarData).join(", ") : "-";
  const datasB = grupoB.datas.length ? grupoB.datas.map(formatarData).join(", ") : "-";

  return {
    resposta: [
      `Relatorio comparativo: ${grupoA.label} x ${grupoB.label}`,
      `Periodo lido: ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`,
      `Criterio: ${criterio}.`,
      grupoA.criterio !== "data exata" ? `Datas consideradas ${grupoA.label}: ${datasA}.` : "",
      grupoB.criterio !== "data exata" ? `Datas consideradas ${grupoB.label}: ${datasB}.` : "",
      "",
      "Resumo",
      `- ${grupoA.label}: ${formatarNumero(grupoA.totalPedido)} pedidas | ${formatarNumero(grupoA.totalReal)} reais | ${formatarNumero(grupoA.ocorrencias)} ocorrencias | ${formatarNumero(grupoA.itensUnicos)} itens.`,
      `- ${grupoB.label}: ${formatarNumero(grupoB.totalPedido)} pedidas | ${formatarNumero(grupoB.totalReal)} reais | ${formatarNumero(grupoB.ocorrencias)} ocorrencias | ${formatarNumero(grupoB.itensUnicos)} itens.`,
      `- Diferenca pedida: ${formatarDelta(deltaPedido)} (${formatarPercentual(deltaPedido, grupoA.totalPedido)}).`,
      `- Diferenca real: ${formatarDelta(deltaReal)} (${formatarPercentual(deltaReal, grupoA.totalReal)}).`,
      `- Diferenca de ocorrencias: ${formatarDelta(deltaOcorrencias)}.`,
      "",
      "Leitura rapida",
      deltaPedido > 0
        ? `- ${grupoB.label} teve maior volume pedido.`
        : deltaPedido < 0
          ? `- ${grupoA.label} teve maior volume pedido.`
          : "- Os dois grupos ficaram empatados em volume pedido.",
      deltaReal < deltaPedido ? "- A quantidade real nao acompanhou todo o aumento pedido; revisar ruptura/parcial." : "- A quantidade real acompanhou proporcionalmente o pedido.",
      "",
      "Itens que mais mudaram",
      ...(mudancas.length
        ? mudancas.map((row, index) => formatarMudancaComparativo(row, index, grupoA.label, grupoB.label)).filter(Boolean)
        : ["- Sem variacao por item no recorte."]),
    ].filter((line) => line !== "").join("\n"),
    produtos,
  };
}

function montarRespostaRankingSecao(
  pergunta: string,
  rows: ItemFrequenciaRow[],
  compras: CompraRow[],
  dataInicio: string,
  dataFim: string
): RespostaAutomatica | null {
  if (!perguntaPedeRankingPorSecao(pergunta)) return null;

  const secao = extrairSecaoPergunta(pergunta);
  if (!secao) return null;

  const hoje = hojeSaoPaulo();
  const limite = extrairLimiteRanking(pergunta, 5);
  const filtroData = filtrarItensPorPergunta(rows, pergunta, hoje);
  const secaoNormalizada = normalizarBusca(secao);
  const linhasDaSecao = filtroData.rows.filter((row) => normalizarBusca(toText(row.secao)).includes(secaoNormalizada));
  let itens = enriquecerItensComCompras(agregarItens(linhasDaSecao, 500), compras);
  let base = "dashboard de pedidos concluidos";

  if (itens.length === 0) {
    itens = compras
      .filter((row) => normalizarBusca(toText(row.secao)).includes(secaoNormalizada))
      .map(compraToItemResumo)
      .sort((a, b) => pontuacaoPedido(b) - pontuacaoPedido(a));
    base = "tabela Compras, campo vezes_pedido";
  }

  if (itens.length === 0) {
    return {
      resposta: [
        `🔎 Nao encontrei itens na secao "${secao}" para montar o ranking.`,
        `📅 Periodo consultado: ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`,
      ].join("\n"),
      produtos: [],
    };
  }

  const maisPedidos = [...itens]
    .sort((a, b) => pontuacaoPedido(b) - pontuacaoPedido(a) || a.descricao.localeCompare(b.descricao))
    .slice(0, limite);
  const menosPedidos = [...itens]
    .filter((item) => pontuacaoPedido(item) > 0)
    .sort((a, b) => pontuacaoPedido(a) - pontuacaoPedido(b) || a.descricao.localeCompare(b.descricao))
    .slice(0, limite);

  const produtos = [
    ...maisPedidos.map((item, index) => produtoCardFromItem(item, index, "mais_pedidos", base)),
    ...menosPedidos.map((item, index) => produtoCardFromItem(item, index, "menos_pedidos", base)),
  ];
  const campeao = maisPedidos[0];
  const menor = menosPedidos[0];

  return {
    resposta: [
    `📊 Ranking da secao: ${secao.toUpperCase()}`,
    `📅 Periodo: ${formatarData(dataInicio)} a ${formatarData(dataFim)} (${filtroData.label})`,
    `🧾 Base: ${base}.`,
    produtos.some((produto) => produto.fotoUrl) ? `🖼️ Fotos: veja os cards dos produtos abaixo.` : `🖼️ Fotos: nao encontrei foto vinculada para esses itens.`,
    "",
    `🏆 ${limite} itens mais pedidos`,
    ...maisPedidos.map(formatarItemResumo),
    "",
    `📉 ${limite} itens menos pedidos`,
    ...menosPedidos.map(formatarItemResumo),
    "",
    "💡 Leitura rapida",
    campeao ? `- Campeao: ${campeao.descricao || campeao.codigo} com ${pontuacaoPedido(campeao)} un./ocorrencias.` : "- Sem campeao no recorte.",
    menor ? `- Menor giro: ${menor.descricao || menor.codigo} com ${pontuacaoPedido(menor)} un./ocorrencias.` : "- Sem itens de menor giro no recorte.",
  ].join("\n"),
    produtos,
  };
}

function perguntaPedeMelhorPiorItem(pergunta: string): boolean {
  const texto = normalizarBusca(pergunta);
  const falaDeItem = /\b(item|itens|produto|produtos|sku|codigo|codigos)\b/.test(texto);
  const falaDeMelhorPior = /\b(melhor|melhores|pior|piores|menos pedido|menos pedidos|menor giro)\b/.test(texto);
  return falaDeItem && falaDeMelhorPior;
}

function montarRespostaMelhorPiorItens(
  pergunta: string,
  rows: ItemFrequenciaRow[],
  compras: CompraRow[],
  dataInicio: string,
  dataFim: string
): RespostaAutomatica | null {
  if (!perguntaPedeMelhorPiorItem(pergunta)) return null;

  const hoje = hojeSaoPaulo();
  const filtro = filtrarItensPorPergunta(rows, pergunta, hoje);
  const limite = extrairLimiteRanking(pergunta, 5);
  const texto = normalizarBusca(pergunta);
  const pedeMelhor = /\b(melhor|melhores|mais pedido|mais pedidos|top|ranking|campeao|maior giro)\b/.test(texto);
  const pedePior = /\b(pior|piores|menos pedido|menos pedidos|menor giro)\b/.test(texto);

  let itens = enriquecerItensComCompras(agregarItens(filtro.rows, 1000), compras)
    .filter((item) => pontuacaoPedido(item) > 0);
  let base = "dashboard de pedidos concluidos";

  if (itens.length === 0) {
    itens = compras
      .map(compraToItemResumo)
      .filter((item) => pontuacaoPedido(item) > 0)
      .sort((a, b) => pontuacaoPedido(b) - pontuacaoPedido(a));
    base = "tabela Compras, campo vezes_pedido";
  }

  if (itens.length === 0) {
    return {
      resposta: [
        "Nao encontrei dados suficientes para calcular melhor ou pior item.",
        `Periodo consultado: ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`,
      ].join("\n"),
      produtos: [],
    };
  }

  const melhores = [...itens]
    .sort((a, b) => pontuacaoPedido(b) - pontuacaoPedido(a) || a.descricao.localeCompare(b.descricao))
    .slice(0, limite);
  const piores = [...itens]
    .sort((a, b) => pontuacaoPedido(a) - pontuacaoPedido(b) || a.descricao.localeCompare(b.descricao))
    .slice(0, limite);

  const mostrarMelhores = pedeMelhor || !pedePior;
  const mostrarPiores = pedePior || !pedeMelhor;
  const produtos = [
    ...(mostrarMelhores ? melhores.map((item, index) => produtoCardFromItem(item, index, "mais_pedidos", base)) : []),
    ...(mostrarPiores ? piores.map((item, index) => produtoCardFromItem(item, index, "menos_pedidos", base)) : []),
  ];

  const linhas = [
    "Relatorio melhor/pior item",
    `Periodo: ${formatarData(dataInicio)} a ${formatarData(dataFim)} (${filtro.label}).`,
    `Base: ${base}.`,
    "Criterio: melhor = maior quantidade pedida; pior = menor quantidade pedida acima de zero. Se quantidade faltar, uso ocorrencias.",
    "",
  ];

  if (mostrarMelhores) {
    linhas.push(`${limite} melhores itens`);
    linhas.push(...melhores.map(formatarItemResumo));
    linhas.push("");
  }

  if (mostrarPiores) {
    linhas.push(`${limite} piores itens`);
    linhas.push(...piores.map(formatarItemResumo));
  }

  return {
    resposta: linhas.join("\n").trim(),
    produtos,
  };
}

function montarRespostaTopItens(
  pergunta: string,
  rows: ItemFrequenciaRow[],
  compras: CompraRow[],
  dataInicio: string,
  dataFim: string
): RespostaAutomatica | null {
  if (!perguntaPedeTopItem(pergunta)) return null;

  const hoje = hojeSaoPaulo();
  const filtro = filtrarItensPorPergunta(rows, pergunta, hoje);
  const top = enriquecerItensComCompras(agregarItens(filtro.rows, 10), compras);

  if (top.length > 0) {
    const produtos = top.map((item, index) => produtoCardFromItem(item, index, "top", "dashboard de pedidos concluidos"));
    const linhas = [
      `🏆 Item mais pedido (${filtro.label})`,
      `📅 Periodo: ${formatarData(dataInicio)} a ${formatarData(dataFim)}.`,
      `🧾 Base: dashboard de pedidos concluidos.`,
      produtos.some((produto) => produto.fotoUrl) ? `🖼️ Fotos: veja os cards dos produtos abaixo.` : `🖼️ Fotos: nao encontrei foto vinculada para esses itens.`,
      "",
      `🥇 Mais pedido: ${top[0].descricao || top[0].codigo} | Cod. ${top[0].codigo} | ${top[0].total_pedido || top[0].vezes} ${top[0].total_pedido > 0 ? "un. pedidas" : "ocorrencia(s)"}.`,
      "",
      "📦 Top itens",
      ...top.map(formatarItemResumo),
    ];

    const porDia = filtro.temFiltroData ? montarTopPorDia(rows, pergunta, hoje) : [];
    if (porDia.length > 0) {
      linhas.push("", "Por dia:");
      for (const dia of porDia) {
        const item = dia.itens[0];
        if (!item) continue;
        linhas.push(`- ${formatarData(dia.data)}: ${item.descricao || item.codigo} | Cod. ${item.codigo} | ${item.total_pedido || item.vezes} ${item.total_pedido > 0 ? "un. pedidas" : "ocorrencia(s)"}.`);
      }
    }

    return {
      resposta: linhas.join("\n"),
      produtos,
    };
  }

  const comprasTop = [...compras]
    .sort((a, b) => toNumber(b.vezes_pedido) - toNumber(a.vezes_pedido))
    .slice(0, 10);

  if (comprasTop.length > 0) {
    const itensFallback = comprasTop.map(compraToItemResumo);
    return {
      resposta: [
      "🔎 Nao encontrei pedidos concluidos no dashboard para esse recorte.",
      "🧾 Usei a tabela Compras como fallback, pelo campo vezes_pedido.",
      "",
      ...itensFallback.map(formatarItemResumo),
    ].join("\n"),
      produtos: itensFallback.map((item, index) => produtoCardFromItem(item, index, "top", "tabela Compras")),
    };
  }

  return {
    resposta: "🔎 Nao encontrei dados suficientes no Supabase para calcular o item mais pedido.",
    produtos: [],
  };
}

function contarPorCampo<T extends Record<string, unknown>>(rows: T[], field: keyof T) {
  const mapa = new Map<string, number>();
  for (const row of rows) {
    const key = toText(row[field]) || "vazio";
    mapa.set(key, (mapa.get(key) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function resumirSecoes(rows: SecaoRow[]) {
  const mapa = new Map<string, {
    secao: string;
    total: number;
    separado: number;
    nao_tem: number;
    parcial: number;
    pendente: number;
    total_pedido: number;
    total_real: number;
  }>();

  for (const row of rows) {
    const secao = toText(row.secao) || "Sem categoria";
    const atual = mapa.get(secao) ?? {
      secao,
      total: 0,
      separado: 0,
      nao_tem: 0,
      parcial: 0,
      pendente: 0,
      total_pedido: 0,
      total_real: 0,
    };
    atual.total += toNumber(row.total);
    atual.separado += toNumber(row.separado);
    atual.nao_tem += toNumber(row.nao_tem);
    atual.parcial += toNumber(row.parcial);
    atual.pendente += toNumber(row.pendente);
    atual.total_pedido += toNumber(row.total_pedido);
    atual.total_real += toNumber(row.total_real);
    mapa.set(secao, atual);
  }

  return [...mapa.values()].sort((a, b) => b.total_pedido - a.total_pedido).slice(0, 30);
}

function resumirCompras(rows: CompraRow[]) {
  const porStatus = contarPorCampo(rows as unknown as Record<string, unknown>[], "status");
  const topCompras = [...rows]
    .sort((a, b) => toNumber(b.vezes_pedido) - toNumber(a.vezes_pedido))
    .slice(0, 60)
    .map((row) => ({
      codigo: toText(row.codigo),
      sku: toText(row.sku),
      descricao: toText(row.descricao) || toText(row.codigo),
      secao: toText(row.secao) || "Sem categoria",
      status: toText(row.status),
      vezes_pedido: toNumber(row.vezes_pedido),
      pedido_feito: row.pedido_feito === 1 || row.pedido_feito === true,
      foto_disponivel: Boolean(fotoUrlSegura(row.foto_url)),
      atualizado_em: toText(row.updated_at),
    }));

  return { porStatus, topCompras };
}

function montarContexto(params: {
  pergunta: string;
  empresa: Empresa;
  flag: LoginFlag;
  dataInicio: string;
  dataFim: string;
  perguntaKey: string;
  requestId: string;
  skill: BuyManSkill;
  itens: ItemFrequenciaRow[];
  compras: CompraRow[];
  pedidos: PedidoRow[];
  secoes: SecaoRow[];
  avisos: string[];
}): { contexto: string; meta: QueryMeta } {
  const hoje = hojeSaoPaulo();
  const topItensPeriodo = enriquecerItensComCompras(agregarItens(params.itens, 60), params.compras)
    .map(itemResumoParaContexto);
  const topItensPorDia = montarTopPorDia(params.itens, params.pergunta, hoje);
  const comprasResumo = resumirCompras(params.compras);
  const pedidosPorStatus = contarPorCampo(params.pedidos as unknown as Record<string, unknown>[], "status");
  const secoesResumo = resumirSecoes(params.secoes);
  const recentesPedidos = params.pedidos.slice(0, 40).map((row) => ({
    empresa: toText(row.empresa),
    flag: toText(row.flag),
    status: toText(row.status),
    titulo: toText(row.titulo),
    pessoa: toText(row.pessoa),
    listeiro: toText(row.listeiro),
    conferente: toText(row.conferente),
    data_conferencia: toText(row.data_conferencia),
    total_itens: toNumber(row.total_itens),
    separado: toNumber(row.resumo_separado),
    nao_tem: toNumber(row.resumo_nao_tem),
    parcial: toNumber(row.resumo_parcial),
    pendente: toNumber(row.resumo_pendente),
    atualizado_em: toText(row.updated_at),
  }));

  const dados = {
    fonte: "Supabase somente leitura",
    agente: {
      nome: "Buy-man",
      skill: params.skill.label,
      criterios: params.skill.criterios,
    },
    escopo: {
      empresa: params.empresa,
      flag: params.flag,
      periodo_inicio: params.dataInicio,
      periodo_fim: params.dataFim,
      pergunta_key: params.perguntaKey,
      request_id: params.requestId,
    },
    observacao_data: "Quando o usuario disser apenas dia 10, dia 12 etc., os dados por dia incluem todas as datas do periodo com esse dia do mes.",
    top_itens_periodo: topItensPeriodo,
    top_itens_por_dia: topItensPorDia,
    compras: comprasResumo,
    dashboard_por_secao: secoesResumo,
    pedidos: {
      por_status: pedidosPorStatus,
      recentes: recentesPedidos,
    },
  };

  const meta: QueryMeta = {
    periodo_inicio: params.dataInicio,
    periodo_fim: params.dataFim,
    empresa: params.empresa,
    flag: params.flag,
    linhas_item_frequencia: params.itens.length,
    linhas_compras: params.compras.length,
    linhas_pedidos: params.pedidos.length,
    pergunta_key: params.perguntaKey,
    request_id: params.requestId,
    skill: {
      id: params.skill.id,
      label: params.skill.label,
      criterios: params.skill.criterios,
    },
    avisos: params.avisos,
  };

  return {
    contexto: JSON.stringify(dados, null, 2),
    meta,
  };
}

function montarRespostaFallback(params: {
  pergunta: string;
  itens: ItemFrequenciaRow[];
  compras: CompraRow[];
  dataInicio: string;
  dataFim: string;
  erroIa: string;
}): RespostaAutomatica {
  const comparativo = montarRespostaComparativo(
    params.pergunta,
    params.itens,
    params.compras,
    params.dataInicio,
    params.dataFim
  );
  if (comparativo) return comparativo;

  const rankingSecao = montarRespostaRankingSecao(
    params.pergunta,
    params.itens,
    params.compras,
    params.dataInicio,
    params.dataFim
  );
  if (rankingSecao) return rankingSecao;

  const respostaMelhorPior = montarRespostaMelhorPiorItens(
    params.pergunta,
    params.itens,
    params.compras,
    params.dataInicio,
    params.dataFim
  );
  if (respostaMelhorPior) return respostaMelhorPior;

  const respostaDireta = montarRespostaTopItens(
    params.pergunta,
    params.itens,
    params.compras,
    params.dataInicio,
    params.dataFim
  );
  if (respostaDireta) return respostaDireta;

  const topItens = enriquecerItensComCompras(agregarItens(params.itens, 8), params.compras);
  const statusCompras = resumirCompras(params.compras).porStatus.slice(0, 8);
  const linhas = [
    `⚠️ A IA externa falhou (${params.erroIa}).`,
    "📌 Segue um resumo direto com os dados lidos do Supabase:",
    `📅 Periodo: ${formatarData(params.dataInicio)} a ${formatarData(params.dataFim)}.`,
    "",
  ];

  if (topItens.length > 0) {
    linhas.push("📦 Top itens por pedidos concluidos");
    linhas.push(...topItens.map(formatarItemResumo));
    linhas.push("");
  }

  if (statusCompras.length > 0) {
    linhas.push("🛒 Compras por status");
    linhas.push(...statusCompras.map((row) => `- ${row.label}: ${row.total}`));
  }

  if (topItens.length === 0 && statusCompras.length === 0) {
    linhas.push("🔎 Nao encontrei dados suficientes para montar um resumo automatico.");
  }

  return {
    resposta: linhas.join("\n").trim(),
    produtos: topItens.map((item, index) => produtoCardFromItem(item, index, "citados", "resumo automatico")),
  };
}

function perguntaFalaDeProduto(pergunta: string): boolean {
  return /\b(item|itens|produto|produtos|sku|codigo|codigos|ranking)\b/.test(normalizarBusca(pergunta));
}

function montarProdutosRelacionados(pergunta: string, itens: ItemFrequenciaRow[], compras: CompraRow[]): ProdutoIaCard[] {
  if (!perguntaFalaDeProduto(pergunta)) return [];

  const hoje = hojeSaoPaulo();
  const filtro = filtrarItensPorPergunta(itens, pergunta, hoje);
  const topDashboard = enriquecerItensComCompras(agregarItens(filtro.rows, 8), compras);
  const base = topDashboard.length > 0
    ? topDashboard
    : [...compras]
      .sort((a, b) => toNumber(b.vezes_pedido) - toNumber(a.vezes_pedido))
      .slice(0, 8)
      .map(compraToItemResumo);

  return base.map((item, index) => produtoCardFromItem(item, index, "citados", topDashboard.length > 0 ? "dashboard de pedidos concluidos" : "tabela Compras"));
}

function limparHistorico(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const role = (item as ChatMessage)?.role;
      const content = toText((item as ChatMessage)?.content);
      if ((role !== "user" && role !== "assistant") || !content) return null;
      return { role, content: content.slice(0, 700) };
    })
    .filter((item): item is ChatMessage => !!item)
    .slice(-6);
}

function historicoParaContexto(historico: ChatMessage[]): string {
  if (historico.length === 0) return "Sem historico anterior nesta conversa.";

  return historico
    .map((item, index) => {
      const autor = item.role === "user" ? "Usuario" : "Buy-man";
      return `${index + 1}. ${autor}: ${item.content.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n");
}

function getGroqModels(): string[] {
  const configured = toText(
    process.env.GROQ_MODELS ||
    process.env.COMPRAS_IA_GROQ_MODELS ||
    process.env.GROQ_MODEL ||
    process.env.COMPRAS_IA_GROQ_MODEL
  );
  const modelos = configured
    ? configured.split(",").map((model) => model.trim()).filter(Boolean)
    : [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
      ];

  return modelos.length > 0 ? modelos : ["llama-3.3-70b-versatile"];
}

function buildIaMessages(
  pergunta: string,
  contexto: string,
  historico: ChatMessage[],
  skill: BuyManSkill,
  perguntaKey: string
) {
  const system = [
    "Voce e o Buy-man, agente interno de IA do setor de Compras do SCAN.",
    "Responda em portugues do Brasil, de forma direta e operacional.",
    "Use somente os dados fornecidos no contexto Supabase. Nao invente produto, quantidade, status ou data.",
    "A pergunta atual tem prioridade maxima. O historico serve apenas para contexto e nunca deve ser repetido como resposta.",
    "Se a pergunta atual mudar de assunto, ignore a resposta anterior e responda o novo assunto.",
    "Se os dados nao forem suficientes, diga exatamente qual filtro/data falta.",
    "Voce nao pode alterar banco, status, pedidos, ERP ou fornecedores. Apenas analisar e relatar.",
    "Padrao visual obrigatorio: use emojis moderados, titulo claro, periodo/base, resumo rapido e listas escaneaveis.",
    "Quando citar produto, traga codigo, SKU quando existir, secao, quantidade pedida, quantidade real, ocorrencias, status de compras e se ha foto disponivel.",
    "Evite resposta seca em linhas gigantes; quebre cada produto em 2 ou 3 linhas curtas.",
    "Quando for relatorio, estruture com titulo, periodo, filtros, resumo, destaques e lista objetiva.",
    skill.prompt,
  ].join("\n");

  const historicoResumo = historicoParaContexto(historico);
  const perguntaComContexto = [
    `Pergunta atual (responda somente isto): ${pergunta}`,
    `Chave/cache da pergunta: ${perguntaKey}`,
    `Skill ativa do Buy-man: ${skill.label}`,
    "Criterios obrigatorios desta skill:",
    ...skill.criterios.map((criterio) => `- ${criterio}`),
    "",
    "Historico recente (referencia, nao repetir resposta antiga):",
    historicoResumo,
    "",
    "Contexto Supabase lido pelo backend:",
    contexto,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: perguntaComContexto },
  ];
}

async function chamarChatCompletion(params: {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  provider: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(params.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
        ...(params.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: 0.15,
        max_tokens: getIaMaxTokens(),
      }),
      signal: AbortSignal.timeout(params.timeoutMs),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "tempo esgotado";
    throw new HttpError(502, `${params.provider} nao respondeu em ${Math.round(params.timeoutMs / 1000)}s: ${detail}`);
  }

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || response.statusText;
    throw new HttpError(502, `${params.provider} retornou erro: ${detail}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new HttpError(502, `${params.provider} nao retornou resposta valida.`);
  }

  return content.trim();
}

async function perguntarIa(
  pergunta: string,
  contexto: string,
  historico: ChatMessage[],
  skill: BuyManSkill,
  perguntaKey: string
): Promise<string> {
  const messages = buildIaMessages(pergunta, contexto, historico, skill, perguntaKey);
  const erros: string[] = [];
  const deadline = Date.now() + getIaTotalTimeoutMs();
  const providerTimeoutMs = getIaProviderTimeoutMs();
  const timeoutRestante = () => Math.min(providerTimeoutMs, Math.max(0, deadline - Date.now() - 750));

  const groqApiKey = process.env.GROQ_API_KEY || process.env.COMPRAS_IA_GROQ_API_KEY || "";
  if (groqApiKey) {
    for (const model of getGroqModels()) {
      const timeoutMs = timeoutRestante();
      if (timeoutMs < 2_000) {
        erros.push("orcamento de tempo da IA externa esgotado antes do Groq responder");
        break;
      }

      try {
        return await chamarChatCompletion({
          apiUrl: process.env.GROQ_API_URL || process.env.COMPRAS_IA_GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions",
          apiKey: groqApiKey,
          model,
          messages,
          provider: `Groq (${model})`,
          timeoutMs,
        });
      } catch (error) {
        erros.push(error instanceof Error ? error.message : `Groq (${model}) falhou`);
      }
    }
  } else {
    erros.push("GROQ_API_KEY nao configurada");
  }

  throw new HttpError(502, erros.join(" | "));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Metodo nao permitido." });

  try {
    const body = parseBody(req);
    const pergunta = toText(body.pergunta);
    if (pergunta.length < 3) throw new HttpError(400, "Pergunta muito curta.");
    if (pergunta.length > 2000) throw new HttpError(400, "Pergunta muito longa.");

    const empresa = normalizarEmpresa(body.empresa);
    const flag = normalizarFlag(body.flag);
    const skill = selecionarBuyManSkill(pergunta);
    const perguntaKey = montarPerguntaKey(pergunta, empresa, flag);
    const requestId = normalizarRequestId(
      body.requestId ?? req.headers["x-compras-ia-request-id"],
      perguntaKey
    );
    res.setHeader("X-Compras-Ia-Question-Key", perguntaKey);
    res.setHeader("X-Compras-Ia-Request-Id", requestId);
    const supabase = getSupabaseClient();

    await validarUsuarioAdmin(
      supabase,
      toText(body.actorLogin),
      toText(body.actorSenha),
      empresa
    );

    const dataFim = hojeSaoPaulo();
    const dataInicio = addDays(dataFim, -180);
    const avisos: string[] = [];

    const [itens, compras] = await Promise.all([
      lerItemFrequencia(supabase, empresa, flag, dataInicio, dataFim, avisos),
      lerCompras(supabase, empresa),
    ]);

    const metaInicial: QueryMeta = {
      periodo_inicio: dataInicio,
      periodo_fim: dataFim,
      empresa,
      flag,
      linhas_item_frequencia: itens.length,
      linhas_compras: compras.length,
      linhas_pedidos: 0,
      pergunta_key: perguntaKey,
      request_id: requestId,
      skill: {
        id: skill.id,
        label: skill.label,
        criterios: skill.criterios,
      },
      avisos,
    };

    const respostaComparativo = montarRespostaComparativo(pergunta, itens, compras, dataInicio, dataFim);
    if (respostaComparativo) {
      return res.status(200).json({
        ok: true,
        resposta: respostaComparativo.resposta,
        produtos: respostaComparativo.produtos,
        contexto: metaInicial,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    }

    const respostaRankingSecao = montarRespostaRankingSecao(pergunta, itens, compras, dataInicio, dataFim);
    if (respostaRankingSecao) {
      return res.status(200).json({
        ok: true,
        resposta: respostaRankingSecao.resposta,
        produtos: respostaRankingSecao.produtos,
        contexto: metaInicial,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    }

    const respostaMelhorPior = montarRespostaMelhorPiorItens(pergunta, itens, compras, dataInicio, dataFim);
    if (respostaMelhorPior) {
      return res.status(200).json({
        ok: true,
        resposta: respostaMelhorPior.resposta,
        produtos: respostaMelhorPior.produtos,
        contexto: metaInicial,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    }

    const respostaDireta = montarRespostaTopItens(pergunta, itens, compras, dataInicio, dataFim);
    if (respostaDireta) {
      return res.status(200).json({
        ok: true,
        resposta: respostaDireta.resposta,
        produtos: respostaDireta.produtos,
        contexto: metaInicial,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    }

    const [pedidos, secoes] = await Promise.all([
      lerPedidosRecentes(supabase, empresa, flag),
      lerSecoes(supabase, empresa, flag, dataInicio, dataFim),
    ]);

    const { contexto, meta } = montarContexto({
      pergunta,
      empresa,
      flag,
      dataInicio,
      dataFim,
      perguntaKey,
      requestId,
      skill,
      itens,
      compras,
      pedidos,
      secoes,
      avisos,
    });

    try {
      const resposta = await perguntarIa(pergunta, contexto, limparHistorico(body.historico), skill, perguntaKey);
      return res.status(200).json({
        ok: true,
        resposta,
        produtos: montarProdutosRelacionados(pergunta, itens, compras),
        contexto: meta,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    } catch (error) {
      const erroIa = error instanceof Error ? error.message : "erro desconhecido";
      meta.avisos.push(erroIa);
      const respostaFallback = montarRespostaFallback({
        pergunta,
        itens,
        compras,
        dataInicio,
        dataFim,
        erroIa,
      });
      return res.status(200).json({
        ok: true,
        resposta: respostaFallback.resposta,
        produtos: respostaFallback.produtos,
        contexto: meta,
        pergunta_key: perguntaKey,
        request_id: requestId,
      });
    }
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Falha na IA de Compras.";
    console.error("[compras-ia] erro", { statusCode, message, error });
    return res.status(statusCode).json({ ok: false, error: message });
  }
}
