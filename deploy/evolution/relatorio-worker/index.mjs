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

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function parseDate(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, delta) {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + delta);
  return formatDate(date);
}

function formatDateBr(dateStr) {
  return dateStr.split("-").reverse().join("/");
}

function formatarGeradoEm() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date());
}

function formatarFlag(flag) {
  if (flag === "cd") return "CD";
  if (flag === "todos") return "Loja + CD";
  return "Loja";
}

function formatarCriterio(criterio) {
  if (criterio === "mensal") return "Mensal";
  if (criterio === "semanal") return "Semanal";
  return "Diario";
}

function drawText(doc, text, x, y, options = {}) {
  doc.text(text, x, y, options);
  return doc.y;
}

function drawKpiCard(doc, x, y, width, height, label, value, tone) {
  doc.save();
  doc.roundedRect(x, y, width, height, 12).fillAndStroke("#ffffff", "#dbe3ef");
  doc.roundedRect(x + 12, y + 12, 10, height - 24, 5).fill(tone);
  doc.fillColor("#6b7280").font("Helvetica-Bold").fontSize(9);
  doc.text(label.toUpperCase(), x + 30, y + 14, { width: width - 42 });
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(20);
  doc.text(String(value), x + 30, y + 30, { width: width - 42 });
  doc.restore();
}

function drawPageFrame(doc) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  doc.save();
  doc.lineWidth(1);
  doc.roundedRect(20, 20, pageWidth - 40, pageHeight - 40, 18).stroke("#dbe3ef");
  doc.restore();
}

function drawHeader(doc, config, periodo, geradoEm, compact = false) {
  const pageWidth = doc.page.width;
  const left = 36;
  const top = 34;
  const headerHeight = compact ? 74 : 126;

  doc.save();
  doc.roundedRect(left, top, pageWidth - 72, headerHeight, 22).fill("#0f172a");
  doc.roundedRect(left + 24, top + 22, compact ? 90 : 132, 8, 4).fill("#22c55e");
  doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(10);
  doc.text("SCAN NEWSHOP", left + 24, top + 34);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(compact ? 20 : 24);
  doc.text(periodo.titulo, left + 24, top + (compact ? 48 : 52), { width: pageWidth - 140 });
  doc.fillColor("#cbd5e1").font("Helvetica").fontSize(10);
  doc.text(`Periodo: ${periodo.descricao}`, left + 24, top + (compact ? 24 : 84));
  doc.text(`Gerado em: ${geradoEm}`, left + 24, top + (compact ? 40 : 100));

  if (!compact) {
    const chipY = top + 26;
    const chipX = pageWidth - 292;
    const chips = [
      `Empresas: ${config.empresas.join(", ")}`,
      `Origem: ${formatarFlag(config.flag)}`,
      `Criterio: ${formatarCriterio(config.criterio)}`,
    ];

    let currentY = chipY;
    for (const chip of chips) {
      doc.roundedRect(chipX, currentY, 220, 22, 11).fill("#1e293b");
      doc.fillColor("#e2e8f0").font("Helvetica-Bold").fontSize(9);
      doc.text(chip, chipX + 12, currentY + 7, { width: 196, align: "center" });
      currentY += 28;
    }
  }

  doc.restore();
  return top + headerHeight;
}

function drawTableHeader(doc, y) {
  doc.save();
  doc.roundedRect(36, y, 523, 24, 10).fill("#e2e8f0");
  doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9);
  doc.text("#", 48, y + 8, { width: 16, align: "center" });
  doc.text("Empresa", 72, y + 8, { width: 62 });
  doc.text("Secao", 142, y + 8, { width: 186 });
  doc.text("Total", 336, y + 8, { width: 44, align: "right" });
  doc.text("Separado", 388, y + 8, { width: 56, align: "right" });
  doc.text("Nao tem", 452, y + 8, { width: 50, align: "right" });
  doc.text("Parcial", 510, y + 8, { width: 40, align: "right" });
  doc.restore();
}

