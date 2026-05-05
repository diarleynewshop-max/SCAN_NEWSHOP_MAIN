export type VarejoFacilEmpresa = "NEWSHOP" | "FACIL" | "SOYE";
export type VarejoFacilFlag = "loja" | "cd";

export interface VarejoFacilLookupContext {
  empresa?: string | null;
  flag?: VarejoFacilFlag | string | null;
}

export interface VarejoFacilProduct {
  id: string;
  codigo_barras: string;
  descricao: string;
  preco: number;
  precoVarejo: number;
  precoAtacado: number;
  estoque: number;
  secao?: string;
  imagem?: string;
  hasErpImage?: boolean;
}

export interface ConsultaPrecoVarejoFacilProduto {
  id: string;
  codigo_barras: string;
  descricao: string;
  precoVarejo: number;
  precoAtacado: number;
  secao?: string;
  grupo?: string;
}

type ErpProduto = {
  id: number;
  descricao?: string;
  codigoInterno?: string;
  unidadeDeVenda?: string;
  imagem?: string;
  imagemUrl?: string;
  urlImagem?: string;
  foto?: string;
  fotoUrl?: string;
  meta?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  metadados?: Record<string, unknown>;
  imagens?: Array<string | { url?: string; imagem?: string; src?: string }>;
};

type ErpPreco = {
  lojaId?: number;
  precoVenda1?: number;
  precoOferta1?: number;
  precoVenda2?: number;
  precoOferta2?: number;
};

type ErpCodigoAuxiliar = {
  id?: string;
  produtoId?: number;
  tipo?: string;
};

type ErpResumoEstoque = {
  lojaId?: number;
  saldo?: number;
};

type ErpSecao = {
  id?: number;
  descricao?: string;
};

type ErpGrupo = {
  id?: number;
  descricao?: string;
};

type ErpListResponse<T> = {
  items?: T[];
};

const VAREJO_FACIL_HOSTS: Record<VarejoFacilEmpresa, string> = {
  NEWSHOP: "newshop.varejofacil.com",
  FACIL: "facil.varejofacil.com",
  SOYE: "soye.varejofacil.com",
};

const ERP_LOJA_BY_EMPRESA: Record<VarejoFacilEmpresa, number> = {
  FACIL: 1,
  NEWSHOP: 2,
  SOYE: 1,
};

let cachedAccessToken: string | null = null;
let cachedAuthKey: string | null = null;
let tokenPromise: Promise<string> | null = null;

const secaoCache = new Map<number, string>();
const grupoCache = new Map<string, string>();

const normalizarEmpresaVarejoFacil = (empresa?: string | null): VarejoFacilEmpresa => {
  const normalizada = (empresa ?? "").toUpperCase();

  if (normalizada.includes("SOYE")) return "SOYE";
  if (normalizada.includes("FACIL")) return "FACIL";
  return "NEWSHOP";
};

const resolveErpApiBase = (contexto: VarejoFacilLookupContext = {}) => {
  if (import.meta.env.DEV) {
    return "/erp-api/api";
  }

  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  const configuredUrl = (
    import.meta.env[`VITE_ERP_API_URL_${empresa}`] ||
    import.meta.env.VITE_ERP_API_URL ||
    `https://${VAREJO_FACIL_HOSTS[empresa]}`
  ).replace(/\/$/, "");

  return configuredUrl.endsWith("/api") ? configuredUrl : `${configuredUrl}/api`;
};

const getEnvByEmpresa = (empresa: VarejoFacilEmpresa, key: "USERNAME" | "PASSWORD" | "TOKEN") =>
  import.meta.env[`VITE_ERP_API_${key}_${empresa}`] || import.meta.env[`VITE_ERP_API_${key}`] || "";

const resolveTokenFromAuth = (data: Record<string, unknown>) =>
  (typeof data.accessToken === "string" && data.accessToken) ||
  (typeof data.access_token === "string" && data.access_token) ||
  (typeof data.token === "string" && data.token) ||
  (typeof data.jwt === "string" && data.jwt) ||
  "";

