import type { PdvPrevendaCliente } from "./pdvPrevenda";

export type ClientePdv = PdvPrevendaCliente & {
  fantasia?: string | null;
  email?: string | null;
  tipoContribuinte?: TipoContribuinteCliente | null;
};

export type TipoContribuinteCliente = "ISENTO" | "NAO_CONTRIBUINTE" | "CONTRIBUINTE";

export interface BuscarClientesParams {
  empresa: string;
  search?: string;
  limit?: number;
  start?: number;
}

export interface CadastrarClienteParams {
  empresa: string;
  nome: string;
  cpfCnpj: string;
  telefone?: string;
  email?: string;
  fantasia?: string;
  tipoContribuinte?: TipoContribuinteCliente;
  inscricaoEstadual?: string;
  cep: string;
  uf: string;
  cidade: string;
  codigoIbge: string;
  endereco: string;
  numeroEndereco: string;
  bairro: string;
  complemento?: string;
}

const getConfiguredErpProxyBase = (): string =>
  ((import.meta.env.VITE_ERP_PROXY_BASE as string | undefined) || "").replace(/\/$/, "");

const getErpClientesEndpoint = (): string => {
  const configuredBase = getConfiguredErpProxyBase();
  if (configuredBase) return `${configuredBase}/erp-clientes`;
  return "/api/erp-clientes";
};

const getHeadersForEndpoint = (endpoint: string, hasBody = false): Record<string, string> => {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (hasBody) headers["Content-Type"] = "application/json";

  return headers;
};

function normalizeCliente(raw: any): ClientePdv | null {
  const codigo = String(raw?.codigo ?? raw?.id ?? "").replace(/\D/g, "");
  const cpfCnpj = String(raw?.cpfCnpj ?? raw?.numeroDoDocumento ?? "").replace(/\D/g, "");
  const nome = String(raw?.nome ?? raw?.fantasia ?? "").trim();
  const finalCodigo = codigo || cpfCnpj;

  if (!finalCodigo || !nome) return null;

  return {
    codigo: finalCodigo,
    nome,
    cpfCnpj: cpfCnpj || null,
    tipoPessoa: raw?.tipoPessoa === "J" || raw?.tipoDePessoa === "JURIDICA" || cpfCnpj.length > 11 ? "J" : "F",
    endereco: raw?.endereco ?? null,
    numeroEndereco: raw?.numeroEndereco ?? null,
    complemento: raw?.complemento ?? null,
    bairro: raw?.bairro ?? null,
    cidade: raw?.cidade ?? null,
    uf: raw?.uf ?? null,
    cep: raw?.cep ?? null,
    telefone: String(raw?.telefone ?? raw?.telefone1 ?? "").replace(/\D/g, "") || null,
    inscricaoEstadual: raw?.inscricaoEstadual ?? null,
    codigoIbge: raw?.codigoIbge ?? null,
    codigoPais: raw?.codigoPais ?? null,
    fantasia: raw?.fantasia ?? null,
    email: raw?.email ?? null,
  };
}

async function parseJsonOrError(response: Response): Promise<any> {
  const text = await response.text().catch(() => "");
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!response.ok) {
    const message = String(data?.error ?? data?.message ?? text ?? "Falha ao consultar clientes");
    throw new Error(message);
  }
  return data;
}

export async function buscarClientesVarejoFacil(params: BuscarClientesParams): Promise<ClientePdv[]> {
  const endpoint = getErpClientesEndpoint();
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("empresa", params.empresa || "NEWSHOP");
  url.searchParams.set("search", params.search ?? "");
  url.searchParams.set("limit", String(params.limit ?? 20));
  url.searchParams.set("start", String(params.start ?? 0));

  const response = await fetch(url.toString(), {
    headers: getHeadersForEndpoint(endpoint),
  });
  const data = await parseJsonOrError(response);
  return (Array.isArray(data?.items) ? data.items : []).map(normalizeCliente).filter(Boolean) as ClientePdv[];
}

export async function cadastrarClienteVarejoFacil(params: CadastrarClienteParams): Promise<ClientePdv> {
  const endpoint = getErpClientesEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: getHeadersForEndpoint(endpoint, true),
    body: JSON.stringify(params),
  });
  const data = await parseJsonOrError(response);
  const cliente = normalizeCliente(data?.cliente);
  if (!cliente) throw new Error("ERP nao retornou o cliente cadastrado.");
  return cliente;
}
