-- =====================================================================
-- API de pedidos do catalogo -> fila de conferencia
--
-- Endpoint Vercel: POST /api/catalogo-pedido
-- Guarda numero externo, cliente, payload original e preco por item.
-- O pedido entra como "analisado" para aparecer direto na Conferencia.
-- =====================================================================

alter table public.pedidos
  add column if not exists origem text,
  add column if not exists catalogo_numero_pedido text,
  add column if not exists catalogo_cliente_nome text,
  add column if not exists catalogo_payload jsonb;

alter table public.pedido_itens
  add column if not exists preco_unitario numeric(12,2);

create index if not exists pedidos_origem_idx
  on public.pedidos (origem);

create unique index if not exists pedidos_catalogo_empresa_numero_unq
  on public.pedidos (empresa, catalogo_numero_pedido)
  where origem = 'catalogo' and catalogo_numero_pedido is not null;

create or replace function public.receber_pedido_catalogo(
  p_conference_id text,
  p_empresa text,
  p_flag text,
  p_numero_pedido text,
  p_cliente_nome text,
  p_titulo text,
  p_itens jsonb,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_status text;
  v_total integer;
  v_inserted integer;
  v_created boolean := false;
  v_updated boolean := false;
  v_observacao text;
begin
  if coalesce(btrim(p_conference_id), '') = '' then
    raise exception 'conference_id obrigatorio';
  end if;

  if p_empresa not in ('NEWSHOP', 'SOYE', 'FACIL', 'SEFULY') then
    raise exception 'empresa invalida: %', p_empresa;
  end if;

  if p_flag not in ('loja', 'cd') then
    raise exception 'flag invalida: %', p_flag;
  end if;

  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'pedido sem itens';
  end if;

  v_total := jsonb_array_length(p_itens);
  v_observacao := concat_ws(
    ' | ',
    'origem=catalogo',
    'numeroPedido=' || btrim(p_numero_pedido),
    'cliente=' || btrim(p_cliente_nome),
    'conferenceId=' || btrim(p_conference_id)
  );

  select id, status
    into v_pedido_id, v_status
    from public.pedidos
   where conference_id = p_conference_id
   limit 1;

  if v_pedido_id is not null and v_status in ('em_andamento', 'concluido') then
    return jsonb_build_object(
      'pedidoId', v_pedido_id,
      'conferenceId', p_conference_id,
      'created', false,
      'updated', false,
      'bloqueado', true,
      'status', v_status
    );
  end if;

  if v_pedido_id is null then
    insert into public.pedidos (
      empresa,
      flag,
      titulo,
      pessoa,
      listeiro,
      conferente,
      status,
      total_itens,
      resumo_separado,
      resumo_nao_tem,
      resumo_parcial,
      resumo_pendente,
      observacao,
      conference_id,
      origem,
      catalogo_numero_pedido,
      catalogo_cliente_nome,
      catalogo_payload
    ) values (
      p_empresa,
      p_flag,
      nullif(btrim(p_titulo), ''),
      nullif(btrim(p_cliente_nome), ''),
      nullif(btrim(p_cliente_nome), ''),
      null,
      'analisado',
      v_total,
      0,
      0,
      0,
      v_total,
      v_observacao,
      p_conference_id,
      'catalogo',
      nullif(btrim(p_numero_pedido), ''),
      nullif(btrim(p_cliente_nome), ''),
      coalesce(p_payload, '{}'::jsonb)
    )
    returning id into v_pedido_id;

    v_created := true;
  else
    update public.pedidos
       set empresa = p_empresa,
           flag = p_flag,
           titulo = nullif(btrim(p_titulo), ''),
           pessoa = nullif(btrim(p_cliente_nome), ''),
           listeiro = nullif(btrim(p_cliente_nome), ''),
           conferente = null,
           status = 'analisado',
           total_itens = v_total,
           resumo_separado = 0,
           resumo_nao_tem = 0,
           resumo_parcial = 0,
           resumo_pendente = v_total,
           observacao = v_observacao,
           origem = 'catalogo',
           catalogo_numero_pedido = nullif(btrim(p_numero_pedido), ''),
           catalogo_cliente_nome = nullif(btrim(p_cliente_nome), ''),
           catalogo_payload = coalesce(p_payload, '{}'::jsonb)
     where id = v_pedido_id;

    delete from public.pedido_itens where pedido_id = v_pedido_id;
    v_updated := true;
  end if;

  insert into public.pedido_itens (
    pedido_id,
    codigo,
    sku,
    descricao,
    secao,
    quantidade_pedida,
    quantidade_real,
    status,
    foto_url,
    preco_unitario,
    ordem
  )
  select
    v_pedido_id,
    nullif(btrim(item->>'codigo'), ''),
    nullif(btrim(item->>'sku'), ''),
    nullif(btrim(item->>'descricao'), ''),
    nullif(btrim(item->>'secao'), ''),
    greatest(1, coalesce(nullif(item->>'quantidade_pedida', '')::integer, 1)),
    null,
    'pendente',
    nullif(btrim(item->>'foto_url'), ''),
    nullif(item->>'preco_unitario', '')::numeric(12,2),
    ord::integer
  from jsonb_array_elements(p_itens) with ordinality as itens(item, ord)
  where nullif(btrim(item->>'codigo'), '') is not null;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception 'nenhum item valido para gravar';
  end if;

  perform public.recalcular_resumo_pedido(v_pedido_id);

  perform public.upsert_produtos((
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', item->>'codigo',
      'sku', item->>'sku',
      'descricao', item->>'descricao',
      'secao', item->>'secao',
      'foto_url', item->>'foto_url'
    )), '[]'::jsonb)
    from jsonb_array_elements(p_itens) as itens(item)
  ));

  return jsonb_build_object(
    'pedidoId', v_pedido_id,
    'conferenceId', p_conference_id,
    'created', v_created,
    'updated', v_updated,
    'bloqueado', false,
    'status', 'analisado'
  );
end $$;

revoke all on function public.receber_pedido_catalogo(text, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.receber_pedido_catalogo(text, text, text, text, text, text, jsonb, jsonb)
  to service_role;