const getErpAccessToken = async (contexto: VarejoFacilLookupContext = {}) => {
  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  const baseUrl = resolveErpApiBase(contexto);
  const username = getEnvByEmpresa(empresa, "USERNAME");
  const password = getEnvByEmpresa(empresa, "PASSWORD");
  const configuredToken = getEnvByEmpresa(empresa, "TOKEN");
  const authKey = `${empresa}:${baseUrl}:${username}`;

  if (cachedAccessToken && cachedAuthKey === authKey) return cachedAccessToken;

  if (username && password) {
    if (!tokenPromise) {
      tokenPromise = (async () => {
        const response = await fetch(`${baseUrl}/auth`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ username, password }),
        });

        if (!response.ok) {
          throw new Error("Nao foi possivel autenticar no ERP. Verifique usuario e senha.");
        }

        const data = (await response.json()) as Record<string, unknown>;
        const token = resolveTokenFromAuth(data);

        if (!token) {
          throw new Error("O ERP nao retornou um access token valido no login.");
        }

        cachedAccessToken = token;
        cachedAuthKey = authKey;
        return token;
      })().finally(() => {
        tokenPromise = null;
      });
    }

    return tokenPromise;
  }

  if (configuredToken) {
    cachedAccessToken = configuredToken;
    cachedAuthKey = authKey;
    return configuredToken;
  }

  throw new Error("Credenciais do ERP nao configuradas. Defina VITE_ERP_API_USERNAME e VITE_ERP_API_PASSWORD.");
};

const buildHeaders = async (contexto: VarejoFacilLookupContext = {}) => {
  const token = await getErpAccessToken(contexto);
  return {
    Authorization: token,
    Accept: "application/json",
  };
};

const fetchJson = async <T>(path: string, contexto: VarejoFacilLookupContext = {}) => {
  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  const url = import.meta.env.DEV
    ? `${resolveErpApiBase(contexto)}${path}`
    : `/api/erp-proxy?empresa=${empresa.toLowerCase()}&path=${encodeURIComponent(path)}`;

  const response = await fetch(url, {
    headers: import.meta.env.DEV ? await buildHeaders(contexto) : { Accept: "application/json" },
  });

  if (response.status === 401) {
    cachedAccessToken = null;
    cachedAuthKey = null;
    throw new Error("ERP nao autorizado. Verifique as credenciais configuradas.");
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`Falha ao consultar ERP (${response.status}).`);
  }

  return (await response.json()) as T;
};

const normalizarPreco = (precoVenda?: number, precoOferta?: number) => {
  if (typeof precoOferta === "number" && precoOferta > 0) return precoOferta;
  return precoVenda || 0;
};

const normalizarEans = (codigo: string) => {
  const limpo = codigo.replace(/\s+/g, "");
  const candidatos = [limpo];

  if (/^\d{13}$/.test(limpo)) candidatos.push(`0${limpo}`);
  if (/^0\d{13}$/.test(limpo)) candidatos.push(limpo.slice(1));

  return [...new Set(candidatos.filter(Boolean))];
};

const getErpLojaAtiva = (contexto: VarejoFacilLookupContext = {}) => {
  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  return ERP_LOJA_BY_EMPRESA[empresa] || 1;
};

