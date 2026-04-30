# API

As rotas publicas antigas continuam na raiz de `api/` para nao quebrar frontend/Vercel.

Exemplo:

- `/api/erp-proxy`
- `/api/erp-image-proxy`
- `/api/clickup-proxy`
- `/api/clickup-compras-proxy`

Esses arquivos da raiz sao apenas pontes. A logica real fica fora de `api/` para nao virar Serverless Function extra na Vercel Hobby:

```text
server/
  varejo-facil/
    erp-proxy.ts
    erp-image-proxy.ts

  clickup/
    clickup-proxy.ts
    clickup-compras-proxy.ts
    clickup-compras-action.ts
    clickup-compras.ts
    clickup-importar.ts
    clickup-webhook.ts
    clickup-handler.ts
    clickup-debug.ts
    _clickup.ts
```

## Regra

- Frontend deve continuar chamando as rotas antigas na raiz.
- Codigo novo deve ser implementado dentro de `server/clickup` ou `server/varejo-facil`.
- Se criar uma nova rota publica, crie tambem uma ponte na raiz quando precisar manter compatibilidade.
- Manter no maximo 12 arquivos `.ts` em `api/` no plano Hobby da Vercel.
