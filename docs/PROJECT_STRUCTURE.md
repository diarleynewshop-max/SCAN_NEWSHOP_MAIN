# Estrutura do Projeto

Este projeto mistura frontend React, rotas serverless da Vercel, Trigger.dev e algumas integracoes legadas. A regra para manutencao e simples: mexer no menor fluxo possivel e validar com `tsc` e `build`.

## Mapa Atual

```text
src/
  pages/                 Telas principais e rotas do app
  components/            Componentes reutilizaveis e fluxos grandes
  hooks/                 Estado local e regras do frontend
  lib/                   Clientes, integracoes e utilitarios
  trigger/               Jobs Trigger.dev
  integrations/          Clientes externos gerados/configurados
  test/                  Setup e testes Vitest

api/                     Vercel Functions
public/                  Assets publicos, logos e arquivos estaticos
docs/                    Documentacao de manutencao
supabase/                Funcoes/estrutura Supabase legada
migrations/              Scripts SQL/analytics
```

## Onde Mexer Por Fluxo

| Fluxo | Arquivos principais |
|---|---|
| Login, perfil, tema e configuracoes | `src/pages/Home.tsx`, `src/hooks/useAuth.ts`, `src/lib/companyTheme.ts`, `src/lib/lightMode.ts` |
| Scanner / Escanear | `src/pages/Index.tsx`, `src/hooks/useInventory.ts`, `src/hooks/useProductLookup.ts` |
| Consulta Preco | `src/pages/ConsultaPreco.tsx`, `src/lib/varejoFacilIntegration.ts`, `api/erp-proxy.ts` |
| Lista / Historico | `src/components/ListHistory.tsx`, `src/lib/webhookRouter.ts` |
| Conferencia | `src/components/ConferenceView.tsx`, `src/lib/clickupApi.ts`, `api/clickup-proxy.ts` |
| Compras | `src/pages/Compras.tsx`, `src/hooks/useProdutosComprar.ts`, `api/clickup-compras-proxy.ts` |
| ClickUp serverless | `api/clickup-proxy.ts`, `api/clickup-compras-proxy.ts`, `api/_clickup.ts` |
| Trigger.dev | `src/trigger/index.ts`, `src/trigger/indexSF.ts` |

## Arquivos Grandes Que Merecem Refatoracao

Estes arquivos funcionam, mas concentram responsabilidade demais:

| Arquivo | Motivo |
|---|---|
| `src/components/ConferenceView.tsx` | conferencia, importacao, PDF, ClickUp, relatorio diario e UI no mesmo arquivo |
| `src/pages/Home.tsx` | home, login, perfil, configuracoes, tema e storage no mesmo arquivo |
| `src/pages/Index.tsx` | scanner, tabs, API de produto, foto, lista aberta e UI no mesmo arquivo |
| `src/components/ListHistory.tsx` | historico, exportacao, envio ClickUp e hidratacao de fotos no mesmo arquivo |
| `api/clickup-proxy.ts` | muitas actions ClickUp diferentes em uma unica rota |

## Estrutura Alvo Recomendada

Refatorar por etapas, sem trocar comportamento:

```text
src/features/
  auth/
    components/
    hooks/
    services/
  scanner/
    components/
    hooks/
    services/
  consulta-preco/
    components/
    services/
  lista/
    components/
    services/
  conferencia/
    components/
    services/
    reports/
  compras/
    components/
    services/

src/shared/
  components/
  hooks/
  lib/
  types/
```

## Regra Para Proximas Mudancas

1. Bug pequeno: corrigir no arquivo atual.
2. Funcionalidade nova pequena: criar helper em `src/lib` ou hook dedicado.
3. Funcionalidade nova grande: criar pasta em `src/features/<fluxo>`.
4. Nao mover arquivo grande junto com mudanca de comportamento.
5. Depois de qualquer mudanca em fluxo React/API:
   - `npx tsc -p tsconfig.json --noEmit`
   - `npm run build`

## Ordem Segura Para Refatorar

1. Extrair relatorios da conferencia para `src/features/conferencia/reports`.
2. Extrair card/acoes de configuracao da Home para `src/features/auth/components`.
3. Extrair consulta de produto do Scanner para `src/features/scanner`.
4. Separar `api/clickup-proxy.ts` em helpers internos por action.
5. Somente depois mover telas inteiras.
