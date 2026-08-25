# API IA Estoque - SCAN / Varejo Facil

## Objetivo

Esta API e a porta oficial para uma IA externa consultar o estoque do ERP e, somente depois da validacao do fluxo oficial de inventario/ajuste, solicitar ajustes. Ela protege as credenciais do Varejo Facil: a IA recebe somente uma chave do SCAN e nunca recebe login, senha, token ou URL interna do ERP.

Base de producao: `https://scan-newshop-main.vercel.app/api/ia-estoque`

Versao atual: `1.0`

## Estado atual e limite importante

A leitura esta pronta: produto por ID, saldo por loja/local e resolucao por EAN. A escrita esta implementada, mas fica **desabilitada por padrao**. Ela so pode ser ligada quando for confirmado, no ERP NEWSHOP, qual e a rota oficial de ajuste/inventario e qual payload ela exige.

Nao habilite escrita apontando para uma rota suposta. Um ajuste de saldo cria efeito operacional e, conforme o processo, fiscal. O SCAN nao deve usar `PUT /produto` para tentar alterar saldo: essa rota atualiza cadastro, nao e o movimento de estoque.

## Credenciais e configuracao na Vercel

Configure somente no ambiente **Production**. Nenhuma chave abaixo usa prefixo `VITE_`.

| Variavel | Obrigatoria | Uso |
| --- | --- | --- |
| `IA_ESTOQUE_API_KEY_NEWSHOP` | Sim | Chave exclusiva de leitura da NEWSHOP. |
| `IA_ESTOQUE_API_KEY_FACIL` | Sim | Chave exclusiva de leitura da FACIL. |
| `IA_ESTOQUE_API_KEY_SOYE` | Sim | Chave exclusiva de leitura da SOYE. |
| `IA_ESTOQUE_EMPRESAS` | Sim | Empresas liberadas, separadas por virgula: `NEWSHOP,FACIL,SOYE`. |
| `IA_ESTOQUE_WRITE_API_KEY` | Para escrita | Chave diferente e mais restrita, usada somente no `POST ajustar`. |
| `IA_ESTOQUE_WRITE_ENABLED` | Para escrita | Deve ser literalmente `true`; qualquer outro valor bloqueia ajustes. |
| `IA_ESTOQUE_ERP_AJUSTE_PATH` | Para escrita | Rota oficial validada do ERP, iniciando com `/`. Nunca inventar esta rota. |

Gere uma chave forte localmente:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Cadastre no painel da Vercel ou com:

```powershell
vercel env add IA_ESTOQUE_API_KEY_NEWSHOP production
vercel env add IA_ESTOQUE_API_KEY_FACIL production
vercel env add IA_ESTOQUE_API_KEY_SOYE production
vercel env add IA_ESTOQUE_EMPRESAS production
```

Depois de alterar variavel, faca novo deploy. Rotacione a chave se ela aparecer em chat, log, print, frontend ou repositorio. A chave deve morar nos secrets da outra IA, nunca no prompt dela.

## Autenticacao

Envie uma das duas formas. `X-API-Key` e a preferida.

```http
X-API-Key: SUA_CHAVE_DE_LEITURA
```

```http
Authorization: Bearer SUA_CHAVE_DE_LEITURA
```

Nao ha CORS publico propositalmente. Esta API e server-to-server: use Actions, Function Calling, MCP, workflow ou backend da IA. Nao coloque a chave em uma pagina web.

## Empresas e locais

Valores ativos: `NEWSHOP`, `FACIL` e `SOYE`. A empresa precisa estar em `IA_ESTOQUE_EMPRESAS`, e cada uma exige a sua propria chave. Embora SOYE e FACIL usem o mesmo host, continuam empresas logicas distintas: chave FACIL nao consulta SOYE e chave SOYE nao consulta FACIL.

Os saldos retornam `lojaId` do ERP. No fluxo ja validado do SCAN, o mapa e:

| lojaId | Nome operacional |
| ---: | --- |
| 1 | Loja |
| 2 | Deposito |
| 3 | CD |

Sempre use o `lojaId` retornado pelo ERP como fonte final. Nao some locais sem deixar isso explicito na decisao da IA.

## Endpoints de leitura

### 1. Estado da integracao

```http
GET /api/ia-estoque?acao=status
X-API-Key: SUA_CHAVE_DE_LEITURA
```

Mostra empresas liberadas e se a escrita esta realmente habilitada. Use antes de qualquer operacao.

### 2. Resolver um EAN e trazer produto + saldo

```http
GET /api/ia-estoque?acao=resolver&empresa=NEWSHOP&codigo=7893095626124
X-API-Key: SUA_CHAVE_DE_LEITURA
```

`codigo` aceita de 6 a 18 digitos; pontuacao e removida. O SCAN consulta `codigos-auxiliares`, resolve o `produtoId`, busca o cadastro e depois `/v1/estoque/saldos`.

Resposta reduzida:

```json
{
  "empresa": "NEWSHOP",
  "produtoId": "143",
  "eanResolvido": "07893095626124",
  "produto": { "id": 143, "descricao": "..." },
  "estoque": { "items": [{ "lojaId": 1, "saldo": 4 }] }
}
```

### 3. Cadastro do produto

```http
GET /api/ia-estoque?acao=produto&empresa=NEWSHOP&produtoId=143
X-API-Key: SUA_CHAVE_DE_LEITURA
```

### 4. Saldo por local

```http
GET /api/ia-estoque?acao=estoque&empresa=NEWSHOP&produtoId=143
X-API-Key: SUA_CHAVE_DE_LEITURA
```

## Contrato de escrita - desabilitado ate validacao do ERP

