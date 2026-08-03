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

type RequestBody = {
  pergunta?: unknown;
  historico?: unknown;
  empresa?: unknown;
  flag?: unknown;
  actorLogin?: unknown;
  actorSenha?: unknown;
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
  vezes: number;
  total_pedido: number;
  total_real: number;
};

type QueryMeta = {
  periodo_inicio: string;
  periodo_fim: string;
  empresa: Empresa;
  flag: LoginFlag;
  linhas_item_frequencia: number;
  linhas_compras: number;
  linhas_pedidos: number;
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
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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
      .select("empresa,codigo,sku,descricao,secao,status,vezes_pedido,pedido_feito,updated_at")
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
    .limit(250);

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
    .slice(0, datasExatas.length || diasMes.length ? 80 : 45)
    .map(([data, list]) => ({
      data,
      itens: agregarItens(list, 8),
    }));
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
  itens: ItemFrequenciaRow[];
  compras: CompraRow[];
  pedidos: PedidoRow[];
  secoes: SecaoRow[];
  avisos: string[];
}): { contexto: string; meta: QueryMeta } {
  const hoje = hojeSaoPaulo();
  const topItensPeriodo = agregarItens(params.itens, 80);
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
    escopo: {
      empresa: params.empresa,
      flag: params.flag,
      periodo_inicio: params.dataInicio,
      periodo_fim: params.dataFim,
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
    avisos: params.avisos,
  };

  return {
    contexto: JSON.stringify(dados, null, 2),
    meta,
  };
}

function limparHistorico(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const role = (item as ChatMessage)?.role;
      const content = toText((item as ChatMessage)?.content);
      if ((role !== "user" && role !== "assistant") || !content) return null;
      return { role, content: content.slice(0, 3000) };
    })
    .filter((item): item is ChatMessage => !!item)
    .slice(-8);
}

async function perguntarIa(pergunta: string, contexto: string, historico: ChatMessage[]): Promise<string> {
  const apiUrl = (
    process.env.COMPRAS_IA_API_URL ||
    process.env.BONSAI_API_URL ||
    "https://ai.187-127-45-197.nip.io/v1/chat/completions"
  );
  const apiKey = process.env.COMPRAS_IA_API_KEY || process.env.BONSAI_API_KEY || "";
  const model = process.env.COMPRAS_IA_MODEL || process.env.BONSAI_MODEL || "bonsai-27b";

  if (!apiKey) {
    throw new HttpError(500, "COMPRAS_IA_API_KEY nao configurada na Vercel.");
  }

  const system = [
    "Voce e a IA interna do setor de Compras do SCAN.",
    "Responda em portugues do Brasil, de forma direta e operacional.",
    "Use somente os dados fornecidos no contexto Supabase. Nao invente produto, quantidade, status ou data.",
    "Se os dados nao forem suficientes, diga exatamente qual filtro/data falta.",
    "Voce nao pode alterar banco, status, pedidos, ERP ou fornecedores. Apenas analisar e relatar.",
    "Quando for relatorio, estruture com titulo, periodo, filtros, resumo e lista objetiva.",
  ].join("\n");

  const perguntaComContexto = [
    `Pergunta atual: ${pergunta}`,
    "",
    "Contexto Supabase lido pelo backend:",
    contexto,
  ].join("\n");

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        ...historico,
        { role: "user", content: perguntaComContexto },
      ],
      temperature: 0.2,
      max_tokens: 1400,
    }),
    signal: AbortSignal.timeout(55_000),
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || response.statusText;
    throw new HttpError(502, `IA retornou erro: ${detail}`);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new HttpError(502, "IA nao retornou resposta valida.");
  }

  return content.trim();
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

    const [itens, compras, pedidos, secoes] = await Promise.all([
      lerItemFrequencia(supabase, empresa, flag, dataInicio, dataFim, avisos),
      lerCompras(supabase, empresa),
      lerPedidosRecentes(supabase, empresa, flag),
      lerSecoes(supabase, empresa, flag, dataInicio, dataFim),
    ]);

    const { contexto, meta } = montarContexto({
      pergunta,
      empresa,
      flag,
      dataInicio,
      dataFim,
      itens,
      compras,
      pedidos,
      secoes,
      avisos,
    });

    const resposta = await perguntarIa(pergunta, contexto, limparHistorico(body.historico));
    return res.status(200).json({ ok: true, resposta, contexto: meta });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Falha na IA de Compras.";
    console.error("[compras-ia] erro", { statusCode, message, error });
    return res.status(statusCode).json({ ok: false, error: message });
  }
}
