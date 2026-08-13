import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const config = { maxDuration: 30 };

type Empresa = "NEWSHOP" | "SOYE" | "FACIL" | "SEFULY";
type LoginFlag = "loja" | "cd";
type UserRole = "operador" | "compras" | "admin" | "super";
type AnaliseTipo = "resumo" | "faltas" | "mais_pedidos" | "prioridades" | "pergunta";
type TomMetrica = "neutro" | "positivo" | "atencao" | "critico";
type OrigemLeitura = "trigger" | "calculada";

const EMPRESAS_VALIDAS: Empresa[] = ["NEWSHOP", "SOYE", "FACIL", "SEFULY"];
const MODELOS_COMPRAS_IA = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "gemma-4-31b-it:free",
  "llama-3.3-70b-instruct:free",
  "qwen3-next-80b-a3b-instruct:free",
  "ling-3.0-tiny-free",
  "lfm-2.5-2.6b:free",
  "nex-n2-pro:free",
  "glm-4.5-air:free",
] as const;
const MODELO_COMPRAS_IA_PADRAO = MODELOS_COMPRAS_IA[0];

type RequestBody = {
  pergunta?: unknown;
  tipo?: unknown;
  periodoDias?: unknown;
  empresa?: unknown;
  flag?: unknown;
  actorLogin?: unknown;
  modelo?: unknown;
};

type UsuarioLoginRow = {
  id?: string;
  login?: string;
  nome?: string;
  role?: string;
  empresas?: string[];
  ativo?: boolean;
};

type ItemFrequenciaRow = {
  empresa?: string | null;
  data: string | null;
  codigo: string | null;
  sku: string | null;
  secao: string | null;
  descricao?: string | null;
  foto_url?: string | null;
  vezes: number | null;
  total_pedido: number | null;
  total_real: number | null;
};

type CompraRow = {
  codigo: string | null;
  sku: string | null;
  descricao: string | null;
  secao: string | null;
  foto_url: string | null;
  status: string | null;
  pedido_feito: number | boolean | null;
  updated_at: string | null;
};

type SecaoRow = {
  empresa?: string | null;
  secao: string | null;
  total: number | null;
  nao_tem: number | null;
  parcial: number | null;
  pendente: number | null;
  total_pedido: number | null;
  total_real: number | null;
};

type DiarioRow = {
  empresa?: string | null;
  total_conferencias: number | null;
  total_itens: number | null;
  separado: number | null;
  nao_tem: number | null;
  parcial: number | null;
  pendente: number | null;
};

type ProdutoAgregado = {
  empresas: Empresa[];
  porEmpresa: Partial<Record<Empresa, {
    ocorrencias: number;
    pedido: number;
    atendido: number;
    falta: number;
  }>>;
  codigo: string;
  sku: string;
  descricao: string;
  secao: string;
  fotoUrl: string | null;
  status: string;
  pedidoFeito: boolean | null;
  atualizadoEm: string;
  ocorrencias: number;
  pedido: number;
  atendido: number;
  falta: number;
  taxaAtendimento: number;
  prioridade: "alta" | "media" | "baixa" | "bloqueada";
  motivo: string;
  score: number;
};

type SecaoAgregada = {
  nome: string;
  pedido: number;
  atendido: number;
  falta: number;
  naoTem: number;
  parcial: number;
  pendente: number;
  taxaAtendimento: number;
};

type Metrica = {
  id: string;
  label: string;
  valor: string;
  detalhe: string;
  tom: TomMetrica;
};

type VisualizacaoPergunta = {
  mostrarGrafico: boolean;
  mostrarProdutos: boolean;
};

export type CriteriosPergunta = {
  limite: number;
  minimoOcorrencias: number | null;
  ordenacao: "ocorrencias" | "quantidade";
  estruturada: boolean;
};

class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const TITULOS: Record<AnaliseTipo, string> = {
  resumo: "Resumo executivo de Compras",
  faltas: "Itens com maior falta",
  mais_pedidos: "Itens mais pedidos",
  prioridades: "Prioridades para revisar",
  pergunta: "Análise personalizada",
};

const PERGUNTAS_PADRAO: Record<Exclude<AnaliseTipo, "pergunta">, string> = {
  resumo: "Faça um resumo executivo do período.",
  faltas: "Quais itens tiveram maior falta entre pedido e quantidade atendida?",
  mais_pedidos: "Quais foram os itens mais pedidos no período?",
  prioridades: "Quais itens devem ser revisados primeiro pela equipe de Compras?",
};

function configurarResposta(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function numero(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBody(req: VercelRequest): RequestBody {
  if (!req.body) return {};
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8")) as RequestBody;
  if (typeof req.body === "string") return JSON.parse(req.body) as RequestBody;
  return req.body as RequestBody;
}

function normalizarEmpresa(value: unknown): Empresa {
  const empresa = texto(value).toUpperCase();
  if (empresa.includes("SEFULY")) return "SEFULY";
  if (empresa.includes("SOYE")) return "SOYE";
  if (empresa.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
}

function normalizarFlag(value: unknown): LoginFlag {
  return texto(value).toLowerCase() === "cd" ? "cd" : "loja";
}

function normalizarRole(value: unknown): UserRole {
  const role = texto(value).toLowerCase();
  if (role === "compras" || role === "admin" || role === "super") return role;
  return "operador";
}

function normalizarTipo(value: unknown): AnaliseTipo {
  const tipo = texto(value);
  if (tipo === "faltas" || tipo === "mais_pedidos" || tipo === "prioridades" || tipo === "pergunta") return tipo;
  return "resumo";
}

function normalizarModeloComprasIa(value: unknown): string {
  const modelo = texto(value);
  return MODELOS_COMPRAS_IA.includes(modelo as typeof MODELOS_COMPRAS_IA[number])
    ? modelo
    : MODELO_COMPRAS_IA_PADRAO;
}

function normalizarPeriodo(value: unknown): number {
  const dias = Math.round(numero(value));
  if (!dias) return 30;
  return Math.max(7, Math.min(180, dias));
}

function normalizarEmpresas(value: unknown): Empresa[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizarEmpresa)));
}