Somente a chave de escrita pode chamar este endpoint. A requisicao precisa incluir confirmacao textual, justificativa e chave de idempotencia. Isso reduz acidente de agente, repeticao de tarefa e prompt mal interpretado.

```http
POST /api/ia-estoque?acao=ajustar
X-API-Key: SUA_CHAVE_DE_ESCRITA
Idempotency-Key: inv-20260825-143-loja1-contagem02
Content-Type: application/json

{
  "empresa": "NEWSHOP",
  "produtoId": 143,
  "lojaId": 1,
  "modo": "ABSOLUTO",
  "quantidade": 12,
  "motivo": "Inventario de loja 25/08, contagem conferida por operador.",
  "confirmacao": "AJUSTAR_ESTOQUE"
}
```

Regras:

- `modo=ABSOLUTO`: a quantidade informada e o saldo contado desejado.
- `modo=DELTA`: a quantidade e a variacao a somar/subtrair.
- `motivo`: 8 a 300 caracteres, obrigatorio e rastreavel.
- `Idempotency-Key`: 12 a 120 caracteres com letras, numeros, `_` ou `-`; gere uma por ajuste.
- Depois de resposta 200, consulte o saldo novamente. Em timeout ou 5xx, **nao repita cegamente**: consulte antes com a mesma chave de operacao.

O payload que a fachada envia ao adaptador ERP e:

```json
{
  "produtoId": 143,
  "lojaId": 1,
  "modo": "ABSOLUTO",
  "quantidade": 12,
  "motivo": "Inventario de loja 25/08, contagem conferida por operador.",
  "idempotencyKey": "inv-20260825-143-loja1-contagem02"
}
```

Antes de ligar `IA_ESTOQUE_WRITE_ENABLED=true`, validar no ERP autenticado: rota, metodo, payload, efeito de `ABSOLUTO` e `DELTA`, tratamento de duplicidade e uma operacao de teste em produto/local autorizado. Registrar o contrato real aqui e no codigo. A resposta do endpoint so e considerada concluida se a leitura posterior confirmar o saldo esperado.

## Fluxo que a outra IA deve seguir

1. Chamar `status` e abortar se a empresa nao estiver liberada.
2. Resolver cada EAN e guardar `produtoId`, descricao, saldo atual por `lojaId` e horario.
3. Comparar com a contagem fisica/importada. Nunca assumir que `saldo=0` por falta de resposta.
4. Produzir uma lista de divergencias: produto, local, saldo ERP, contado, diferenca, motivo e confianca.
5. Enquanto escrita estiver bloqueada, devolver somente a lista para aprovacao humana.
6. Com escrita habilitada, ajustar um item por vez, com chave de idempotencia unica e confirmacao.
7. Consultar o saldo depois de cada ajuste. Se nao bater, parar aquele item e registrar erro; nao compensar com outro ajuste automatico.

## Exemplos para Function Calling / MCP

Descricao curta para ferramenta:

```text
Consulta saldo de um produto no ERP NEWSHOP. Use primeiro para resolver EAN e depois para confirmar saldo por loja. Nunca chame POST ajustar sem estoque contado, motivo, idempotency key e autorizacao explicita.
```

Exemplo `curl`:

```bash
curl -G 'https://scan-newshop-main.vercel.app/api/ia-estoque' \
  --data-urlencode 'acao=resolver' \
  --data-urlencode 'empresa=NEWSHOP' \
  --data-urlencode 'codigo=7893095626124' \
  -H 'X-API-Key: SUA_CHAVE_DE_LEITURA'
```

## Erros e conduta

| HTTP | Codigo | Conduta da IA |
| ---: | --- | --- |
| 400 | `INVALID_CODE`, `PRODUCT_ID_REQUIRED`, `INVALID_ADJUSTMENT` | Corrigir entrada; nao tentar outra coisa automaticamente. |
| 401 | `UNAUTHORIZED` | Parar; chave ausente, revogada ou no escopo errado. |
| 403 | `EMPRESA_NOT_ALLOWED`, `WRITE_DISABLED` | Parar; nao tentar trocar de empresa ou burlar o bloqueio. |
| 404 | `PRODUCT_NOT_FOUND` | Marcar para cadastro/conferencia humana. |
| 409 | `CONFIRMATION_REQUIRED` | Pedir autorizacao, nao preencher por conta propria. |
| 502/5xx | `ERP_ERROR` | Consultar novamente antes de concluir que houve ou nao houve ajuste. |

## Limites de seguranca

- A fachada nao aceita `path`, URL ou header do ERP vindos da IA.
- Credenciais do Varejo Facil permanecem no ambiente da Vercel.
- Leitura e escrita usam chaves separadas.
- A escrita exige tres travas: chave de escrita, flag de ambiente e adaptador ERP validado, alem de confirmacao no payload.
- O endpoint responde com `Cache-Control: no-store`; ainda assim, a outra IA deve mascarar chaves e dados sensiveis em seus logs.
- O SCAN registra tentativa de ajuste nos logs da Vercel sem a chave. Para auditoria duravel por ajuste, a proxima etapa e gravar uma tabela de operacoes antes de habilitar producao em lote.

## Validacao antes de entregar a outra IA

1. Configurar a chave de leitura em Production e fazer novo deploy.
2. Executar `status` com a chave: deve retornar 200 e `ajustarEstoque=false`.
3. Resolver um EAN conhecido e comparar `produtoId`, descricao e saldos com a tela do ERP.
4. Testar chave errada: deve retornar 401.
5. Confirmar que `POST ajustar` retorna `WRITE_DISABLED` enquanto a escrita nao foi homologada.
6. Somente apos homologar a rota oficial do ERP, configurar chave de escrita, path e flag; testar um produto/local isolado e confirmar o saldo com GET.
