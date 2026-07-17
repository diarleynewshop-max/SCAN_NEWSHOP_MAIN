import PDFDocument from "pdfkit";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME || "postgres",
  user: process.env.SUPABASE_DB_USER || "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  max: 2,
});

function ontemSaoPaulo() {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const data = new Date(`${hoje}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

function gerarPdf(config, data, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(20).text("Relatorio diario de conferencia", { align: "center" });
    doc.moveDown(0.4).fontSize(11).fillColor("#555")
      .text(`Data: ${data.split("-").reverse().join("/")}`, { align: "center" })
      .text(`Empresas: ${config.empresas.join(", ")} | Origem: ${config.flag.toUpperCase()}`, { align: "center" });
    doc.moveDown().fillColor("#111");
    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    const separado = rows.reduce((s, r) => s + Number(r.separado || 0), 0);
    const faltas = rows.reduce((s, r) => s + Number(r.nao_tem || 0), 0);
    doc.fontSize(13).text(`Itens: ${total}   Separados: ${separado}   Nao tem: ${faltas}`);
    doc.moveDown().fontSize(10).font("Helvetica-Bold")
      .text("Secao", 42, doc.y, { continued: true, width: 180 })
      .text("Total", 230, doc.y, { continued: true, width: 60 })
      .text("Separado", 300, doc.y, { continued: true, width: 70 })
      .text("Nao tem", 380, doc.y, { continued: true, width: 65 })
      .text("Parcial", 455, doc.y, { width: 60 });
    doc.moveDown(0.4).font("Helvetica");
    for (const row of rows) {
      if (doc.y > 750) doc.addPage();
      doc.text(`${row.empresa} - ${row.secao}`, 42, doc.y, { continued: true, width: 180 })
        .text(String(row.total), 230, doc.y, { continued: true, width: 60 })
        .text(String(row.separado), 300, doc.y, { continued: true, width: 70 })
        .text(String(row.nao_tem), 380, doc.y, { continued: true, width: 65 })
        .text(String(row.parcial), 455, doc.y, { width: 60 });
      doc.moveDown(0.25);
    }
    if (!rows.length) doc.fontSize(12).text("Sem dados para o recorte configurado.", { align: "center" });
    doc.end();
  });
}

async function enviarPdf(integracao, config, data, pdf) {
  const response = await fetch(`${integracao.base_url.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(integracao.instance_name)}`, {
    method: "POST",
    headers: { apikey: integracao.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: config.numero_whatsapp,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: `Relatorio diario de conferencia - ${data.split("-").reverse().join("/")}`,
      media: pdf.toString("base64"),
      fileName: `relatorio_${data}.pdf`,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Evolution: ${JSON.stringify(result).slice(0, 700)}`);
  return String(result.key?.id || result.messageId || "");
}

async function executar() {
  const data = ontemSaoPaulo();
  const { rows: integracoes } = await pool.query(
    "select base_url, api_key, instance_name from public.relatorio_whatsapp_integracao where id = true limit 1",
  );
  if (!integracoes[0]) throw new Error("Evolution API nao configurada");
  const { rows: configs } = await pool.query(
    "select * from public.relatorio_whatsapp_config where ativo = true order by created_at",
  );
  console.log(`[relatorio] ${data}: ${configs.length} configuracao(oes) ativa(s)`);

  for (const config of configs) {
    try {
      const enviado = await pool.query(
        "select 1 from public.relatorio_whatsapp_envios where config_id = $1 and data_relatorio = $2 and status = 'enviado' limit 1",
        [config.id, data],
      );
      if (enviado.rowCount) {
        console.log(`[relatorio] ${config.id}: ja enviado`);
        continue;
      }
      const params = [data, config.empresas];
      let sql = "select * from public.dashboard_por_secao where data = $1 and empresa = any($2::text[])";
      if (config.flag !== "todos") { params.push(config.flag); sql += ` and flag = $${params.length}`; }
      if (config.secoes?.length) { params.push(config.secoes); sql += ` and secao = any($${params.length}::text[])`; }
      sql += " order by empresa, secao";
      const { rows } = await pool.query(sql, params);
      const pdf = await gerarPdf(config, data, rows);
      const messageId = await enviarPdf(integracoes[0], config, data, pdf);
      await pool.query(
        "insert into public.relatorio_whatsapp_envios (config_id, data_relatorio, numero_whatsapp, status, mensagem_id) values ($1,$2,$3,'enviado',$4)",
        [config.id, data, config.numero_whatsapp, messageId],
      );
      console.log(`[relatorio] ${config.id}: enviado (${messageId})`);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      await pool.query(
        "insert into public.relatorio_whatsapp_envios (config_id, data_relatorio, numero_whatsapp, status, erro) values ($1,$2,$3,'erro',$4)",
        [config.id, data, config.numero_whatsapp, mensagem.slice(0, 1000)],
      );
      console.error(`[relatorio] ${config.id}: ${mensagem}`);
    }
  }
}

try {
  await executar();
} finally {
  await pool.end();
}
