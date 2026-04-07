# Configuração do Supabase para Analytics

## 📋 **Etapa 1: Criar as Tabelas no Supabase**

### Método A: Via SQL (Recomendado)
1. Acesse o **Supabase Dashboard** do seu projeto
2. Vá para **SQL Editor**
3. Copie e execute todo o conteúdo do arquivo:
   ```
   migrations/001_create_analytics_tables.sql
   ```

### Método B: Via Interface
1. Acesse **Table Editor**
2. Crie as tabelas manualmente com as seguintes colunas:

**Tabela: `lista_baixada_logs`**
- `id` (UUID, primary key, default: `gen_random_uuid()`)
- `created_at` (timestamp, default: `now()`)
- `flag` (text, NOT NULL, check: `flag IN ('loja')`)
- `empresa` (text, NOT NULL, check: `empresa IN ('NEWSHOP', 'SOYE', 'FACIL')`)
- `pessoa` (text, NOT NULL)
- `titulo` (text, NOT NULL)
- `total_itens` (integer, NOT NULL, check: `>= 0`)
- `data_criacao` (timestamp, NOT NULL)
- `data_download` (timestamp, NOT NULL)
- `clickup_task_id` (text)
- `clickup_compras_task_id` (text)
- `processing_time_ms` (integer)
- `status` (text, NOT NULL, default: `'pending'`, check: `status IN ('pending', 'success', 'error')`)
- `error_message` (text)
- `produtos_count` (integer, NOT NULL, default: `0`)
- `produtos_sem_estoque_count` (integer, NOT NULL, default: `0`)
- `fotos_count` (integer, NOT NULL, default: `0`)
- `payload_json` (jsonb, NOT NULL)

**Tabela: `conferencia_baixada_logs`**
- `id` (UUID, primary key, default: `gen_random_uuid()`)
- `created_at` (timestamp, default: `now()`)
- `conferente` (text, NOT NULL)
- `tempo` (text, NOT NULL)
- `tempo_segundos` (integer)
- `total_itens` (integer, NOT NULL, check: `>= 0`)
- `empresa` (text, NOT NULL, check: `empresa IN ('NEWSHOP', 'SOYE', 'FACIL')`)
- `flag` (text, NOT NULL, check: `flag IN ('loja')`)
- `conference_id` (text, NOT NULL)
- `data_conferencia` (timestamp, NOT NULL)
- `resumo_separado` (integer, NOT NULL, default: `0`)
- `resumo_nao_tem` (integer, NOT NULL, default: `0`)
- `resumo_parcial` (integer, NOT NULL, default: `0`)
- `resumo_pendente` (integer, NOT NULL, default: `0`)
- `clickup_task_id` (text)
- `clickup_compras_task_id` (text)
- `processing_time_ms` (integer)
- `status` (text, NOT NULL, default: `'pending'`, check: `status IN ('pending', 'success', 'error')`)
- `error_message` (text)
- `itens_faltantes_count` (integer, NOT NULL, default: `0`)
- `fotos_faltantes_count` (integer, NOT NULL, default: `0`)
- `digito_s_count` (integer, NOT NULL, default: `0`)
- `digito_m_count` (integer, NOT NULL, default: `0`)
- `itens_separados_count` (integer, NOT NULL, default: `0`)
- `payload_json` (jsonb, NOT NULL)

**Tabela: `conferencia_itens`**
- `id` (UUID, primary key, default: `gen_random_uuid()`)
- `created_at` (timestamp, default: `now()`)
- `conferencia_log_id` (UUID, NOT NULL, foreign key to `conferencia_baixada_logs.id`)
- `codigo` (text, NOT NULL)
- `sku` (text)
- `quantidade_pedida` (integer, NOT NULL, check: `>= 0`)
- `quantidade_real` (integer)
- `status` (text, NOT NULL, check: `status IN ('separado', 'nao_tem', 'nao_tem_tudo', 'pendente')`)
- `digito` (text, check: `digito IN ('S', 'M')`)
- `tem_foto` (boolean, NOT NULL, default: `false`)
- `diferenca_quantidade` (integer)

## 🔧 **Etapa 2: Configurar Variáveis de Ambiente no Trigger.dev**

Para que os triggers salvem dados no Supabase, configure as seguintes variáveis de ambiente no **Trigger.dev**:

### Para produção (NEWSHOP):
```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-de-servico
```

### Para desenvolvimento (SOYE/FACIL):
```
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-de-servico
```

**Nota:** Use `SUPABASE_SERVICE_ROLE_KEY` (recomendado) ou `SUPABASE_ANON_KEY` se preferir.

## 📊 **Etapa 3: Testar a Integração**

### Teste 1: Verificar se as tabelas foram criadas
```sql
-- Verificar tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('lista_baixada_logs', 'conferencia_baixada_logs', 'conferencia_itens');

-- Verificar estrutura
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'lista_baixada_logs' 
ORDER BY ordinal_position;
```

### Teste 2: Testar com dados reais
1. Envie uma lista pelo aplicativo
2. Verifique se aparece no ClickUp (funcionalidade existente)
3. Verifique se foi salvo no Supabase:
```sql
SELECT * FROM lista_baixada_logs ORDER BY created_at DESC LIMIT 5;
```

## 🎯 **Etapa 4: Queries para Dashboards**

### Ranking de Conferentes
```sql
SELECT * FROM conferente_ranking;
```

### Itens Mais Pedidos
```sql
SELECT * FROM item_popularidade LIMIT 20;
```

### Tempo Médio por Item
```sql
SELECT * FROM tempo_medio_analise;
```

### Estatísticas por Empresa
```sql
SELECT 
  empresa,
  COUNT(*) as total_listas,
  SUM(total_itens) as total_itens,
  AVG(produtos_sem_estoque_count) as media_sem_estoque
FROM lista_baixada_logs 
WHERE status = 'success'
GROUP BY empresa;
```

## ⚠️ **Considerações Importantes**

### 1. **Resiliência**
- O salvamento no Supabase é **não-bloqueante**: se falhar, não quebra o fluxo do ClickUp
- Erros são logados mas não impedem o processamento principal

### 2. **Performance**
- Índices foram criados para queries rápidas
- Inserções em batch para `conferencia_itens` (50 itens por vez)

### 3. **Segurança**
- Use `SUPABASE_SERVICE_ROLE_KEY` apenas no ambiente do Trigger
- Não exponha a service role key no frontend
- As tabelas têm constraints para validar dados

### 4. **Manutenção**
- Views são atualizadas automaticamente
- Triggers calculam campos derivados (tempo_segundos, itens_separados_count)
- Backward compatibility mantida

## 🔍 **Monitoramento**

### Verificar saúde da integração:
```sql
-- Últimas 24 horas
SELECT 
  status,
  COUNT(*) as count,
  AVG(processing_time_ms) as avg_time_ms
FROM lista_baixada_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;

-- Erros recentes
SELECT 
  empresa,
  error_message,
  created_at
FROM lista_baixada_logs 
WHERE status = 'error'
ORDER BY created_at DESC 
LIMIT 10;
```

## 🚀 **Próximos Passos**

1. **Dashboard de Analytics**: Criar interface para visualizar os dados
2. **Alertas**: Configurar notificações para erros ou métricas anormais
3. **Exportação**: Adicionar funcionalidade de exportar relatórios
4. **Integração com BI**: Conectar com ferramentas como Metabase, Power BI, etc.

## 📞 **Suporte**

Em caso de problemas:
1. Verifique logs do Trigger.dev
2. Confirme variáveis de ambiente
3. Teste conexão manual com Supabase
4. Consulte este documento para troubleshooting