function drawTableRow(doc, row, index, y) {
  const total = Number(row.total || 0);
  const separado = Number(row.separado || 0);
  const naoTem = Number(row.nao_tem || 0);
  const parcial = Number(row.parcial || 0);
  const efficiency = total > 0 ? Math.round((separado / total) * 100) : 0;

  doc.save();
  doc.roundedRect(36, y, 523, 28, 10).fill(index % 2 === 0 ? "#ffffff" : "#f8fafc");
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(9);
  doc.text(String(index + 1), 48, y + 10, { width: 16, align: "center" });
  doc.fillColor("#334155").font("Helvetica-Bold").fontSize(9);
  doc.text(String(row.empresa ?? "-"), 72, y + 8, { width: 62 });
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
  doc.text(String(row.secao ?? "-"), 142, y + 7, { width: 186, ellipsis: true });
  doc.fillColor("#64748b").font("Helvetica").fontSize(8);
  doc.text(`${efficiency}% separado`, 142, y + 17, { width: 90 });

  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(10);
  doc.text(String(total), 336, y + 10, { width: 44, align: "right" });
  doc.fillColor("#166534").text(String(separado), 388, y + 10, { width: 56, align: "right" });
  doc.fillColor("#b91c1c").text(String(naoTem), 452, y + 10, { width: 50, align: "right" });
  doc.fillColor("#b45309").text(String(parcial), 510, y + 10, { width: 40, align: "right" });
  doc.restore();
}

function drawFooter(doc, config) {
  const pageHeight = doc.page.height;
  doc.save();
  doc.moveTo(36, pageHeight - 42).lineTo(doc.page.width - 36, pageHeight - 42).stroke("#dbe3ef");
  doc.fillColor("#64748b").font("Helvetica").fontSize(9);
  doc.text(`Destino configurado: ${config.numero_whatsapp}`, 36, pageHeight - 34, { width: 240 });
  doc.text("Relatorio automatico SCAN NEWSHOP", doc.page.width - 276, pageHeight - 34, {
    width: 240,
    align: "right",
  });
  doc.restore();
}

function resolverPeriodo(criterio) {
  const hoje = hojeSaoPaulo();
  const ontem = addDays(hoje, -1);
  const dateHoje = parseDate(hoje);
  const tipo = criterio === "semanal" || criterio === "mensal" ? criterio : "diario";

  if (tipo === "diario") {
    return {
      tipo,
      inicio: ontem,
      fim: ontem,
      descricao: formatDateBr(ontem),
      titulo: "Relatorio diario de conferencia",
      arquivo: `relatorio_diario_${ontem}.pdf`,
    };
  }

  if (tipo === "semanal") {
    if (dateHoje.getUTCDay() !== 1) return null;
    const inicio = addDays(ontem, -6);
    return {
      tipo,
      inicio,
      fim: ontem,
      descricao: `${formatDateBr(inicio)} a ${formatDateBr(ontem)}`,
      titulo: "Relatorio semanal de conferencia",
      arquivo: `relatorio_semanal_${inicio}_${ontem}.pdf`,
    };
  }

  if (Number(hoje.slice(8, 10)) !== 1) return null;
  const inicio = `${ontem.slice(0, 8)}01`;
  return {
    tipo,
    inicio,
    fim: ontem,
    descricao: `${formatDateBr(inicio)} a ${formatDateBr(ontem)}`,
    titulo: "Relatorio mensal de conferencia",
    arquivo: `relatorio_mensal_${inicio}_${ontem}.pdf`,
  };
}

function gerarPdf(config, periodo, rows) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
    const separado = rows.reduce((s, r) => s + Number(r.separado || 0), 0);
    const faltas = rows.reduce((s, r) => s + Number(r.nao_tem || 0), 0);
    const parcial = rows.reduce((s, r) => s + Number(r.parcial || 0), 0);
    const secoesUnicas = new Set(rows.map((row) => `${row.empresa}|${row.secao}`)).size;
    const geradoEm = formatarGeradoEm();

    drawPageFrame(doc);
    let headerBottom = drawHeader(doc, config, periodo, geradoEm, false);
    const cardY = headerBottom + 18;
    const cardWidth = 118;
    const cardGap = 12;

    drawKpiCard(doc, 36, cardY, cardWidth, 68, "Itens", total, "#2563eb");
    drawKpiCard(doc, 36 + (cardWidth + cardGap), cardY, cardWidth, 68, "Separados", separado, "#16a34a");
    drawKpiCard(doc, 36 + (cardWidth + cardGap) * 2, cardY, cardWidth, 68, "Nao tem", faltas, "#dc2626");
    drawKpiCard(doc, 36 + (cardWidth + cardGap) * 3, cardY, cardWidth, 68, "Secoes", secoesUnicas, "#d97706");

    doc.fillColor("#334155").font("Helvetica").fontSize(9);
    drawText(
      doc,
      `Parcial: ${parcial}  |  Efetividade: ${total > 0 ? Math.round((separado / total) * 100) : 0}%  |  Destino: ${config.numero_whatsapp}`,
      36,
      cardY + 82
    );

    let y = cardY + 104;
    drawTableHeader(doc, y);
    y += 34;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (y > 740) {
        drawFooter(doc, config);
        doc.addPage();
        drawPageFrame(doc);
        drawHeader(doc, config, periodo, geradoEm, true);
        y = 132;
        drawTableHeader(doc, y);
        y += 34;
      }
      drawTableRow(doc, row, index, y);
      y += 34;
    }

    if (!rows.length) {
      doc.save();
      doc.roundedRect(36, y, 523, 72, 16).fill("#f8fafc");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(14);
      doc.text("Sem dados para o recorte configurado.", 36, y + 22, {
        width: 523,
        align: "center",
      });
      doc.fillColor("#64748b").font("Helvetica").fontSize(10);
      doc.text("Assim que houver conferencia no periodo, o relatorio vira preenchido automaticamente.", 36, y + 42, {
        width: 523,
        align: "center",
      });
      doc.restore();
    }

    drawFooter(doc, config);
    doc.end();
  });
}