function empresaCompras(empresa: Empresa): "NEWSHOP" | "SF" | "SEFULY" {
  if (empresa === "SEFULY") return "SEFULY";
  return empresa === "NEWSHOP" ? "NEWSHOP" : "SF";
}

function empresasCompras(empresas: Empresa[]): ("NEWSHOP" | "SF" | "SEFULY")[] {
  return Array.from(new Set(empresas.map(empresaCompras)));
}

function extrairLojasSfPergunta(pergunta: string): Empresa[] {
  const busca = normalizarBusca(pergunta);
  const mencionaSoye = /\b(soye|so\s*soye)\b/.test(busca);
  const mencionaFacil = /\b(facil|so\s*facil|atacado)\b/.test(busca);
  const empresas: Empresa[] = [];
  if (mencionaSoye) empresas.push("SOYE");
  if (mencionaFacil) empresas.push("FACIL");
  return empresas;
}

export function extrairEscopoEmpresasPergunta(empresaAtual: Empresa, pergunta: string): Empresa[] {
  if (empresaAtual !== "SOYE" && empresaAtual !== "FACIL") return [empresaAtual];
  const lojasCitadas = extrairLojasSfPergunta(pergunta);
  return lojasCitadas.length ? lojasCitadas : [empresaAtual];
}

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function subtrairDias(dataIso: string, dias: number): string {
  const data = new Date(`${dataIso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

function clienteSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
  if (!url || !key) {
    throw new HttpError(500, "Supabase não configurado para o analista de Compras.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function validarAcesso(
  supabase: SupabaseClient,
  login: string,
  empresa: Empresa
): Promise<void> {
  if (!login) throw new HttpError(401, "Sessão inválida. Entre novamente no sistema.");

  const loginNormalizado = login.trim().toLowerCase();
  const buscarNaEmpresa = async (empresaBusca: Empresa): Promise<UsuarioLoginRow | undefined> => {
    const { data, error } = await supabase.rpc("chat_listar_usuarios", {
      p_empresa: empresaBusca,
    });
    if (error) {
      console.error("[compras-ia] falha ao validar sessao", error);
      throw new HttpError(401, "Nao foi possivel validar a sessao atual.");
    }
    return Array.isArray(data)
      ? data.find((row) => texto((row as UsuarioLoginRow).login).toLowerCase() === loginNormalizado) as UsuarioLoginRow | undefined
      : undefined;
  };

  let usuario = await buscarNaEmpresa(empresa);
  const encontradoNaEmpresaSelecionada = Boolean(usuario);
  if (!usuario) {
    for (const empresaBusca of EMPRESAS_VALIDAS.filter((item) => item !== empresa)) {
      usuario = await buscarNaEmpresa(empresaBusca);
      if (usuario) break;
    }
  }
  if (!usuario) throw new HttpError(401, "Sessão inválida. Entre novamente no sistema.");
  const role = normalizarRole(usuario.role);
  if (role !== "compras" && role !== "admin" && role !== "super") {
    throw new HttpError(403, "Analista de Compras disponivel apenas para Compras, Admin e Super.");
  }
  if (role === "super") return;
  if (!encontradoNaEmpresaSelecionada) {
    throw new HttpError(403, "Usuário sem acesso à empresa selecionada.");
  }

  const permitidas = normalizarEmpresas(usuario.empresas);
  if (permitidas.length && !permitidas.includes(empresa)) {
    throw new HttpError(403, "Usuário sem acesso à empresa selecionada.");
  }
}

async function selecionarTudo<T>(
  query: (inicio: number, fim: number) => unknown,
  limite: number
): Promise<T[]> {
  const resultado: T[] = [];
  const pagina = 1000;
  for (let inicio = 0; inicio < limite; inicio += pagina) {
    const fim = Math.min(inicio + pagina - 1, limite - 1);
    const { data, error } = await query(inicio, fim) as { data?: unknown; error?: unknown };
    if (error) throw error;
    const linhas = Array.isArray(data) ? data as T[] : [];
    resultado.push(...linhas);
    if (linhas.length < pagina) break;
  }
  return resultado;
}

async function lerItens(
  supabase: SupabaseClient,
  empresas: Empresa[],
  flag: LoginFlag,
  inicio: string,
  fim: string,
  avisos: string[]
): Promise<ItemFrequenciaRow[]> {
  const base = (select: string) => (de: number, ate: number) => supabase
    .from("dashboard_item_frequencia")
    .select(select)
    .in("empresa", empresas)
    .eq("flag", flag)
    .gte("data", inicio)
    .lte("data", fim)
    .order("total_pedido", { ascending: false })
    .range(de, ate);

  try {
    return await selecionarTudo<ItemFrequenciaRow>(
      base("empresa,data,codigo,sku,secao,descricao,foto_url,vezes,total_pedido,total_real"),
      5000
    );
  } catch (error) {
    avisos.push("A view de itens não expõe descrição/foto; dados foram enriquecidos pela fila de Compras.");
    console.warn("[compras-ia] fallback de colunas da dashboard_item_frequencia", error);
    return selecionarTudo<ItemFrequenciaRow>(
      base("empresa,data,codigo,sku,secao,vezes,total_pedido,total_real"),
      5000
    );
  }
}

async function lerCompras(supabase: SupabaseClient, empresas: Empresa[]): Promise<CompraRow[]> {
  return selecionarTudo<CompraRow>((de, ate) => supabase
    .from("compras")
    .select("codigo,sku,descricao,secao,foto_url,status,pedido_feito,updated_at")
    .in("empresa", empresasCompras(empresas))
    .order("updated_at", { ascending: false })
    .range(de, ate), 3000);
}

async function lerSecoes(
  supabase: SupabaseClient,
  empresas: Empresa[],
  flag: LoginFlag,
  inicio: string,
  fim: string
): Promise<SecaoRow[]> {
  return selecionarTudo<SecaoRow>((de, ate) => supabase
    .from("dashboard_por_secao")
    .select("empresa,secao,total,nao_tem,parcial,pendente,total_pedido,total_real")
    .in("empresa", empresas)
    .eq("flag", flag)
    .gte("data", inicio)
    .lte("data", fim)
    .range(de, ate), 3000);
}

async function lerDiario(
  supabase: SupabaseClient,
  empresas: Empresa[],
  flag: LoginFlag,
  inicio: string,
  fim: string
): Promise<DiarioRow[]> {
  const { data, error } = await supabase
    .from("dashboard_diario")
    .select("empresa,total_conferencias,total_itens,separado,nao_tem,parcial,pendente")
    .in("empresa", empresas)
    .eq("flag", flag)
    .gte("data", inicio)
    .lte("data", fim);
  if (error) throw error;
  return (data ?? []) as DiarioRow[];
}

function chaveProduto(codigo: string, sku: string): string[] {
  const valores = [codigo, sku]
    .map((valor) => valor.replace(/\D/g, "").replace(/^0+/, ""))
    .filter(Boolean);
  return Array.from(new Set(valores));
}

const STATUS_COMPRA_PRIORITY: Record<string, number> = {
  concluido: 700,
  compra_realizada: 600,
  pedido_andamento: 500,
  fazer_pedido: 400,
  produto_bom: 300,
  produto_ruim: 200,
  todo: 100,
};

function compraDeMaiorPrioridade(atual: CompraRow | undefined, candidata: CompraRow): CompraRow {
  if (!atual) return candidata;

  const prioridadeAtual = STATUS_COMPRA_PRIORITY[texto(atual.status).toLowerCase()] ?? 0;
  const prioridadeCandidata = STATUS_COMPRA_PRIORITY[texto(candidata.status).toLowerCase()] ?? 0;
  if (prioridadeCandidata !== prioridadeAtual) {
    return prioridadeCandidata > prioridadeAtual ? candidata : atual;
  }

  const dataAtual = Date.parse(texto(atual.updated_at));
  const dataCandidata = Date.parse(texto(candidata.updated_at));
  return (Number.isFinite(dataCandidata) ? dataCandidata : 0) > (Number.isFinite(dataAtual) ? dataAtual : 0)
    ? candidata
    : atual;
}

function indexarCompras(compras: CompraRow[]): Map<string, CompraRow> {
  const indice = new Map<string, CompraRow>();
  for (const compra of compras) {
    for (const chave of chaveProduto(texto(compra.codigo), texto(compra.sku))) {
      indice.set(chave, compraDeMaiorPrioridade(indice.get(chave), compra));
    }
  }
  return indice;
}

function compraVinculada(indice: Map<string, CompraRow>, codigo: string, sku: string): CompraRow | undefined {
  for (const chave of chaveProduto(codigo, sku)) {
    const compra = indice.get(chave);
    if (compra) return compra;
  }
  return undefined;
}

function fotoSegura(value: unknown): string | null {
  const url = texto(value);
  return /^https?:\/\//i.test(url) ? url : null;
}

function pedidoFeito(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  return value === true || value === 1 || texto(value) === "1" || texto(value).toLowerCase() === "true";
}

function avaliarPrioridade(item: Omit<ProdutoAgregado, "prioridade" | "motivo" | "score">) {
  const status = item.status.toLowerCase();
  const bloqueado = item.pedidoFeito === true || [
    "produto_ruim",
    "pedido_andamento",
    "compra_realizada",
    "concluido",
  ].includes(status);

  if (bloqueado) {
    const motivo = item.pedidoFeito || status === "pedido_andamento"
      ? "Pedido já realizado ou em andamento."
      : status === "produto_ruim"
        ? "Item marcado como produto ruim."
        : "Compra já finalizada.";
    return { prioridade: "bloqueada" as const, motivo, score: -1 };
  }

  const score = Math.round(item.falta * 5 + item.ocorrencias * 2 + item.pedido * 0.15);
  if (item.falta > 0 && (item.ocorrencias >= 2 || item.taxaAtendimento < 75)) {
    return { prioridade: "alta" as const, motivo: "Falta recorrente ou atendimento abaixo de 75%.", score };
  }
  if (item.falta > 0) {
    return { prioridade: "media" as const, motivo: "Existe diferença entre o pedido e o atendido.", score };
  }
  return { prioridade: "baixa" as const, motivo: "Sem falta registrada no período.", score };
}

function agregarProdutos(itens: ItemFrequenciaRow[], compras: CompraRow[]): ProdutoAgregado[] {
  const indiceCompras = indexarCompras(compras);
  const mapa = new Map<string, Omit<ProdutoAgregado, "prioridade" | "motivo" | "score">>();

  for (const linha of itens) {
    const codigo = texto(linha.codigo) || "SEM-CODIGO";
    const sku = texto(linha.sku);
    const chave = codigo !== "SEM-CODIGO" ? codigo : `sku:${sku}`;
    const compra = compraVinculada(indiceCompras, codigo, sku);
    const empresaLinha = normalizarEmpresa(linha.empresa);
    const descricaoBase = texto(linha.descricao) || texto(compra?.descricao);
    const descricao = descricaoBase && descricaoBase !== codigo
      ? descricaoBase
      : /[a-z]/i.test(sku) ? sku : codigo;
    const atual = mapa.get(chave) ?? {
      empresas: [],
      porEmpresa: {},
      codigo,
      sku,
      descricao,
      secao: texto(linha.secao) || texto(compra?.secao) || "Sem categoria",
      fotoUrl: fotoSegura(linha.foto_url) || fotoSegura(compra?.foto_url),
      status: texto(compra?.status),
      pedidoFeito: pedidoFeito(compra?.pedido_feito),
      atualizadoEm: texto(compra?.updated_at),
      ocorrencias: 0,
      pedido: 0,
      atendido: 0,
      falta: 0,
      taxaAtendimento: 0,
    };

    atual.ocorrencias += numero(linha.vezes);
    atual.pedido += numero(linha.total_pedido);
    atual.atendido += numero(linha.total_real);
    if (!atual.empresas.includes(empresaLinha)) atual.empresas.push(empresaLinha);
    const loja = atual.porEmpresa[empresaLinha] ?? { ocorrencias: 0, pedido: 0, atendido: 0, falta: 0 };
    loja.ocorrencias += numero(linha.vezes);
    loja.pedido += numero(linha.total_pedido);
    loja.atendido += numero(linha.total_real);
    loja.falta = Math.max(0, loja.pedido - loja.atendido);
    atual.porEmpresa[empresaLinha] = loja;
    if (!atual.fotoUrl) atual.fotoUrl = fotoSegura(linha.foto_url) || fotoSegura(compra?.foto_url);
    mapa.set(chave, atual);
  }

  return Array.from(mapa.values()).map((item) => {
    item.falta = Math.max(0, item.pedido - item.atendido);
    item.taxaAtendimento = item.pedido > 0 ? Math.min(100, (item.atendido / item.pedido) * 100) : 100;
    return { ...item, ...avaliarPrioridade(item) };
  });
}

function agregarSecoes(rows: SecaoRow[]): SecaoAgregada[] {
  const mapa = new Map<string, Omit<SecaoAgregada, "falta" | "taxaAtendimento">>();
  for (const row of rows) {
    const nome = texto(row.secao) || "Sem categoria";
    const atual = mapa.get(nome) ?? { nome, pedido: 0, atendido: 0, naoTem: 0, parcial: 0, pendente: 0 };
    atual.pedido += numero(row.total_pedido);
    atual.atendido += numero(row.total_real);
    atual.naoTem += numero(row.nao_tem);
    atual.parcial += numero(row.parcial);
    atual.pendente += numero(row.pendente);
    mapa.set(nome, atual);
  }
  return Array.from(mapa.values()).map((secao) => ({
    ...secao,
    falta: Math.max(0, secao.pedido - secao.atendido),
    taxaAtendimento: secao.pedido > 0 ? Math.min(100, (secao.atendido / secao.pedido) * 100) : 100,
  })).sort((a, b) => b.falta - a.falta || b.pedido - a.pedido);
}

function resumoDiario(rows: DiarioRow[]) {
  return rows.reduce((total, row) => ({
    conferencias: total.conferencias + numero(row.total_conferencias),
    itens: total.itens + numero(row.total_itens),
    separado: total.separado + numero(row.separado),
    naoTem: total.naoTem + numero(row.nao_tem),
    parcial: total.parcial + numero(row.parcial),
    pendente: total.pendente + numero(row.pendente),
  }), { conferencias: 0, itens: 0, separado: 0, naoTem: 0, parcial: 0, pendente: 0 });
}

function ptNumero(value: number): string {
  return Math.round(value).toLocaleString("pt-BR");
}

function ptPercentual(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function normalizarBusca(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extrairCriteriosPergunta(pergunta: string): CriteriosPergunta {
  const busca = normalizarBusca(pergunta);
  const limiteMatch = busca.match(/\btop\s*(\d{1,2})\b/)
    || busca.match(/\b(?:lista|liste|mostre|gere)\s+(?:os\s+)?(\d{1,2})\b/);
  const frequenciaMatch = busca.match(/\b(\d{1,3})x\s+(?:a|ou)\s+mais\b/)
    || busca.match(/\b(?:pelo menos|minimo de)\s+(\d{1,3})\s*(?:x|vez|vezes)\b/)
    || busca.match(/\b(\d{1,3})\s*(?:vez|vezes)\s+(?:a|ou)\s+mais\b/);
  const limite = Math.max(1, Math.min(50, limiteMatch ? Number(limiteMatch[1]) : 12));
  const minimoOcorrencias = frequenciaMatch
    ? Math.max(1, Math.min(999, Number(frequenciaMatch[1])))
    : null;
  return {
    limite,
    minimoOcorrencias,
    ordenacao: minimoOcorrencias !== null ? "ocorrencias" : "quantidade",
    estruturada: Boolean(limiteMatch || frequenciaMatch),
  };
}

export function extrairVisualizacaoPergunta(
  pergunta: string,
  tipo: AnaliseTipo,
  criterios: CriteriosPergunta = extrairCriteriosPergunta(pergunta)
): VisualizacaoPergunta {
  const busca = normalizarBusca(pergunta);
  const pedeGrafico = /\b(grafico|graficos|chart|barra|barras)\b/.test(busca)
    || /\b(por secao|por secoes|secoes com|secao com)\b/.test(busca);
  const mencionaSecao = /\b(secao|secoes|setor|setores)\b/.test(busca);
  const pedeProduto = criterios.estruturada
    || /\b(item|itens|produto|produtos|codigo|sku|ean)\b/.test(busca)
    || /\b(mais pedido|mais pedidos|menos pedido|menos pedidos|ranking)\b/.test(busca);

  if (tipo !== "pergunta") {
    return {
      mostrarGrafico: false,
      mostrarProdutos: tipo !== "resumo",
    };
  }

  return {
    mostrarGrafico: pedeGrafico,
    mostrarProdutos: pedeProduto && !(mencionaSecao && !pedeProduto),
  };
}

function inferirTipoPergunta(pergunta: string): Exclude<AnaliseTipo, "pergunta"> | "pergunta" {
  const busca = normalizarBusca(pergunta);
  if (/\b(falta|faltou|nao tem|ruptura)\b/.test(busca)) return "faltas";
  if (/\b(menos pedido|menos pedidos|menor pedido|menores pedidos)\b/.test(busca)) return "mais_pedidos";
  if (/\b(mais pedido|mais pedidos|maior pedido|ranking)\b/.test(busca)) return "mais_pedidos";
  if (/\b(comprar|compra|prioridade|priorizar|recomenda)\b/.test(busca)) return "prioridades";
  if (/\b(resumo|visao geral|executivo)\b/.test(busca)) return "resumo";
  return "pergunta";
}

function produtosCitadosNaPergunta(pergunta: string, produtos: ProdutoAgregado[]): ProdutoAgregado[] {
  const ignorar = new Set([
    "qual", "quais", "item", "itens", "produto", "produtos", "secao", "setor",
    "teve", "tiveram", "mais", "menos", "maior", "menor", "pedido", "pedidos",
    "falta", "faltas", "periodo", "mostrar", "mostre", "analise", "compras",
    "gere", "lista", "liste", "foram", "vez", "vezes",
  ]);
  const tokens = normalizarBusca(pergunta).split(" ").filter((token) => token.length >= 3 && !ignorar.has(token));
  if (!tokens.length) return [];
  return produtos.filter((produto) => {
    const busca = normalizarBusca(`${produto.codigo} ${produto.sku} ${produto.descricao} ${produto.secao}`);
    return tokens.some((token) => busca.includes(token));
  });
}

function selecionarProdutos(
  tipo: AnaliseTipo,
  produtos: ProdutoAgregado[],
  pergunta = "",
  criterios: CriteriosPergunta = extrairCriteriosPergunta(pergunta)
): ProdutoAgregado[] {
  const busca = normalizarBusca(pergunta);
  const menorPedido = /\b(menos pedido|menos pedidos|menor pedido|menores pedidos)\b/.test(busca);
  const ativos = produtos.filter((produto) => (
    produto.pedido > 0
    && (criterios.minimoOcorrencias === null || produto.ocorrencias >= criterios.minimoOcorrencias)
  ));
  const limite = criterios.limite;
  if (tipo === "pergunta") {
    const citados = produtosCitadosNaPergunta(pergunta, ativos);
    if (citados.length) {
      return citados.sort((a, b) => b.ocorrencias - a.ocorrencias || b.pedido - a.pedido).slice(0, limite);
    }
    const inferido = inferirTipoPergunta(pergunta);
    if (inferido !== "pergunta") return selecionarProdutos(inferido, ativos, pergunta, criterios);
  }
  if (criterios.ordenacao === "ocorrencias") {
    return [...ativos]
      .sort((a, b) => b.ocorrencias - a.ocorrencias || b.pedido - a.pedido)
      .slice(0, limite);
  }
  if (tipo === "mais_pedidos") {
    return [...ativos].sort((a, b) => (
      menorPedido
        ? a.pedido - b.pedido || a.ocorrencias - b.ocorrencias
        : b.pedido - a.pedido || b.ocorrencias - a.ocorrencias
    )).slice(0, limite);
  }
  if (tipo === "prioridades") {
    return ativos
      .filter((produto) => produto.prioridade !== "bloqueada")
      .sort((a, b) => b.score - a.score || b.falta - a.falta)
      .slice(0, limite);
  }
  return ativos
    .filter((produto) => produto.falta > 0)
    .sort((a, b) => b.falta - a.falta || b.pedido - a.pedido)
    .slice(0, limite);
}

function montarLeituraEstruturada(
  criterios: CriteriosPergunta,
  produtos: ProdutoAgregado[],
  totalElegiveis: number
): string {
  if (!produtos.length) {
    return criterios.minimoOcorrencias !== null
      ? `• Nenhum item foi pedido ${criterios.minimoOcorrencias} vezes ou mais no período selecionado.`
      : "• Nenhum item foi encontrado para o ranking solicitado.";
  }
  const lider = produtos[0];
  const filtro = criterios.minimoOcorrencias !== null
    ? ` com frequência mínima de ${criterios.minimoOcorrencias} vezes`
    : "";
  return [
    `• ${ptNumero(totalElegiveis)} itens atendem ao filtro${filtro}; exibindo os ${ptNumero(produtos.length)} primeiros.`,
    `• Ranking ordenado por ${criterios.ordenacao === "ocorrencias" ? "número de vezes em que o item foi pedido" : "quantidade total pedida"}.`,
    `• Líder: ${lider.descricao} — ${ptNumero(lider.ocorrencias)} vezes, ${ptNumero(lider.pedido)} unidades pedidas e ${ptNumero(lider.atendido)} atendidas.`,
    "• Os números vêm das conferências concluídas dentro do período selecionado.",
  ].join("\n");
}

function tituloEstruturado(criterios: CriteriosPergunta): string {
  if (criterios.minimoOcorrencias !== null) {
    return `Top ${criterios.limite} itens pedidos ${criterios.minimoOcorrencias} vezes ou mais`;
  }
  return `Top ${criterios.limite} itens mais pedidos`;
}

function montarMetricas(produtos: ProdutoAgregado[], diario: ReturnType<typeof resumoDiario>): Metrica[] {
  const pedido = produtos.reduce((total, item) => total + item.pedido, 0);
  const atendido = produtos.reduce((total, item) => total + item.atendido, 0);
  const falta = produtos.reduce((total, item) => total + item.falta, 0);
  const taxa = pedido > 0 ? Math.min(100, (atendido / pedido) * 100) : 100;
  return [
    {
      id: "conferencias",
      label: "Conferências",
      valor: ptNumero(diario.conferencias),
      detalhe: `${ptNumero(diario.itens)} itens conferidos`,
      tom: "neutro",
    },
    {
      id: "pedido",
      label: "Quantidade pedida",
      valor: ptNumero(pedido),
      detalhe: `${ptNumero(produtos.length)} produtos únicos`,
      tom: "neutro",
    },
    {
      id: "falta",
      label: "Falta acumulada",
      valor: ptNumero(falta),
      detalhe: `${ptNumero(diario.naoTem)} marcações de não tem`,
      tom: falta > 0 ? "critico" : "positivo",
    },
    {
      id: "atendimento",
      label: "Taxa de atendimento",
      valor: ptPercentual(taxa),
      detalhe: `${ptNumero(atendido)} unidades atendidas`,
      tom: taxa >= 90 ? "positivo" : taxa >= 75 ? "atencao" : "critico",
    },
  ];
}

function montarMetricasRanking(
  produtos: ProdutoAgregado[],
  totalElegiveis: number,
  criterios: CriteriosPergunta
): Metrica[] {
  const lider = produtos[0];
  const quantidadeRanking = produtos.reduce((total, produto) => total + produto.pedido, 0);
  const ocorrenciasRanking = produtos.reduce((total, produto) => total + produto.ocorrencias, 0);
  return [
    {
      id: "elegiveis",
      label: "Itens no filtro",
      valor: ptNumero(totalElegiveis),
      detalhe: criterios.minimoOcorrencias !== null
        ? `Pedidos ${ptNumero(criterios.minimoOcorrencias)} vezes ou mais`
        : "Dentro do período escolhido",
      tom: "neutro",
    },
    {
      id: "exibidos",
      label: "Itens exibidos",
      valor: ptNumero(produtos.length),
      detalhe: `Limite solicitado: ${ptNumero(criterios.limite)}`,
      tom: "neutro",
    },
    {
      id: "maior_frequencia",
      label: "Maior frequência",
      valor: ptNumero(lider?.ocorrencias ?? 0),
      detalhe: lider ? lider.descricao : "Nenhum item encontrado",
      tom: "positivo",
    },
    {
      id: "quantidade_ranking",
      label: "Qtd. dos listados",
      valor: ptNumero(quantidadeRanking),
      detalhe: `${ptNumero(ocorrenciasRanking)} ocorrências somadas`,
      tom: "neutro",
    },
  ];
}

function leituraFallback(
  tipo: AnaliseTipo,
  produtos: ProdutoAgregado[],
  secoes: SecaoAgregada[],
  metricas: Metrica[]
): string {
  if (!produtos.length) {
    return "Não há dados concluídos no período selecionado para montar a análise.";
  }
  const produto = selecionarProdutos(tipo, produtos)[0];
  const secao = secoes[0];
  const linhas = [
    `• O período registrou ${metricas[1].valor} unidades pedidas e atendimento de ${metricas[3].valor}.`,
  ];
  if (produto) linhas.push(`• ${produto.descricao} lidera o recorte, com ${ptNumero(produto.pedido)} pedidos e falta de ${ptNumero(produto.falta)}.`);
  if (secao) linhas.push(`• A seção ${secao.nome} concentra a maior falta: ${ptNumero(secao.falta)} unidades.`);
  const altas = produtos.filter((item) => item.prioridade === "alta").length;
  linhas.push(`• ${ptNumero(altas)} produtos estão em prioridade alta para revisão humana.`);
  linhas.push("• A prioridade é indicativa: confirme estoque, venda e pedido aberto antes de comprar.");
  return linhas.join("\n");
}

function contextoCompacto(produtos: ProdutoAgregado[], secoes: SecaoAgregada[], metricas: Metrica[]) {
  return {
    metricas,
    produtos: produtos.slice(0, 20).map((item) => ({
      lojas: item.empresas,
      por_loja: item.porEmpresa,
      codigo: item.codigo,
      descricao: item.descricao,
      secao: item.secao,
      pedido: item.pedido,
      atendido: item.atendido,
      falta: item.falta,
      ocorrencias: item.ocorrencias,
      atendimento_pct: Number(item.taxaAtendimento.toFixed(1)),
      prioridade: item.prioridade,
      status_compras: item.status || null,
    })),
    secoes: secoes.slice(0, 12),
  };
}

function triggerApiKey(): string {
  return texto(
    process.env.TRIGGER_SECRET_KEY ||
    process.env.TRIGGER_API_KEY
  );
}

function triggerWaitMs(): number {
  const parsed = numero(process.env.COMPRAS_IA_TRIGGER_WAIT_MS);
  if (!parsed) return 22_000;
  return Math.max(5_000, Math.min(27_000, Math.trunc(parsed)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonComTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<{ status: number; ok: boolean; payload: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function gerarLeituraTrigger(params: {
  tipo: AnaliseTipo;
  pergunta: string;
  modelo: string;
  empresa: Empresa;
  flag: LoginFlag;
  inicio: string;
  fim: string;
  produtos: ProdutoAgregado[];
  secoes: SecaoAgregada[];
  metricas: Metrica[];
}): Promise<{ texto: string; modelo: string | null }> {
  const apiKey = triggerApiKey();
  if (!apiKey) throw new Error("Chave do Trigger nao configurada para Compras IA.");

  const disparo = await fetchJsonComTimeout("https://api.trigger.dev/api/v1/tasks/compras-ia-gerar-leitura/trigger", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: {
        tipo: params.tipo,
        pergunta: params.pergunta,
        modelo: params.modelo,
        empresa: params.empresa,
        flag: params.flag,
        periodo: { inicio: params.inicio, fim: params.fim },
        dados: contextoCompacto(params.produtos, params.secoes, params.metricas),
      },
    }),
  }, 8_000);
  if (!disparo.ok) {
    throw new Error(texto(disparo.payload?.error || disparo.payload?.message) || `Trigger respondeu ${disparo.status}`);
  }

  const runId = texto(disparo.payload?.id);
  if (!runId) throw new Error("Trigger nao retornou runId da Compras IA.");

  const limite = Date.now() + triggerWaitMs();
  let ultimoStatus = "UNKNOWN";
  while (Date.now() < limite) {
    await sleep(1_500);
    const consulta = await fetchJsonComTimeout(`https://api.trigger.dev/api/v3/runs/${encodeURIComponent(runId)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }, 8_000);
    if (!consulta.ok) {
      throw new Error(texto(consulta.payload?.error || consulta.payload?.message) || `Run do Trigger respondeu ${consulta.status}`);
    }

    ultimoStatus = texto(consulta.payload?.status) || ultimoStatus;
    if (ultimoStatus === "COMPLETED") {
      const textoGerado = texto(consulta.payload?.output?.texto);
      if (!textoGerado) throw new Error("Trigger concluiu sem texto da IA.");
      return {
        texto: textoGerado,
        modelo: texto(consulta.payload?.output?.model) || null,
      };
    }
    if (["FAILED", "CRASHED", "CANCELED", "INTERRUPTED", "SYSTEM_FAILURE"].includes(ultimoStatus)) {
      const tentativa = Array.isArray(consulta.payload?.attempts)
        ? consulta.payload.attempts[consulta.payload.attempts.length - 1]
        : null;
      throw new Error(texto(tentativa?.error?.message) || `Run do Trigger terminou com status ${ultimoStatus}`);
    }
  }

  throw new Error(`Run do Trigger ainda em andamento (${ultimoStatus}).`);
}

