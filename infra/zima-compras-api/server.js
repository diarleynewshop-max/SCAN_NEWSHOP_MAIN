import express from 'express';
import pg from 'pg';

const { Pool } = pg;

const PORT = Number(process.env.PORT || 3210);
const API_TOKEN = String(process.env.API_TOKEN || '').trim();
const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
const DATABASE_SSL = String(process.env.DATABASE_SSL || 'false').trim().toLowerCase() === 'true';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL nao configurada');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
});

const app = express();
app.use(express.json({ limit: '2mb' }));

const STATUS_VALUES = new Set(['todo', 'produto_bom', 'produto_ruim', 'fazer_pedido', 'concluido']);
const EMPRESA_VALUES = new Set(['NEWSHOP', 'SOYE', 'FACIL']);

function requireToken(req, res, next) {
  if (!API_TOKEN) {
    return next();
  }

  const token = String(req.header('x-api-token') || '').trim();
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: 'Token invalido' });
  }

  return next();
}

function normalizeEmpresa(value) {
  const empresa = String(value || '').trim().toUpperCase();
  return EMPRESA_VALUES.has(empresa) ? empresa : null;
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return STATUS_VALUES.has(status) ? status : null;
}

function parseTask(input) {
  const empresa = normalizeEmpresa(input?.empresa);
  const statusApp = normalizeStatus(input?.status_app);

  if (!empresa) {
    throw new Error('empresa invalida');
  }

  if (!statusApp) {
    throw new Error('status_app invalido');
  }

  const id = String(input?.id || '').trim();
  const codigo = String(input?.codigo || '').trim();
  const descricao = String(input?.descricao || '').trim();

  if (!id || !codigo || !descricao) {
    throw new Error('id, codigo e descricao sao obrigatorios');
  }

  return {
    id,
    empresa,
    codigo,
    sku: input?.sku ? String(input.sku).trim() : null,
    descricao,
    foto: input?.foto ? String(input.foto).trim() : null,
    status_app: statusApp,
    status_clickup: input?.status_clickup ? String(input.status_clickup).trim() : null,
    date_created: input?.date_created ? new Date(input.date_created) : null,
    source: input?.source ? String(input.source).trim() : 'api',
  };
}

app.get('/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get('/compras/tasks', requireToken, async (req, res) => {
  try {
    const params = [];
    const where = [];
    const empresa = normalizeEmpresa(req.query.empresa);
    const status = normalizeStatus(req.query.status);

    if (empresa) {
      params.push(empresa);
      where.push(`empresa = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`status_app = $${params.length}`);
    }

    const sql = `
      select
        id,
        empresa,
        codigo,
        sku,
        descricao,
        foto,
        status_app as status,
        status_clickup,
        date_created,
        source,
        created_at,
        updated_at
      from compras_tasks
      ${where.length > 0 ? `where ${where.join(' and ')}` : ''}
      order by updated_at desc, created_at desc
    `;

    const { rows } = await pool.query(sql, params);
    return res.json({ produtos: rows, total: rows.length });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post('/compras/tasks/upsert', requireToken, async (req, res) => {
  const rawTasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [req.body];

  if (rawTasks.length === 0) {
    return res.status(400).json({ error: 'Nenhuma task recebida' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');
    let count = 0;

    for (const rawTask of rawTasks) {
      const task = parseTask(rawTask);

      await client.query(
        `
          insert into compras_tasks (
            id,
            empresa,
            codigo,
            sku,
            descricao,
            foto,
            status_app,
            status_clickup,
            date_created,
            source
          ) values (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
          )
          on conflict (id) do update set
            empresa = excluded.empresa,
            codigo = excluded.codigo,
            sku = excluded.sku,
            descricao = excluded.descricao,
            foto = excluded.foto,
            status_app = excluded.status_app,
            status_clickup = excluded.status_clickup,
            date_created = excluded.date_created,
            source = excluded.source,
            updated_at = now()
        `,
        [
          task.id,
          task.empresa,
          task.codigo,
          task.sku,
          task.descricao,
          task.foto,
          task.status_app,
          task.status_clickup,
          task.date_created,
          task.source,
        ]
      );

      count += 1;
    }

    await client.query('commit');
    return res.json({ ok: true, upserted: count });
  } catch (error) {
    await client.query('rollback');
    return res.status(400).json({ error: String(error) });
  } finally {
    client.release();
  }
});

app.post('/compras/eventos', requireToken, async (req, res) => {
  try {
    const taskId = String(req.body?.task_id || '').trim();
    const empresa = normalizeEmpresa(req.body?.empresa);
    const acao = String(req.body?.acao || '').trim();

    if (!taskId || !empresa || !acao) {
      return res.status(400).json({ error: 'task_id, empresa e acao sao obrigatorios' });
    }

    const { rows } = await pool.query(
      `
        insert into compras_eventos (
          task_id,
          empresa,
          acao,
          status_anterior,
          status_novo,
          origem,
          payload
        ) values ($1,$2,$3,$4,$5,$6,$7)
        returning id
      `,
      [
        taskId,
        empresa,
        acao,
        req.body?.status_anterior ? String(req.body.status_anterior) : null,
        req.body?.status_novo ? String(req.body.status_novo) : null,
        req.body?.origem ? String(req.body.origem) : 'api',
        req.body?.payload ?? null,
      ]
    );

    return res.json({ ok: true, id: rows[0]?.id ?? null });
  } catch (error) {
    return res.status(400).json({ error: String(error) });
  }
});

app.patch('/compras/tasks/:id/status', requireToken, async (req, res) => {
  const taskId = String(req.params.id || '').trim();
  const empresa = normalizeEmpresa(req.body?.empresa);
  const statusNovo = normalizeStatus(req.body?.status_novo);
  const acao = String(req.body?.acao || '').trim() || 'ALTERAR_STATUS';

  if (!taskId || !empresa || !statusNovo) {
    return res.status(400).json({ error: 'id, empresa e status_novo sao obrigatorios' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const currentResult = await client.query(
      'select status_app from compras_tasks where id = $1 and empresa = $2',
      [taskId, empresa]
    );

    if (currentResult.rowCount === 0) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Task nao encontrada' });
    }

    const statusAnterior = currentResult.rows[0].status_app;

    await client.query(
      `
        update compras_tasks
        set status_app = $1,
            status_clickup = coalesce($2, status_clickup),
            updated_at = now()
        where id = $3 and empresa = $4
      `,
      [
        statusNovo,
        req.body?.status_clickup ? String(req.body.status_clickup) : null,
        taskId,
        empresa,
      ]
    );

    await client.query(
      `
        insert into compras_eventos (
          task_id,
          empresa,
          acao,
          status_anterior,
          status_novo,
          origem,
          payload
        ) values ($1,$2,$3,$4,$5,$6,$7)
      `,
      [
        taskId,
        empresa,
        acao,
        statusAnterior,
        statusNovo,
        req.body?.origem ? String(req.body.origem) : 'api',
        req.body?.payload ?? null,
      ]
    );

    await client.query('commit');
    return res.json({ ok: true, taskId, status_anterior: statusAnterior, status_novo: statusNovo });
  } catch (error) {
    await client.query('rollback');
    return res.status(400).json({ error: String(error) });
  } finally {
    client.release();
  }
});

app.listen(PORT, () => {
  console.log(`zima-compras-api online na porta ${PORT}`);
});
