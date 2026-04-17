# ZimaOS Compras

## Estado Atual

- Banco de compras: `compras-db`
- API de compras: `compras-api`
- Host local atual do ZimaOS: `192.168.15.32`
- Porta local da API: `3210`
- Porta local do Postgres de compras: `5433`
- Pasta base no servidor: `/DATA/AppData/scan-compras`

## O que Ja Foi Feito

- Criadas pastas:
  - `/DATA/AppData/scan-compras/postgres`
  - `/DATA/AppData/scan-compras/backups`
  - `/DATA/AppData/scan-compras/init`
  - `/DATA/AppData/scan-compras/api`
- Subido Postgres 16 em container separado para compras.
- Criadas tabelas:
  - `compras_tasks`
  - `compras_eventos`
- Subida API minima Node/Express em container separado.
- Validada conexao da API com o banco.
- Validado `upsert` e leitura de tasks pela API.

## Arquivos do Projeto

- API local pronta em:
  - [server.js](C:\Users\diarl\OneDrive\Documentos\GitHub\SCAN_NEWSHOP_MAIN\infra\zima-compras-api\server.js)
  - [Dockerfile](C:\Users\diarl\OneDrive\Documentos\GitHub\SCAN_NEWSHOP_MAIN\infra\zima-compras-api\Dockerfile)
  - [package.json](C:\Users\diarl\OneDrive\Documentos\GitHub\SCAN_NEWSHOP_MAIN\infra\zima-compras-api\package.json)

## Endpoints Validados

- `GET /health`
- `GET /compras/tasks?empresa=NEWSHOP`
- `POST /compras/tasks/upsert`

## Comandos Rapidos de Verificacao

No ZimaOS:

```bash
cd /DATA/AppData/scan-compras
docker compose ps
docker ps
curl http://127.0.0.1:3210/health
```

Teste de leitura:

```bash
curl -H "x-api-token: TOKEN_ATUAL_DO_SERVIDOR" "http://127.0.0.1:3210/compras/tasks?empresa=NEWSHOP"
```

## Estrutura Atual do Compose

- Service `compras-db`
- Service `compras-api`
- Arquivo: `/DATA/AppData/scan-compras/docker-compose.yml`

Observacao:
- Nao repetir secrets no repo.
- Token e senha reais devem ser consultados no `docker-compose.yml` do servidor, e depois migrados para algo mais seguro.

## Decisao Tecnica

- Nao expor Postgres para fora.
- Nao conectar frontend do SCAN direto no ZimaOS.
- O caminho certo e:

`Frontend -> backend do SCAN -> ZimaOS compras-api -> compras-db`

## Proximo Passo

1. Configurar Cloudflare Tunnel para publicar a API do ZimaOS com HTTPS.
2. Gerar endpoint publico estavel para a API.
3. Integrar o backend do SCAN com esse endpoint publico.
4. So depois trocar o fluxo real de compras.

## Ponto de Atencao

- Sem tunnel/dominio publico, Vercel e Trigger nao acessam o ZimaOS.
- O item de teste via API pode permanecer ou ser apagado depois; nao impacta a infra.