async function gerarLeituraIaGroqLegacy(
  tipo: AnaliseTipo,
  pergunta: string,
  empresa: Empresa,
  flag: LoginFlag,
  inicio: string,
  fim: string,
  produtos: ProdutoAgregado[],
  secoes: SecaoAgregada[],
  metricas: Metrica[]
): Promise<{ texto: string; origem: "groq" | OrigemLeitura; aviso?: string }> {
  const fallback = leituraFallback(tipo, produtos, secoes, metricas);
  const apiKey = process.env.GROQ_API_KEY || "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(3000, Math.min(12000, numero(process.env.COMPRAS_IA_TIMEOUT_MS) || 8000)));
  if (!apiKey) clearTimeout(timeout);
  if (!apiKey) return { texto: fallback, origem: "calculada", aviso: "GROQ_API_KEY não configurada; leitura calculada localmente." };

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
        temperature: 0.2,
        max_completion_tokens: 700,
        messages: [
          {
            role: "system",
            content: [
              "Você é um analista de compras somente leitura.",
              "Use exclusivamente os números fornecidos. Não invente estoque, venda, preço ou fornecedor.",
              "Responda em português do Brasil com 3 a 6 bullets curtos iniciados por •.",
              "Destaque risco, oportunidade e a conferência humana necessária antes de comprar.",
              "Não use markdown além dos bullets e não repita todos os dados.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({ pergunta, empresa, flag, periodo: { inicio, fim }, dados: contextoCompacto(produtos, secoes, metricas) }),
          },
        ],
      }),
    });

    const payload = await response.json().catch(() => null) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok) throw new Error(texto(payload?.error?.message) || `Groq respondeu ${response.status}`);
    const content = texto(payload?.choices?.[0]?.message?.content);
    if (!content) throw new Error("Groq retornou resposta vazia");
    return { texto: content, origem: "groq" };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : "falha desconhecida";
    console.warn("[compras-ia] leitura Groq indisponível", detalhe);
    return { texto: fallback, origem: "calculada", aviso: `IA externa indisponível; leitura calculada usada (${detalhe}).` };
  } finally {
    clearTimeout(timeout);
  }
}

