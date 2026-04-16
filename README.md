# SCAN NEWSHOP MAIN

Aplicacao web para operacao de pedido, conferencia e compras, com foco em fluxo pratico no celular, integracao com ClickUp e controle de custo operacional.

![Node](https://img.shields.io/badge/node-18%2B-339933?logo=node.js&logoColor=white)
![Vite](https://img.shields.io/badge/vite-5.x-646CFF?logo=vite&logoColor=white)
![React](https://img.shields.io/badge/react-18.x-61DAFB?logo=react&logoColor=111827)
![TypeScript](https://img.shields.io/badge/typescript-5.x-3178C6?logo=typescript&logoColor=white)
![Vercel](https://img.shields.io/badge/deploy-vercel-000000?logo=vercel&logoColor=white)

## Visao geral

O projeto centraliza quatro frentes operacionais:

- `Escanear`: leitura e registro de itens.
- `Lista`: historico, edicao, exportacao e envio para ClickUp.
- `Conferencia`: processo guiado de conferencia com importacao de arquivos/tarefas.
- `Compras`: fluxo para itens faltantes e reposicao.

Tambem inclui:

- `Modo Leve` por dispositivo para celular fraco.
- Regras por empresa para reduzir consulta/custo (`SOYE` e `FACIL`).
- Persistencia local de listas e itens no aparelho.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind, shadcn/ui.
- API: Vercel Functions em `api/`.
- Integracoes: ClickUp, Supabase, webhooks.
- Jobs/automacao: Trigger.dev (fluxos em `src/trigger/`).

## Estrutura principal

```text
src/
  pages/               # Telas principais (Home, Scanner, Compras, Analytics)
  components/          # Componentes de UI e fluxo
  hooks/               # Regras de negocio no cliente
  trigger/             # Jobs Trigger.dev
api/                   # Rotas serverless (ClickUp e fluxos relacionados)
supabase/functions/    # Funcoes Supabase (quando aplicavel)
migrations/            # Estrutura de analytics/DB
```

## Requisitos

- Node.js `18+` (arquivo `.nvmrc` = `18`)
- npm

## Setup local

```bash
git clone <URL_DO_REPOSITORIO>
cd SCAN_NEWSHOP_MAIN
cp .env.example .env
npm install
npm run dev
```

Aplicacao local: `http://localhost:5173`

## Variaveis de ambiente

Base em `.env.example`:

| Variavel | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (frontend) |
| `VITE_SUPABASE_ANON_KEY` | Chave anon do Supabase (frontend) |
| `CLICKUP_TOKEN` | Token ClickUp principal |
| `CLICKUP_TOKEN_SF` | Token ClickUp alternativo (fluxo SF) |
| `CLICKUP_LIST_ID_COMPRAS` | Lista de compras padrao |
| `CLICKUP_LIST_ID_COMPRAS_NEWSHOP` | Lista de compras NEWSHOP |
| `CLICKUP_LIST_ID_COMPRAS_SOYE` | Lista de compras SOYE |
| `CLICKUP_LIST_ID_COMPRAS_FACIL` | Lista de compras FACIL |

## Scripts

| Comando | Descricao |
|---|---|
| `npm run dev` | Ambiente local (Vite) |
| `npm run build` | Build de producao |
| `npm run build:dev` | Build em modo development |
| `npm run preview` | Preview do build local |
| `npm run lint` | Lint do projeto |
| `npm run test` | Testes (Vitest) |
| `npm run test:watch` | Testes em watch mode |

## Rotas e acesso

| Rota | Acesso |
|---|---|
| `/` | Home |
| `/scanner` | Scanner, Lista e Conferencia |
| `/compras` | Perfis `compras`, `admin`, `super` |
| `/analytics` | Perfis `admin`, `super` |

## Regras operacionais atuais

- `Modo Leve` (HOME > Configuracao):
  - reduz efeitos visuais (animacao/sombra/transicao);
  - desliga lookup pesado no scanner;
  - comprime foto antes de salvar localmente.
- Empresa `SOYE` e `FACIL`:
  - sem consulta de produto em Supabase/API no scanner;
  - sem analise de estoque via Supabase na aba Lista.

## Deploy

Deploy recomendado: **Vercel**.

- Build command: `npm run build`
- Output directory: `dist`
- Rewrites SPA ja configuradas em `vercel.json`
- Configurar as mesmas variaveis de ambiente do `.env`

## Troubleshooting

- Tela branca na aba Lista:
  - forcar atualizacao do app no celular e limpar cache do navegador.
- Nao aparece informacao automatica de produto:
  - verificar se `Modo Leve` esta ativo;
  - em `SOYE`/`FACIL`, a ausencia de lookup e comportamento esperado.
- Configuracao sem rolagem no mobile:
  - atualizar para a versao atual (modal com scroll interno).
- Erros de integracao ClickUp:
  - validar tokens e IDs de lista no ambiente.

## Contexto de continuidade

Para historico tecnico e decisoes recentes, consultar:

- [`PROGRESSO.md`](./PROGRESSO.md)
