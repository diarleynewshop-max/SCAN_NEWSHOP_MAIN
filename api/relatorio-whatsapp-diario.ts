import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";

type Config = {
  id: string; empresas: string[]; flag: string; secoes: string[];
  numero_whatsapp: string; ativo: boolean;
};
type EvolutionConfig = {
  base_url: string; api_key: string; instance_name: string;
};
type SecaoRow = {
  empresa: string; flag: string; data: string; secao: string;
  total: number; separado: number; nao_tem: number; parcial: number; pendente: number;
  total_pedido: number; total_real: number;
};

function ontemSaoPaulo(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function pdfBuffer(config: Config, data: string, rows: SecaoRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(20).text("Relatorio diario de conferencia", { align: "center" });
    doc.moveDown(0.4).fontSize(11).fillColor("#555").text(`Data: ${data.split("-").reverse().join("/")}`, { align: "center" });
    doc.text(`Empresas: ${config.empresas.join(", ")} | Origem: ${config.flag.toUpperCase()}`, { align: "center" });
    doc.moveDown().fillColor("#111");
    const total = rows.reduce((a, r) => a + Number(r.total || 0), 0);
    const separado = rows.reduce((a, r) => a + Number(r.separado || 0), 0);
    const faltas = rows.reduce((a, r) => a + Number(r.nao_tem || 0), 0);
    doc.fontSize(13).text(`Itens: ${total}   Separados: ${separado}   Nao tem: ${faltas}`);
    doc.moveDown();
    doc.fontSize(10).font("Helvetica-Bold")
      .text("Secao", 42, doc.y, { continued: true, width: 180 })
      .text("Total", 230, doc.y, { continued: true, width: 60 })
      .text("Separado", 300, doc.y, { continued: true, width: 70 })
      .text("Nao tem", 380, doc.y, { continued: true, width: 65 })
      .text("Parcial", 455, doc.y, { width: 60 });
    doc.moveDown(0.4).font("Helvetica");
    rows.forEach((row) => {
      if (doc.y > 750) doc.addPage();
      doc.text(`${row.empresa} - ${row.secao}`, 42, doc.y, { continued: true, width: 180 })
        .text(String(row.total), 230, doc.y, { continued: true, width: 60 })
        .text(String(row.separado), 300, doc.y, { continued: true, width: 70 })
        .text(String(row.nao_tem), 380, doc.y, { continued: true, width: 65 })
        .text(String(row.parcial), 455, doc.y, { width: 60 });
      doc.moveDown(0.25);
    });
    if (!rows.length) doc.fontSize(12).text("Sem dados para o recorte configurado.", { align: "center" });
    doc.end();
  });
}

async function enviarEvolution(
  evolution: EvolutionConfig, pdf: Buffer, numero: string, data: string,
): Promise<string> {
  const baseUrl = evolution.base_url.replace(/\/$/, "");
  if (!baseUrl || !evolution.api_key || !evolution.instance_name) {
    throw new Error("Evolution API ainda nao configurada");
  }
  const send = await fetch(`${baseUrl}/message/sendMedia/${encodeURIComponent(evolution.instance_name)}`, {
    method: "POST",
    headers: { apikey: evolution.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: numero,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: `Relatorio diario de conferencia - ${data.split("-").reverse().join("/")}`,
      media: pdf.toString("base64"),
      fileName: `relatorio_${data}.pdf`,
    }),
  });
  const result = await send.json() as any;
  if (!send.ok) throw new Error(`Evolution envio: ${result.message || result.error || send.status}`);
  return String(result.key?.id || result.messageId || "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido" });
  const secret = process.env.CRON_SECRET || "";
  const cronVercel = req.headers["x-vercel-cron"] === "1";
  const secretValido = Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
  if (!cronVercel && !secretValido) return res.status(401).json({ error: "Nao autorizado" });
  // O app usa a instancia propria definida em VITE_SUPABASE_URL. Evita uma
  // SUPABASE_URL legada da Vercel apontar a rotina para outro banco.
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return res.status(500).json({ error: "Supabase nao configurado" });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const data = ontemSaoPaulo();
  const { data: evolution, error: evolutionError } = await supabase
    .from("relatorio_whatsapp_integracao")
    .select("base_url,api_key,instance_name")
    .eq("id", true)
    .single();
  if (evolutionError || !evolution) {
    console.error("Falha ao carregar integracao Evolution", evolutionError);
    return res.status(500).json({
      error: "Evolution API nao configurada",
      codigo: evolutionError?.code || "SEM_REGISTRO",
      banco: (() => { try { return new URL(url).host; } catch { return "URL_INVALIDA"; } })(),
    });
  }
  const { data: configs, error } = await supabase.from("relatorio_whatsapp_config").select("*").eq("ativo", true);
  if (error) return res.status(500).json({ error: error.message });
  const resultados: any[] = [];
  for (const config of (configs ?? []) as Config[]) {
    try {
      const { data: jaEnviado } = await supabase.from("relatorio_whatsapp_envios")
        .select("mensagem_id").eq("config_id", config.id).eq("data_relatorio", data)
        .eq("status", "enviado").maybeSingle();
      if (jaEnviado) {
        resultados.push({ id: config.id, ok: true, ignorado: true, motivo: "ja_enviado" });
        continue;
      }
      let query = supabase.from("dashboard_por_secao").select("*").eq("data", data).in("empresa", config.empresas);
      if (config.flag !== "todos") query = query.eq("flag", config.flag);
      if (config.secoes.length) query = query.in("secao", config.secoes);
      const { data: rows, error: rowsError } = await query.order("empresa").order("secao");
      if (rowsError) throw rowsError;
      const pdf = await pdfBuffer(config, data, (rows ?? []) as SecaoRow[]);
      const messageId = await enviarEvolution(evolution as EvolutionConfig, pdf, config.numero_whatsapp, data);
      await supabase.from("relatorio_whatsapp_envios").insert({
        config_id: config.id, data_relatorio: data, numero_whatsapp: config.numero_whatsapp,
        status: "enviado", mensagem_id: messageId,
      });
      resultados.push({ id: config.id, ok: true, messageId });
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
      await supabase.from("relatorio_whatsapp_envios").insert({
        config_id: config.id, data_relatorio: data, numero_whatsapp: config.numero_whatsapp,
        status: "erro", erro: mensagem.slice(0, 1000),
      });
      resultados.push({ id: config.id, ok: false, erro: mensagem });
    }
  }
  return res.status(200).json({ data, resultados });
}
