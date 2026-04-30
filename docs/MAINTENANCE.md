# Guia Rapido de Manutencao

## Antes de Mexer

- Verifique o fluxo afetado no `docs/PROJECT_STRUCTURE.md`.
- Rode `git status --short` para ver alteracoes pendentes.
- Evite refatorar arquivo grande junto com bug urgente.

## Validacao Padrao

```bash
npx tsc -p tsconfig.json --noEmit
npm run build
```

Se o build falhar localmente com `spawn EPERM`, e problema de permissao do sandbox/processo. Rode novamente fora do sandbox/local normal.

## Fluxos Criticos

### Scanner

- Arquivo principal: `src/pages/Index.tsx`.
- Produto/API: `src/hooks/useProductLookup.ts`.
- ERP/Varejo Facil: `src/lib/varejoFacilIntegration.ts`.
- Cuidado: modo leve desliga foto, mas permite consulta de preco.

### Conferencia

- Arquivo principal: `src/components/ConferenceView.tsx`.
- ClickUp: `src/lib/clickupApi.ts` e `api/clickup-proxy.ts`.
- Cuidado: tasks agrupadas por nome guardam varios `taskId`; delete deve usar IDs, nao nome.

### Compras

- Tela: `src/pages/Compras.tsx`.
- API: `api/clickup-compras-proxy.ts`.
- Cuidado: status ClickUp e status do app precisam continuar mapeados.

### Tema / Logo / Perfil

- Perfil: `src/hooks/useAuth.ts`.
- Tema por empresa: `src/lib/companyTheme.ts`.
- CSS vars: `src/index.css`.
- Logos: `public/logo-newshop.jpg`, `public/logo-facil.png`, `public/logo-soye.png`.

## Padrao de Integracao

- Frontend nao chama ClickUp direto.
- Frontend chama `/api/...`.
- `/api/...` usa token do ambiente.
- Trigger.dev fica apenas para automacoes ja existentes.

## O Que Evitar

- Reativar Supabase em fluxo que ja foi movido para ClickUp/Vercel.
- Colocar token em `VITE_` se ele nao precisa ir para o navegador.
- Misturar refatoracao visual com mudanca de regra de negocio.
- Mover arquivos grandes sem build passando.
