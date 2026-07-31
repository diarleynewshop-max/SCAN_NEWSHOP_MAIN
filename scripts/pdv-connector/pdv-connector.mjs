#!/usr/bin/env node
/**
 * Conector de pre-venda SCAN -> SYSpdv (Casa Magalhaes).
 *
 * Roda no SERVIDOR LOCAL (retaguarda Windows). Faz polling na fila do Supabase
 * (public.pdv_prevenda_fila), transforma payload_json em RPX*.ECF, grava o
 * arquivo na pasta de importacao do SYSpdv e marca a linha como entregue.
 *
 * Por que polling e nao webhook: a retaguarda fica atras de NAT, sem IP publico.
 * O conector PUXA, entao nao precisa abrir porta nem tunel.
 *
 * ZERO DEPENDENCIAS de propósito: so precisa de Node 18+ instalado no servidor
 * (usa fetch nativo e node:fs). Nada de `npm install` na maquina do cliente.
 *
 * Uso:
 *   node pdv-connector.mjs                  # loop continuo
 *   node pdv-connector.mjs --once           # processa a fila uma vez e sai
 *   node pdv-connector.mjs --dry-run        # nao escreve arquivo nem baixa a fila
 *
 * Config: variaveis de ambiente ou arquivo .env ao lado deste script.
 * Veja .env.example.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { gerarArquivoPrevenda } from "./pdv-prevenda.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARGS = new Set(process.argv.slice(2));
const UMA_VEZ = ARGS.has("--once");
const DRY_RUN = ARGS.has("--dry-run");

// ── Config ──────────────────────────────────────────────────────────────────

// .env simples (KEY=VALUE por linha). Nao sobrescreve variaveis ja no ambiente.
function carregarEnvLocal() {
  const arquivo = path.join(AQUI, ".env");
  if (!fs.existsSync(arquivo)) return;

  for (const linha of fs.readFileSync(arquivo, "utf8").split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith("#")) continue;
    const igual = texto.indexOf("=");
    if (igual <= 0) continue;
    const chave = texto.slice(0, igual).trim();
    const valor = texto.slice(igual + 1).trim().replace(/^["']|["']$/g, "");
    if (!(chave in process.env)) process.env[chave] = valor;
  }
}

carregarEnvLocal();

const CONFIG = {
  supabaseUrl: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  // service_role: necessario para dar baixa na fila (as funcoes de baixa sao
  // restritas a esse role). NAO usar a chave anon aqui.
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  empresa: (process.env.PDV_EMPRESA || "SEFULY").toUpperCase(),
  // Pasta que o SYSpdv/retaguarda le para importar pre-venda.
  pastaDestino: process.env.PDV_PASTA_DESTINO || "",
  // Opcional: copia de auditoria de tudo que foi entregue.
  pastaArquivo: process.env.PDV_PASTA_ARQUIVO || "",
  intervaloMs: Number(process.env.PDV_INTERVALO_MS || 15000),
  lote: Number(process.env.PDV_LOTE || 5),
  // Arquivos legado do SYSpdv nao sao UTF-8. O gerador local entrega ASCII
  // puro (acentos removidos), entao latin1 e seguro e explicito.
  encoding: process.env.PDV_ENCODING || "latin1",
  host: process.env.PDV_HOST || os.hostname(),
  logFile: process.env.PDV_LOG_FILE || "",
};

// ── Log ─────────────────────────────────────────────────────────────────────

function log(nivel, mensagem, extra) {
  const linha = `${new Date().toISOString()} [${nivel}] ${mensagem}${extra ? ` ${JSON.stringify(extra)}` : ""}`;
  if (nivel === "ERRO") console.error(linha);
  else console.log(linha);

  if (CONFIG.logFile) {
    try {
      fs.appendFileSync(CONFIG.logFile, `${linha}${os.EOL}`);
    } catch {
      // Log em disco e best-effort: nunca derruba o conector.
    }
  }
}

function validarConfig() {
  const faltando = [];
  if (!CONFIG.supabaseUrl) faltando.push("SUPABASE_URL");
  if (!CONFIG.serviceRoleKey) faltando.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!CONFIG.pastaDestino) faltando.push("PDV_PASTA_DESTINO");

  if (faltando.length > 0) {
    log("ERRO", `Config incompleta. Falta: ${faltando.join(", ")}. Veja .env.example.`);
    process.exit(1);
  }

  if (!fs.existsSync(CONFIG.pastaDestino)) {
    log("ERRO", `PDV_PASTA_DESTINO nao existe: ${CONFIG.pastaDestino}`);
    process.exit(1);
  }

  if (CONFIG.pastaArquivo && !fs.existsSync(CONFIG.pastaArquivo)) {
    fs.mkdirSync(CONFIG.pastaArquivo, { recursive: true });
  }
}

// ── Supabase REST ───────────────────────────────────────────────────────────

function headers(extra = {}) {
  return {
    apikey: CONFIG.serviceRoleKey,
    Authorization: `Bearer ${CONFIG.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function buscarPendentes() {
  const query = new URLSearchParams({
    select: "id,numero_prevenda,nome_arquivo,conteudo,payload_json,total_itens,valor_total,cliente_nome,tentativas",
    empresa: `eq.${CONFIG.empresa}`,
    status: "eq.pendente",
    order: "created_at.asc",
    limit: String(CONFIG.lote),
  });

  const resposta = await fetch(`${CONFIG.supabaseUrl}/rest/v1/pdv_prevenda_fila?${query}`, {
    headers: headers(),
  });

  if (!resposta.ok) {
    throw new Error(`GET fila ${resposta.status}: ${await resposta.text().catch(() => "")}`);
  }

  return resposta.json();
}

async function rpc(nome, corpo) {
  const resposta = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    throw new Error(`RPC ${nome} ${resposta.status}: ${await resposta.text().catch(() => "")}`);
  }

  const texto = await resposta.text();
  return texto ? JSON.parse(texto) : null;
}

// ── Escrita do arquivo ──────────────────────────────────────────────────────

/**
 * Grava de forma ATOMICA: escreve num .tmp e renomeia. Sem isso o SYSpdv pode
 * ler o arquivo pela metade e importar uma pre-venda truncada.
 */
