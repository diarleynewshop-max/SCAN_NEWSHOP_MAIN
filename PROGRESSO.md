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

### 2026-04-15 (sessao compras proxy)

- Criado `api/clickup-compras-proxy.ts` para separar compras da conferencia.
- Front de compras migrado para proxy novo em `src/hooks/useProdutosComprar.ts`.
- Removido realtime de compras no frontend (sem websocket Supabase nessa tela).
- UI de compras alterada para paginacao de 10 itens e ordenacao com `todo` primeiro.
- Adicionado fallback para imagem invalida na lista de compras.

## Em Andamento

- Estabilizar mudanca de status no ClickUp em compras (acao LIKE/DISLIKE/FAZER_PEDIDO/CONCLUIR).
- Capturar nomes reais de status da lista de compras por empresa para eliminar tentativa por alias.

## Proximos Passos

- Logar no backend `availableStatuses` e `attemptedStatuses` quando mover status falhar.
- Definir mapa fixo de status por empresa/lista para reduzir ambiguidade.
- Validar nomes de status no ClickUp real (NEWSHOP/SOYE/FACIL).
- Depois de estabilizar status, commitar e fazer deploy.

## Bugs / Riscos Abertos

- Risco de erro no frontend se Supabase for instanciado sem env valida.
- Risco de parser fraco e duplicidade na importacao de planilha.
- Erro ainda reportado na tela de compras ao mover status (400 em `mover-status` em alguns cenarios).
- Possivel divergencia de nomenclatura de status no workflow de compras do ClickUp.

## Ultima Sessao (resumo rapido)

### 2026-04-15

Feito:
- Proxy novo de compras criado e integrado no frontend.
- Realtime de compras removido do frontend.
- Paginacao (10 por pagina) e ordenacao `todo` primeiro implementadas.

Fortes:
- Conferencia nao foi alterada.
- Compras ficou isolado em rota propria.

Fracos:
- Falha de status ainda existe em ambiente real em alguns cliques.

Decisao:
- Manter caminho via proxy e fechar com mapeamento de status real da lista.

Proximo passo:
- Coletar status reais da lista de compras e fixar mapeamento definitivo.

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

## Ultima Sessao (2026-04-16)

Feito:
- Implementado `Modo Leve` por dispositivo na HOME.
- `Modo Leve` agora reduz animacao/sombra/transicao e comprime foto antes de salvar.
- Scanner sem lookup (Supabase/API) quando `Modo Leve` esta ativo.
- Bloqueio por empresa no scanner: `SOYE` e `FACIL` nao consultam Supabase/API.
- Bloqueio por empresa na aba Lista: analise de estoque desativada para `SOYE` e `FACIL`.
- Corrigido bug de tela branca na aba Lista (runtime crash por import faltando de `AlertTriangle`).
- Corrigido modal de Configuracao na HOME com scroll vertical no mobile.

Fortes:
- Menos carga em celular fraco sem quebrar fluxo principal de lista local + ClickUp.
- Regra de empresa ficou explicita no frontend para evitar custo indevido.
- Correcao de tela branca foi pequena e direta.

Fracos:
- Sem lookup de produto em `SOYE/FACIL` e no `Modo Leve` (menos conveniencia para operador).
- Foto comprimida ainda pode pesar se usuario insistir em muitas fotos.
- Regra de bloqueio esta no frontend; backend ainda pode precisar reforco se houver rotas equivalentes.

Decisao:
- Manter caminho simples: reduzir custo/complexidade primeiro, preservar operacao principal, e endurecer regras por empresa no cliente.

Proximo passo:
- Revisar se existe alguma chamada Supabase/API restante em outras telas para `SOYE/FACIL` (ex: Compras/Analytics) e alinhar regra.