async function gerarLeituraIa(
  tipo: AnaliseTipo,
  pergunta: string,
  modelo: string,
  empresa: Empresa,
  flag: LoginFlag,
  inicio: string,
  fim: string,
  produtos: ProdutoAgregado[],
  secoes: SecaoAgregada[],
  metricas: Metrica[]
): Promise<{ texto: string; origem: OrigemLeitura; modelo?: string | null; aviso?: string }> {
  const fallback = leituraFallback(tipo, produtos, secoes, metricas);
  try {
    const content = await gerarLeituraTrigger({ tipo, pergunta, modelo, empresa, flag, inicio, fim, produtos, secoes, metricas });
    return { texto: content.texto, origem: "trigger", modelo: content.modelo };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : "falha desconhecida";
    console.warn("[compras-ia] leitura Trigger indisponivel", detalhe);
    return { texto: fallback, origem: "calculada", modelo, aviso: `IA externa indisponivel; leitura calculada usada (${detalhe}).` };
  }
}

function resumoCurto(metricas: Metrica[], secoes: SecaoAgregada[]): string {
  const piorSecao = secoes[0];
  const base = `${metricas[1].valor} unidades pedidas, ${metricas[2].valor} em falta e ${metricas[3].valor} de atendimento.`;
  return piorSecao ? `${base} Maior pressão em ${piorSecao.nome}.` : base;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  configurarResposta(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Método não permitido." });

  try {
    const body = parseBody(req);
    const empresa = normalizarEmpresa(body.empresa);
    const flag = normalizarFlag(body.flag);
    const tipo = normalizarTipo(body.tipo);
    const modelo = normalizarModeloComprasIa(body.modelo);
    const periodoDias = normalizarPeriodo(body.periodoDias);
    const perguntaInformada = texto(body.pergunta);
    const pergunta = tipo === "pergunta" ? perguntaInformada : perguntaInformada || PERGUNTAS_PADRAO[tipo];
    if (tipo === "pergunta" && pergunta.length < 3) throw new HttpError(400, "Digite uma pergunta para a análise personalizada.");
    if (pergunta.length > 500) throw new HttpError(400, "Pergunta muito longa. Use até 500 caracteres.");

    const supabase = clienteSupabase();
    await validarAcesso(supabase, texto(body.actorLogin), empresa);

    const fim = hojeSaoPaulo();
    const inicio = subtrairDias(fim, periodoDias - 1);
    const avisos: string[] = [];
    const escopoEmpresas = extrairEscopoEmpresasPergunta(empresa, pergunta);
    const lojasSfCitadas = extrairLojasSfPergunta(pergunta);
    if ((empresa === "NEWSHOP" || empresa === "SEFULY") && lojasSfCitadas.length) {
      avisos.push(`Escopo travado em ${empresa}; menções a SOYE/FACIL foram ignoradas.`);
    }
    if ((empresa === "SOYE" || empresa === "FACIL") && escopoEmpresas.length > 1) {
      avisos.push("SOYE e FACIL foram lidas como lojas separadas no dashboard; enriquecimento de Compras usa a base SF.");
    }
    const [itensRows, comprasRows, secoesRows, diarioRows] = await Promise.all([
      lerItens(supabase, escopoEmpresas, flag, inicio, fim, avisos),
      lerCompras(supabase, escopoEmpresas),
      lerSecoes(supabase, escopoEmpresas, flag, inicio, fim),
      lerDiario(supabase, escopoEmpresas, flag, inicio, fim),
    ]);

    const produtosTodos = agregarProdutos(itensRows, comprasRows);
    const secoes = agregarSecoes(secoesRows);
    const diario = resumoDiario(diarioRows);
    const metricas = montarMetricas(produtosTodos, diario);
    const criterios = extrairCriteriosPergunta(pergunta);
    const visualizacao = extrairVisualizacaoPergunta(pergunta, tipo, criterios);
    const produtos = selecionarProdutos(tipo, produtosTodos, pergunta, criterios);
    const totalElegiveis = produtosTodos.filter((produto) => (
      produto.pedido > 0
      && (criterios.minimoOcorrencias === null || produto.ocorrencias >= criterios.minimoOcorrencias)
    )).length;
    const metricasRelatorio = criterios.estruturada
      ? montarMetricasRanking(produtos, totalElegiveis, criterios)
      : metricas;
    const produtosContexto = Array.from(new Map([
      ...produtos,
      ...selecionarProdutos("faltas", produtosTodos),
      ...selecionarProdutos("mais_pedidos", produtosTodos),
      ...selecionarProdutos("prioridades", produtosTodos),
    ].map((produto) => [`${produto.codigo}|${produto.sku}`, produto])).values()).slice(0, 24);
    const leitura = criterios.estruturada
      ? { texto: montarLeituraEstruturada(criterios, produtos, totalElegiveis), origem: "calculada" as const, modelo: null as string | null }
      : await gerarLeituraIa(tipo, pergunta, modelo, empresa, flag, inicio, fim, produtosContexto, secoes, metricas);
    if (leitura.aviso) avisos.push(leitura.aviso);

    return res.status(200).json({
      ok: true,
      relatorio: {
        id: `compras-${Date.now().toString(36)}`,
        titulo: criterios.estruturada ? tituloEstruturado(criterios) : TITULOS[tipo],
        pergunta,
        resumo: criterios.estruturada
          ? `${ptNumero(totalElegiveis)} itens encontrados no filtro solicitado. Resultado ordenado por ${criterios.ordenacao === "ocorrencias" ? "frequência" : "quantidade pedida"}.`
          : resumoCurto(metricas, secoes),
        leitura: leitura.texto,
        origemLeitura: leitura.origem,
        modeloLeitura: leitura.modelo ?? (leitura.origem === "trigger" ? modelo : null),
        metricas: metricasRelatorio,
        produtos: visualizacao.mostrarProdutos ? produtos : [],
        secoes: visualizacao.mostrarGrafico ? secoes.slice(0, 8) : [],
        contexto: {
          empresa,
          escopoEmpresas,
          flag,
          inicio,
          fim,
          periodoDias,
          tipo,
          criterios,
          visualizacao,
          mostrarGrafico: visualizacao.mostrarGrafico,
          mostrarProdutos: visualizacao.mostrarProdutos,
          linhasLidas: itensRows.length,
          geradoEm: new Date().toISOString(),
          somenteLeitura: true,
          avisos,
        },
      },
    });
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Falha no analista de Compras.";
    console.error("[compras-ia] erro", { statusCode, message });
    return res.status(statusCode).json({ ok: false, error: message });
  }
}