function gravarArquivoAtomico(pasta, nomeArquivo, conteudo) {
  const destino = path.join(pasta, nomeArquivo);
  const temporario = path.join(pasta, `.${nomeArquivo}.tmp`);

  fs.writeFileSync(temporario, conteudo, { encoding: CONFIG.encoding });
  fs.renameSync(temporario, destino);
  return destino;
}

function nomeDisponivel(pasta, nomeArquivo) {
  if (!fs.existsSync(path.join(pasta, nomeArquivo))) return nomeArquivo;

  // Ja existe um arquivo com esse nome que a retaguarda ainda nao consumiu.
  // Nao sobrescreve (seria perder uma pre-venda): sufixa e segue.
  const extensao = path.extname(nomeArquivo);
  const base = path.basename(nomeArquivo, extensao);
  for (let i = 1; i < 1000; i += 1) {
    const candidato = `${base}_${String(i).padStart(3, "0")}${extensao}`;
    if (!fs.existsSync(path.join(pasta, candidato))) return candidato;
  }
  throw new Error(`Nao ha nome livre para ${nomeArquivo} em ${pasta}`);
}

function normalizarPayloadJson(item) {
  if (item.payload_json && typeof item.payload_json === "object") {
    return item.payload_json.input && typeof item.payload_json.input === "object"
      ? item.payload_json.input
      : item.payload_json;
  }

  if (typeof item.payload_json === "string" && item.payload_json.trim()) {
    const parsed = JSON.parse(item.payload_json);
    return parsed.input && typeof parsed.input === "object" ? parsed.input : parsed;
  }

  return null;
}

function montarArquivoDoItem(item) {
  if (typeof item.conteudo === "string" && item.conteudo.length > 0) {
    return {
      nomeArquivo: item.nome_arquivo,
      conteudo: item.conteudo,
      totalItens: item.total_itens,
      valorTotal: item.valor_total,
      fonte: "conteudo_legado",
    };
  }

  const payload = normalizarPayloadJson(item);
  if (!payload) {
    throw new Error("fila sem payload_json nem conteudo legado");
  }

  const arquivo = gerarArquivoPrevenda({
    ...payload,
    numeroPrevenda: payload.numeroPrevenda ?? item.numero_prevenda,
  });

  return {
    nomeArquivo: item.nome_arquivo || arquivo.nomeArquivo,
    conteudo: arquivo.conteudo,
    totalItens: item.total_itens ?? arquivo.totalItens,
    valorTotal: item.valor_total ?? arquivo.valorTotal,
    fonte: "payload_json",
  };
}