async function enviarPdf(integracao, config, periodo, pdf) {
  const response = await fetch(`${integracao.base_url.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(integracao.instance_name)}`, {
    method: "POST",
    headers: { apikey: integracao.api_key, "Content-Type": "application/json" },
    body: JSON.stringify({
      number: config.numero_whatsapp,
      mediatype: "document",
      mimetype: "application/pdf",
      caption: `${periodo.titulo} - ${periodo.descricao}`,
      media: pdf.toString("base64"),
      fileName: periodo.arquivo,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Evolution: ${JSON.stringify(result).slice(0, 700)}`);
  return String(result.key?.id || result.messageId || "");
}

async function executar() {
  const hoje = hojeSaoPaulo();
  const { rows: integracoes } = await pool.query(
    "select base_url, api_key, instance_name from public.relatorio_whatsapp_integracao where id = true limit 1",
  );
  if (!integracoes[0]) throw new Error("Evolution API nao configurada");
  const { rows: configs } = await pool.query(
    "select * from public.relatorio_whatsapp_config where ativo = true order by created_at",
  );
  console.log(`[relatorio] ${hoje}: ${configs.length} configuracao(oes) ativa(s)`);

  for (const config of configs) {
    const periodo = resolverPeriodo(config.criterio);
    if (!periodo) {
      console.log(`[relatorio] ${config.id}: aguardando dia de envio (${config.criterio || "diario"})`);
      continue;
    }

    try {
      const enviado = await pool.query(
        "select 1 from public.relatorio_whatsapp_envios where config_id = $1 and data_relatorio = $2 and status = 'enviado' limit 1",
        [config.id, periodo.fim],
      );
      if (enviado.rowCount) {
        console.log(`[relatorio] ${config.id}: ja enviado (${periodo.tipo})`);
        continue;
      }
      const params = [periodo.inicio, periodo.fim, config.empresas];
      let sql = "select empresa, flag, secao, sum(total) as total, sum(separado) as separado, sum(nao_tem) as nao_tem, sum(parcial) as parcial from public.dashboard_por_secao where data between $1 and $2 and empresa = any($3::text[])";
      if (config.flag !== "todos") { params.push(config.flag); sql += ` and flag = $${params.length}`; }
      if (config.secoes?.length) { params.push(config.secoes); sql += ` and secao = any($${params.length}::text[])`; }
      sql += " group by empresa, flag, secao";
      sql += " order by empresa, secao";
      const { rows } = await pool.query(sql, params);
      const pdf = await gerarPdf(config, periodo, rows);
      const messageId = await enviarPdf(integracoes[0], config, periodo, pdf);
      await pool.query(
        "insert into public.relatorio_whatsapp_envios (config_id, data_relatorio, numero_whatsapp, status, mensagem_id) values ($1,$2,$3,'enviado',$4)",
        [config.id, periodo.fim, config.numero_whatsapp, messageId],
      );
      console.log(`[relatorio] ${config.id}: enviado (${periodo.tipo}, ${messageId})`);
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      await pool.query(
        "insert into public.relatorio_whatsapp_envios (config_id, data_relatorio, numero_whatsapp, status, erro) values ($1,$2,$3,'erro',$4)",
        [config.id, periodo.fim, config.numero_whatsapp, mensagem.slice(0, 1000)],
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