const buscarCodigoAuxiliarPorEan = async (ean: string, contexto: VarejoFacilLookupContext = {}) => {
  for (const candidato of normalizarEans(ean)) {
    try {
      const fiql = encodeURIComponent(`id==${candidato}`);
      const data = await fetchJson<ErpListResponse<ErpCodigoAuxiliar>>(`/v1/produto/codigos-auxiliares?q=${fiql}&count=5`, contexto);
      const codigoAuxiliar = (data?.items || []).find((item) => item?.produtoId && item?.tipo === "EAN") || (data?.items || [])[0];

      if (codigoAuxiliar?.produtoId) {
        console.info("[VarejoFacil][EAN] Codigo auxiliar encontrado", {
          eanOriginal: ean,
          eanConsultado: candidato,
          produtoId: codigoAuxiliar.produtoId,
        });
        return {
          codigoAuxiliar,
          eanEncontrado: codigoAuxiliar.id || candidato,
        };
      }
    } catch (err) {
      console.warn("[VarejoFacil][EAN] Falha ao consultar candidato", {
        eanOriginal: ean,
        eanConsultado: candidato,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return null;
};

const buscarEstoquePorProduto = async (produtoId: number, contexto: VarejoFacilLookupContext = {}) => {
  const fiql = encodeURIComponent(`produtoId==${produtoId}`);
  const data = await fetchJson<ErpListResponse<ErpResumoEstoque>>(`/v1/estoque/saldos?q=${fiql}&count=100`, contexto);
  const lojaId = getErpLojaAtiva(contexto);
  const itens = data?.items || [];
  const itensDaLoja = itens.filter((item) => item.lojaId === lojaId);
  const base = itensDaLoja.length > 0 ? itensDaLoja : itens;
  return base.reduce((total, item) => total + Number(item?.saldo || 0), 0);
};

const selecionarPrecoDaLoja = (precos: ErpPreco[] | null, contexto: VarejoFacilLookupContext = {}) => {
  if (!precos || precos.length === 0) return null;

  const lojaId = getErpLojaAtiva(contexto);
  return precos.find((preco) => preco.lojaId === lojaId) || precos[0];
};

const buscarSecao = async (secaoId?: number, contexto: VarejoFacilLookupContext = {}) => {
  if (!secaoId) return "";
  if (secaoCache.has(secaoId)) return secaoCache.get(secaoId)!;

  let descricao = `Secao ${secaoId}`;
  try {
    const data = await fetchJson<ErpSecao>(`/v1/produto/secoes/${secaoId}`, contexto);
    descricao = data?.descricao || descricao;
  } catch {
    // Mantem a consulta de preco funcionando mesmo se o mercadologico falhar.
  }

  secaoCache.set(secaoId, descricao);
  return descricao;
};

const buscarGrupo = async (secaoId?: number, grupoId?: number, contexto: VarejoFacilLookupContext = {}) => {
  if (!secaoId || !grupoId) return "";

  const key = `${secaoId}:${grupoId}`;
  if (grupoCache.has(key)) return grupoCache.get(key)!;

  let descricao = `Grupo ${grupoId}`;
  try {
    const data = await fetchJson<ErpGrupo>(`/v1/produto/secoes/${secaoId}/grupos/${grupoId}`, contexto);
    descricao = data?.descricao || descricao;
  } catch {
    // Mantem a consulta de preco funcionando mesmo se o mercadologico falhar.
  }

  grupoCache.set(key, descricao);
  return descricao;
};

const extrairImagemProduto = (produto: ErpProduto): string | undefined => {
  const imagemDaLista = produto.imagens?.find(Boolean);

  if (typeof imagemDaLista === "string") return imagemDaLista;
  if (imagemDaLista?.url) return imagemDaLista.url;
  if (imagemDaLista?.imagem) return imagemDaLista.imagem;
  if (imagemDaLista?.src) return imagemDaLista.src;

  const metas = [produto.meta, produto.metadata, produto.metadados].filter(Boolean) as Record<string, unknown>[];
  const imagemMeta = metas
    .flatMap((meta) => [
      meta.imagem,
      meta.imagemUrl,
      meta.urlImagem,
      meta.foto,
      meta.fotoUrl,
      meta.image,
      meta.imageUrl,
      meta.url,
    ])
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);

  return produto.imagem || produto.imagemUrl || produto.urlImagem || produto.foto || produto.fotoUrl || imagemMeta || undefined;
};

const resolverImagemProduto = (imagem: string | undefined, produtoId: number, contexto: VarejoFacilLookupContext = {}) => {
  const empresa = normalizarEmpresaVarejoFacil(contexto.empresa);
  const imagemOuProduto = imagem || String(produtoId);

  if (/^data:image\//i.test(imagemOuProduto)) return imagemOuProduto;

  if (import.meta.env.DEV) {
    if (/^https?:\/\//i.test(imagemOuProduto)) return imagemOuProduto;
    return `${resolveErpApiBase(contexto).replace(/\/api$/, "")}${imagemOuProduto.startsWith("/") ? imagemOuProduto : `/${imagemOuProduto}`}`;
  }

  return `/api/erp-image-proxy?empresa=${empresa.toLowerCase()}&produtoId=${produtoId}&src=${encodeURIComponent(imagemOuProduto)}`;
};

const isReferenciaImagemErpValida = (imagem: string | undefined): boolean =>
  Boolean(imagem && !/^data:image\//i.test(imagem));

export const buscarProdutoVarejoFacil = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => {
  const codigo = codigoBarras.trim();
  if (!codigo) return null;

  const codigoAuxiliarEncontrado = await buscarCodigoAuxiliarPorEan(codigo, contexto);
  let produto: ErpProduto | null = null;
  let eanResolvido = codigo;

  if (codigoAuxiliarEncontrado?.codigoAuxiliar.produtoId) {
    produto = await fetchJson<ErpProduto>(`/v1/produto/produtos/${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`, contexto);
    eanResolvido = codigoAuxiliarEncontrado.eanEncontrado;
  }

  if (!produto) {
    produto = await fetchJson<ErpProduto>(`/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`, contexto);
  }

  if (!produto?.id) return null;

  const [precosResult, estoqueResult, secaoResult] = await Promise.allSettled([
    fetchJson<ErpPreco[]>(`/v1/produto/produtos/${produto.id}/precos`, contexto),
    buscarEstoquePorProduto(produto.id, contexto),
    buscarSecao(produto.secaoId, contexto),
  ]);
  const precos = precosResult.status === "fulfilled" ? precosResult.value : null;
  const estoque = estoqueResult.status === "fulfilled" ? estoqueResult.value : 0;
  const secao = secaoResult.status === "fulfilled" ? secaoResult.value : "";

  if (precosResult.status === "rejected") {
    console.warn("[VarejoFacil][Produto] Preco nao carregado", {
      codigo,
      produtoId: produto.id,
      erro: precosResult.reason instanceof Error ? precosResult.reason.message : String(precosResult.reason),
    });
  }
  if (estoqueResult.status === "rejected") {
    console.warn("[VarejoFacil][Produto] Estoque nao carregado", {
      codigo,
      produtoId: produto.id,
      erro: estoqueResult.reason instanceof Error ? estoqueResult.reason.message : String(estoqueResult.reason),
    });
  }
  if (secaoResult.status === "rejected") {
    console.warn("[VarejoFacil][Produto] Secao nao carregada", {
      codigo,
      produtoId: produto.id,
      erro: secaoResult.reason instanceof Error ? secaoResult.reason.message : String(secaoResult.reason),
    });
  }

  const precoSelecionado = selecionarPrecoDaLoja(precos, contexto);
  const precoVarejo = normalizarPreco(precoSelecionado?.precoVenda1, precoSelecionado?.precoOferta1);
  const precoAtacado = normalizarPreco(precoSelecionado?.precoVenda2, precoSelecionado?.precoOferta2);
  const imagemOriginal = extrairImagemProduto(produto);
  const hasErpImage = isReferenciaImagemErpValida(imagemOriginal);
  const imagem = resolverImagemProduto(imagemOriginal, produto.id, contexto);

  console.info("[VarejoFacil][Produto] Produto resolvido", {
    codigo,
    eanResolvido,
    produtoId: produto.id,
    descricao: produto.descricao || produto.codigoInterno || "",
    imagem,
  });

  return {
    id: String(produto.id),
    codigo_barras: eanResolvido,
    descricao: produto.descricao || produto.codigoInterno || "",
    preco: precoVarejo,
    precoVarejo,
    precoAtacado,
    estoque,
    secao: secao || undefined,
    imagem,
    hasErpImage,
  };
};

export const consultarPrecoProdutoVarejoFacil = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {},
  incluirMercadologico = false
): Promise<ConsultaPrecoVarejoFacilProduto | null> => {
  const codigo = codigoBarras.trim();
  if (!codigo) return null;

  const codigoAuxiliarEncontrado = await buscarCodigoAuxiliarPorEan(codigo, contexto);
  let produto: ErpProduto | null = null;
  let eanResolvido = codigo;

  if (codigoAuxiliarEncontrado?.codigoAuxiliar.produtoId) {
    produto = await fetchJson<ErpProduto>(`/v1/produto/produtos/${codigoAuxiliarEncontrado.codigoAuxiliar.produtoId}`, contexto);
    eanResolvido = codigoAuxiliarEncontrado.eanEncontrado;
  }

  if (!produto) {
    produto = await fetchJson<ErpProduto>(`/v1/produto/produtos/consulta/${encodeURIComponent(codigo)}`, contexto);
  }

  if (!produto?.id) return null;

  const [precos, secao, grupo] = await Promise.all([
    fetchJson<ErpPreco[]>(`/v1/produto/produtos/${produto.id}/precos`, contexto),
    incluirMercadologico ? buscarSecao(produto.secaoId, contexto) : Promise.resolve(""),
    incluirMercadologico ? buscarGrupo(produto.secaoId, produto.grupoId, contexto) : Promise.resolve(""),
  ]);
  const precoSelecionado = selecionarPrecoDaLoja(precos, contexto);

  return {
    id: String(produto.id),
    codigo_barras: eanResolvido,
    descricao: produto.descricao || produto.codigoInterno || "Produto sem descricao",
    precoVarejo: normalizarPreco(precoSelecionado?.precoVenda1, precoSelecionado?.precoOferta1),
    precoAtacado: normalizarPreco(precoSelecionado?.precoVenda2, precoSelecionado?.precoOferta2),
    secao: secao || undefined,
    grupo: grupo || undefined,
  };
};

export const sincronizarProduto = async (
  codigoBarras: string,
  contexto: VarejoFacilLookupContext = {}
): Promise<VarejoFacilProduct | null> => buscarProdutoVarejoFacil(codigoBarras, contexto);