async function processarItem(item) {
  const rotulo = { id: item.id, prevenda: item.numero_prevenda, arquivo: item.nome_arquivo };
  let arquivo;

  try {
    arquivo = montarArquivoDoItem(item);
  } catch (erro) {
    await rpc("pdv_prevenda_marcar_erro", {
      p_id: item.id,
      p_erro: erro.message,
      p_host: CONFIG.host,
    });
    log("ERRO", "Payload invalido, marcado como erro", rotulo);
    return false;
  }

  if (DRY_RUN) {
    log("INFO", `[dry-run] geraria ${arquivo.conteudo.length} bytes`, {
      ...rotulo,
      arquivo: arquivo.nomeArquivo,
      fonte: arquivo.fonte,
    });
    return true;
  }

  const nomeFinal = nomeDisponivel(CONFIG.pastaDestino, arquivo.nomeArquivo);
  const destino = gravarArquivoAtomico(CONFIG.pastaDestino, nomeFinal, arquivo.conteudo);

  if (CONFIG.pastaArquivo) {
    try {
      const copia = `${String(item.numero_prevenda).padStart(10, "0")}_${nomeFinal}`;
      gravarArquivoAtomico(CONFIG.pastaArquivo, copia, arquivo.conteudo);
    } catch (erro) {
      log("AVISO", `Falha na copia de auditoria: ${erro.message}`, rotulo);
    }
  }

  // Baixa na fila DEPOIS de o arquivo estar no disco. Se o processo morrer entre
  // as duas coisas, o item volta como pendente e o `nomeDisponivel` evita
  // sobrescrever o arquivo ja entregue.
  const baixou = await rpc("pdv_prevenda_marcar_entregue", { p_id: item.id, p_host: CONFIG.host });

  if (baixou === false) {
    log("AVISO", "Outro conector ja havia dado baixa nesse item", { ...rotulo, arquivo: destino });
  } else {
    log("INFO", `Entregue: ${destino} (${arquivo.totalItens} itens, R$ ${arquivo.valorTotal})`, {
      ...rotulo,
      fonte: arquivo.fonte,
      cliente: item.cliente_nome,
    });
  }

  return true;
}

async function rodarCiclo() {
  const pendentes = await buscarPendentes();
  if (pendentes.length === 0) return 0;

  log("INFO", `${pendentes.length} pre-venda(s) pendente(s) para ${CONFIG.empresa}`);

  let processados = 0;
  for (const item of pendentes) {
    try {
      if (await processarItem(item)) processados += 1;
    } catch (erro) {
      log("ERRO", `Falha ao processar ${item.id}: ${erro.message}`);
      try {
        await rpc("pdv_prevenda_marcar_erro", {
          p_id: item.id,
          p_erro: erro.message,
          p_host: CONFIG.host,
        });
      } catch (erroBaixa) {
        log("ERRO", `Falha tambem ao registrar o erro: ${erroBaixa.message}`);
      }
    }
  }

  return processados;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  validarConfig();

  log("INFO", "Conector PDV iniciado", {
    empresa: CONFIG.empresa,
    destino: CONFIG.pastaDestino,
    intervaloMs: CONFIG.intervaloMs,
    host: CONFIG.host,
    modo: UMA_VEZ ? "once" : "loop",
    dryRun: DRY_RUN,
  });

  let rodando = true;
  for (const sinal of ["SIGINT", "SIGTERM"]) {
    process.on(sinal, () => {
      log("INFO", `Recebido ${sinal}, encerrando apos o ciclo atual.`);
      rodando = false;
    });
  }

  do {
    try {
      await rodarCiclo();
    } catch (erro) {
      // Erro de rede/Supabase nao derruba o conector: tenta no proximo ciclo.
      log("ERRO", `Ciclo falhou: ${erro.message}`);
    }

    if (UMA_VEZ || !rodando) break;
    await new Promise((resolve) => setTimeout(resolve, CONFIG.intervaloMs));
  } while (rodando);

  log("INFO", "Conector PDV encerrado.");
}

main().catch((erro) => {
  log("ERRO", `Falha fatal: ${erro.stack || erro.message}`);
  process.exit(1);
});
