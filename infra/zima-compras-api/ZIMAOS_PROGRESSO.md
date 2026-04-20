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

## Atualizacao Codex 2026-04-17

- SSH real validado no ZimaOS via `sshd` na porta `22`.
- `sshd` habilitado para subir no boot.
- `docker-compose.yml` migrado para variaveis em `.env` no servidor.
- `API_TOKEN` da `compras-api` foi rotacionado no servidor.
- Postgres de compras nao esta mais exposto na rede local.
- Validado:
  - `GET /health`
  - `GET /compras/tasks`
  - `POST /compras/tasks/upsert`
  - `PATCH /compras/tasks/:id/status`
- Estado atual das portas:
  - API compras acessivel na rede em `3210`
  - Postgres compras preso em `127.0.0.1:5433`
- Backend local do SCAN ajustado para integrar com ZimaOS quando existirem as envs:
  - `ZIMA_COMPRAS_BASE_URL`
  - `ZIMA_COMPRAS_API_TOKEN`
- Arquivos locais alterados no SCAN:
  - `api/_zima-compras.ts`
  - `api/clickup-compras-proxy.ts`
  - `api/clickup-webhook.ts`
  - `api/clickup-compras-action.ts`
- Validacao local executada:
  - `npx eslint api/_zima-compras.ts api/clickup-compras-proxy.ts api/clickup-webhook.ts api/clickup-compras-action.ts`

## Atualizacao Codex 2026-04-17 2

- Publicacao HTTPS temporaria ativa via quick tunnel do Cloudflare.
- Container novo no servidor:
  - `compras-quicktunnel`
- URL publica temporaria atual:
  - `https://accessing-pens-contest-ball.trycloudflare.com`
- Validado pelo proprio ZimaOS:
  - `GET /health`
  - `GET /compras/tasks?empresa=NEWSHOP`
- Observacao:
  - esta URL e temporaria e pode mudar se o container reiniciar
  - para producao estavel ainda falta um named tunnel com credencial/token da Cloudflare

## Atualizacao Codex 2026-04-18

- Servidor ZimaOS reiniciado e servicos principais voltaram:
  - `compras-api`
  - `compras-db`
  - `ttydbridge`
- `sshd` voltou acessivel na porta `22`.
- Tentativa de subir named tunnel com token fornecido falhou:
  - `cloudflared` retornou `Provided Tunnel token is not valid.`
- Quick tunnel foi restaurado para nao deixar a API sem saida publica.
- URL publica temporaria atual:
  - `https://mug-state-occasional-seasonal.trycloudflare.com`
- Validado pelo proprio ZimaOS:
  - `GET /health`
  - `GET /compras/tasks?empresa=NEWSHOP`
- Observacao:
  - o token atual da `compras-api` esta no `.env` do servidor, nao mais no compose antigo
  - ainda falta um `TUNNEL_TOKEN` valido do Cloudflare para fechar o named tunnel estavel

## Atualizacao Codex 2026-04-18 2

- `TUNNEL_TOKEN` valido recebido para o tunnel:
  - `ce458422-2ce0-4de7-96bc-2e5e7a181a15`
- Quick tunnel removido.
- Container novo ativo no servidor:
  - `compras-namedtunnel`
- `cloudflared` conectou com sucesso ao tunnel nomeado.
- Validado nos logs:
  - `Starting tunnel tunnelID=ce458422-2ce0-4de7-96bc-2e5e7a181a15`
  - multiplas conexoes `Registered tunnel connection`
- Estado atual:
  - lado servidor pronto
  - falta apenas confirmar/criar no painel Cloudflare a rota publica do tunnel apontando para `http://127.0.0.1:3210`
