# PROGRESSO - SCAN NEWSHOP

## Como usar

- Atualize este arquivo no fim de cada sessao importante.
- Registre so o que muda decisao, status ou proximo passo.
- Se abrir outra janela do Codex, mande ler este arquivo primeiro.

## Resumo Atual

- Projeto: `SCAN_NEWSHOP_MAIN`
- Stack principal: Vite, React, TypeScript, Vercel Functions, Trigger.dev
- Integracoes principais: ClickUp, Supabase, webhooks
- Direcao atual: simplificar fluxo, reduzir custo e evitar dependencia desnecessaria

## Fortes Atuais

- Fluxo de compras ja passa por API propria em vez de frontend falar direto com ClickUp.
- Regras principais de status estao centralizadas em `api/_clickup.ts`.
- Trigger ja comprime imagens antes de anexar no ClickUp.

## Fracos Atuais

- Supabase ainda entra em pontos onde parece adicionar custo e complexidade.
- Tela de compras ainda depende de broadcast no Supabase para sincronismo rapido.
- Importacao de planilha de compras esta fragil no nome/formato das tasks.
- README nao reflete o fluxo real do projeto.

## Decisoes

### 2026-04-15

- Priorizar solucoes simples, baratas e verificaveis.
- Antes de adicionar infra ou aumentar maquina, validar pelo codigo e pelo volume real.
- No fluxo de compras, preferir ClickUp + Vercel quando Supabase nao for essencial.
- Sempre comparar alternativas com `Fortes` e `Fracos`.

## Em Andamento

- Levantamento do fluxo atual de compras, ClickUp e Trigger.
- Mapeamento de pontos onde Supabase pode estar sobrando.

## Proximos Passos

- Validar se o broadcast de compras no Supabase pode ser removido sem perda relevante.
- Blindar inicializacao do client Supabase no frontend para nao quebrar quando env faltar.
- Revisar importacao de planilha para gerar task mais consistente.
- Atualizar documentacao minima do fluxo real do projeto.

## Bugs / Riscos Abertos

- Risco de erro no frontend se Supabase for instanciado sem env valida.
- Risco de custo desnecessario com sincronismo via Supabase em compras.
- Risco de parser fraco e duplicidade na importacao de planilha.

## Modelo de Atualizacao

Copiar e preencher:

```md
### AAAA-MM-DD

Feito:
- 

Fortes:
- 

Fracos:
- 

Decisao:
- 

Proximo passo:
- 
```
