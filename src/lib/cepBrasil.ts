export interface EnderecoCepBrasil {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoIbge: string;
  fonte: "viacep" | "brasilapi" | "opencep";
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function texto(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizarBusca(value: unknown): string {
  return texto(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function enderecoValido(endereco: EnderecoCepBrasil | null): endereco is EnderecoCepBrasil {
  return !!endereco?.cep && !!endereco.cidade && !!endereco.uf && !!endereco.codigoIbge;
}

async function consultarViaCep(cep: string): Promise<EnderecoCepBrasil | null> {
  const data = await fetchJson(`https://viacep.com.br/ws/${cep}/json/`);
  if (data?.erro) return null;

  return {
    cep,
    logradouro: texto(data?.logradouro),
    bairro: texto(data?.bairro),
    cidade: texto(data?.localidade),
    uf: texto(data?.uf).slice(0, 2).toUpperCase(),
    codigoIbge: texto(data?.ibge).replace(/\D/g, ""),
    fonte: "viacep",
  };
}

async function consultarOpenCep(cep: string): Promise<EnderecoCepBrasil | null> {
  const data = await fetchJson(`https://opencep.com/v1/${cep}.json`);
  if (data?.erro) return null;

  return {
    cep,
    logradouro: texto(data?.logradouro),
    bairro: texto(data?.bairro),
    cidade: texto(data?.localidade),
    uf: texto(data?.uf).slice(0, 2).toUpperCase(),
    codigoIbge: texto(data?.ibge).replace(/\D/g, ""),
    fonte: "opencep",
  };
}

async function buscarIbgeBrasilApi(uf: string, cidade: string): Promise<string> {
  const ufLimpa = texto(uf).slice(0, 2).toUpperCase();
  const cidadeBusca = normalizarBusca(cidade);
  if (!ufLimpa || !cidadeBusca) return "";

  const municipios = await fetchJson(`https://brasilapi.com.br/api/ibge/municipios/v1/${ufLimpa}`);
  if (!Array.isArray(municipios)) return "";

  const encontrado = municipios.find((item) => normalizarBusca(item?.nome) === cidadeBusca);
  return texto(encontrado?.codigo_ibge).replace(/\D/g, "");
}

async function consultarBrasilApi(cep: string): Promise<EnderecoCepBrasil | null> {
  const data = await fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (!data) return null;

  const uf = texto(data?.state).slice(0, 2).toUpperCase();
  const cidade = texto(data?.city);
  const codigoIbge = texto(data?.city_ibge ?? data?.ibge).replace(/\D/g, "") || (await buscarIbgeBrasilApi(uf, cidade));

  return {
    cep,
    logradouro: texto(data?.street),
    bairro: texto(data?.neighborhood),
    cidade,
    uf,
    codigoIbge,
    fonte: "brasilapi",
  };
}

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoCepBrasil | null> {
  const digits = onlyDigits(cep);
  if (digits.length !== 8) return null;

  const viaCep = await consultarViaCep(digits).then((endereco) => {
    if (enderecoValido(endereco)) return endereco;
    return null;
  });
  if (viaCep) return viaCep;

  const brasilApi = await consultarBrasilApi(digits);
  if (enderecoValido(brasilApi)) return brasilApi;

  const openCep = await consultarOpenCep(digits);
  if (enderecoValido(openCep)) return openCep;

  return brasilApi?.cidade || brasilApi?.uf || brasilApi?.logradouro ? brasilApi : null;
}
