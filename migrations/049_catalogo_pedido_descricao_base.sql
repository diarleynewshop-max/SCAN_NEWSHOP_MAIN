-- =====================================================================
-- Suporte ao catalogo SEFULY vender o mesmo produto em Dourado e Prata
--
-- O catalogo agora pode mandar, no mesmo pedido, duas linhas com o
-- MESMO codigo (uma "Produto - Dourado", outra "Produto - Prata"). Isso
-- expunha dois problemas no upsert_produtos (tabela MESTRE global de
-- produtos, compartilhada por NEWSHOP/SOYE/FACIL/SEFULY):
--
-- 1) INSERT ... ON CONFLICT DO UPDATE falha ("cannot affect row a
--    second time") quando o mesmo produto_key aparece 2x no mesmo
--    jsonb_agg -- ou seja, o pedido inteiro seria rejeitado sempre que
--    alguem pedisse os dois acabamentos do mesmo item.
-- 2) A descricao com sufixo de acabamento ("- Dourado"/"- Prata")
--    sobrescreveria a descricao canonica do produto na tabela mestre,
--    contaminando compras/dashboard de TODAS as empresas.
--
-- Fix: dedupe por produto_key antes do insert, e usar descricao_base
-- (quando enviada) so para a tabela mestre -- a descricao completa
-- (com acabamento) continua indo para pedido_itens normalmente.
-- Retrocompativel: empresas que nao mandam descricao_base continuam
-- com o comportamento identico ao de hoje.
-- =====================================================================

create or replace function public.upsert_produtos(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.produtos (produto_key, codigo, sku, descricao, secao, foto_url)
  select distinct on (produto_key)
    produto_key, codigo, sku, descricao, secao, foto_url
  from (
    select
      public.produto_key_de(x->>'codigo', x->>'sku') as produto_key,
      nullif(x->>'codigo', '') as codigo,
      nullif(x->>'sku', '') as sku,
      nullif(x->>'descricao', '') as descricao,
      nullif(x->>'secao', '') as secao,
      nullif(x->>'foto_url', '') as foto_url
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) as x
  ) itens
  where produto_key <> ''
  order by produto_key,
           (foto_url  is not null) desc,
           (descricao is not null) desc
  on conflict (produto_key) do update set
    codigo     = coalesce(public.produtos.codigo,    excluded.codigo),
    sku        = coalesce(public.produtos.sku,       excluded.sku),
    descricao  = coalesce(excluded.descricao,        public.produtos.descricao),
    secao      = coalesce(excluded.secao,            public.produtos.secao),
    foto_url   = coalesce(public.produtos.foto_url,  excluded.foto_url),
    updated_at = now();
end $$;

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

  -- Usa descricao_base (quando enviada, ex.: catalogo SEFULY com Dourado/Prata)
  -- para nao poluir a descricao canonica da tabela mestre com o sufixo de
  -- acabamento, que so faz sentido dentro deste pedido especifico.
  perform public.upsert_produtos((
    select coalesce(jsonb_agg(jsonb_build_object(
      'codigo', item->>'codigo',
      'sku', item->>'sku',
      'descricao', coalesce(nullif(item->>'descricao_base', ''), item->>'descricao'),
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
