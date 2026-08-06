#!/usr/bin/env node
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import * as cheerio from "cheerio";

const DEFAULT_EMPRESA = "NEWSHOP";
const TRIGGER_TASK_ID = "erp-foto-sync";
const TRIGGER_ENDPOINT = `https://api.trigger.dev/api/v1/tasks/${TRIGGER_TASK_ID}/trigger`;
const CATALOGO_ITEM_ERP_ENDPOINT = "https://scan-newshop-main.vercel.app/api/catalogo-item-erp";

function parseArgs(argv) {
  const args = {
    apply: false,
    empresa: DEFAULT_EMPRESA,
    batchSize: 1,
    inputs: [],
  };

  for (const item of argv) {
    if (item === "--apply") {
      args.apply = true;
      continue;
    }
    if (item.startsWith("--empresa=")) {
      args.empresa = item.slice("--empresa=".length).trim().toUpperCase() || DEFAULT_EMPRESA;
      continue;
    }
    if (item.startsWith("--batch=")) {
      const parsed = Number(item.slice("--batch=".length));
      if (Number.isFinite(parsed) && parsed > 0) args.batchSize = Math.trunc(parsed);
      continue;
    }
    if (item.startsWith("--")) continue;
    args.inputs.push(item);
  }

  return args;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isNumericLike(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

async function loadEnvFileIfPresent() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    try {
      const content = await readFile(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        if (!(key in process.env) && value) process.env[key] = value;
      }
    } catch {
      // ignore missing env files
    }
  }
}

async function collectHtmlFiles(inputs) {
  const resolved = inputs.length > 0 ? inputs : [
    "C:\\Users\\diarl\\Downloads\\lista\\lista_Jessica 3.html",
    "C:\\Users\\diarl\\Downloads\\lista\\boo.html",
    "C:\\Users\\diarl\\Downloads\\lista\\o.html",
    "C:\\Users\\diarl\\Downloads\\lista\\lista_Jessica 2.html",
    "C:\\Users\\diarl\\Downloads\\lista\\lista_Gabi.html",
  ];

  const files = [];

  for (const entry of resolved) {
    const fullPath = path.resolve(entry);
    let stats;
    try {
      stats = await stat(fullPath);
    } catch {
      throw new Error(`Nao encontrei o arquivo ou pasta: ${fullPath}`);
    }

    if (stats.isDirectory()) {
      const items = await readdir(fullPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile() && item.name.toLowerCase().endsWith(".html")) {
          files.push(path.join(fullPath, item.name));
        }
      }
      continue;
    }

    if (fullPath.toLowerCase().endsWith(".html")) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractCards(html, sourceFile) {
  const $ = cheerio.load(html);
  const cards = [];

  $("button.card").each((_, el) => {
    const button = $(el);
    const codigo = String(button.attr("data-code") ?? "").trim();
    const imgSrc = String(button.find("img").first().attr("src") ?? "").trim();

    if (!codigo) return;
    if (!imgSrc.startsWith("data:image/") || !imgSrc.includes(";base64,")) {
      throw new Error(`Card ${codigo} em ${sourceFile} nao trouxe imagem base64 valida.`);
    }

    cards.push({
      erpProdutoId: codigo,
      barcode: codigo,
      photoBase64: imgSrc,
    });
  });

  const title = String($("title").first().text() ?? "").trim();
  const header = String($("header h1").first().text() ?? "").trim();
  const info = String($("header p").first().text() ?? "").trim();

  return { cards, title, header, info };
}

async function resolveProdutoIdPorDescricao(term, empresa) {
  const search = String(term ?? "").trim();
  if (!search) return null;
  if (isNumericLike(search)) return search;
  const compact = search.replace(/\s+/g, "");
  if (compact.length < 3 && !/\d/.test(compact)) return null;

  const response = await fetch(CATALOGO_ITEM_ERP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      search,
      limit: 10,
      loja: empresa,
      erpBaseOverride: empresa,
      exact: false,
      lightweight: true,
      includeIdentifiers: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao resolver "${search}" no catalogo: ${response.status} ${body.slice(0, 200)}`);
  }

  const data = await response.json().catch(() => null);
  const items = Array.isArray(data?.items) ? data.items : data?.item ? [data.item] : [];
  if (items.length === 0) return null;

  const normalized = normalizeText(search);
  const preferido =
    items.find((item) => normalizeText(item?.descricao) === normalized) ||
    items.find((item) => normalizeText(item?.sku) === normalized) ||
    items.find((item) => normalizeText(item?.ean) === normalized) ||
    items.find((item) => normalizeText(item?.descricao).includes(normalized)) ||
    items.find((item) => normalizeText(item?.sku).includes(normalized)) ||
    items[0];

  const produtoId = preferido?.produtoId ?? preferido?.id ?? null;
  if (produtoId == null) return null;
  return String(produtoId).trim();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

async function triggerBatch(empresa, items) {
  const apiKey = String(process.env.VITE_TRIGGER_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("VITE_TRIGGER_API_KEY nao configurada. Rode em dry-run ou configure a chave para aplicar.");
  }

  const response = await fetch(TRIGGER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      payload: {
        empresa,
        itens: items,
      },
    }),
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Trigger.dev respondeu ${response.status}: ${text || "sem detalhe"}`);
  }

  return text;
}

async function main() {
  await loadEnvFileIfPresent();

  const args = parseArgs(process.argv.slice(2));
  const files = await collectHtmlFiles(args.inputs);

  if (files.length === 0) {
    console.log("Nenhum HTML encontrado.");
    return;
  }

  let totalCards = 0;
  const parsed = [];

  for (const file of files) {
    const html = await readFile(file, "utf8");
    const { cards, title, header, info } = extractCards(html, file);
    totalCards += cards.length;
    parsed.push({ file, title, header, info, cards });

    console.log(`Arquivo: ${path.basename(file)}`);
    console.log(`  titulo: ${title || "(sem titulo)"}`);
    console.log(`  grupo : ${header || "(sem h1)"}`);
    console.log(`  info  : ${info || "(sem info)"}`);
    console.log(`  itens : ${cards.length}`);
    console.log(`  codigos: ${cards.slice(0, 5).map((c) => c.erpProdutoId).join(", ")}`);
  }

  console.log(`Total de fotos encontradas: ${totalCards}`);

  if (!args.apply) {
    console.log("Dry-run concluido. Use --apply para disparar a subida no ERP.");
    return;
  }

  const batches = parsed.flatMap((entry) =>
    chunk(entry.cards, args.batchSize).map((items, index) => ({
      source: entry.file,
      batchIndex: index + 1,
      totalBatches: Math.ceil(entry.cards.length / args.batchSize),
      items,
    }))
  );

  if (batches.length === 0) {
    console.log("Nada para enviar.");
    return;
  }

  console.log(`Disparando ${batches.length} lote(s) para ${args.empresa} via ${TRIGGER_TASK_ID}...`);

  let sucesso = 0;
  let falha = 0;
  for (const batch of batches) {
    const resolvedItems = [];
    const mappings = [];
    for (const item of batch.items) {
      const produtoId = await resolveProdutoIdPorDescricao(item.erpProdutoId, args.empresa);
      if (!produtoId) {
        falha += 1;
        console.warn(`SKIP [${path.basename(batch.source)} ${batch.batchIndex}/${batch.totalBatches}] ${item.erpProdutoId} nao foi resolvido.`);
        continue;
      }
      mappings.push(`${item.erpProdutoId}=>${produtoId}`);
      resolvedItems.push({
        erpProdutoId: produtoId,
        photoBase64: item.photoBase64,
        barcode: item.barcode,
      });
    }

    if (resolvedItems.length === 0) {
      continue;
    }

    try {
      await triggerBatch(args.empresa, resolvedItems);
      sucesso += resolvedItems.length;
      console.log(`OK  [${path.basename(batch.source)} ${batch.batchIndex}/${batch.totalBatches}] ${mappings.join(", ")}`);
    } catch (error) {
      falha += resolvedItems.length;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`ERRO [${path.basename(batch.source)} ${batch.batchIndex}/${batch.totalBatches}] ${codes}`);
      console.error(`      ${msg}`);
    }
  }

  console.log(`Resumo: ${sucesso} OK, ${falha} falha(s).`);
}

main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(msg);
  process.exitCode = 1;
});
