import { useState, useEffect, useCallback, useRef } from 'react';
import { obterLoginSalvo } from '@/hooks/useAuth';

export interface ProdutoComprar {
  id: string;
  codigo: string;
  sku: string | null;
  descricao: string;
  foto: string | null;
  status: CompraStatusApp;
  date_created: string;
}

export type CompraStatusApp =
  | 'todo'
  | 'produto_bom'
  | 'produto_ruim'
  | 'fazer_pedido'
  | 'pedido_andamento'
  | 'compra_realizada'
  | 'concluido';

interface UseProdutosComprarReturn {
  produtos: ProdutoComprar[];
  loading: boolean;
  error: string | null;
  ultimaAtualizacao: Date | null;
  empresa: 'NEWSHOP' | 'SOYE' | 'FACIL';
  refetch: () => Promise<void>;
  like: (taskId: string) => Promise<void>;
  dislike: (taskId: string) => Promise<void>;
  fazerPedido: (taskId: string) => Promise<void>;
  pedidoAndamento: (taskId: string) => Promise<void>;
  compraRealizada: (taskId: string) => Promise<void>;
  concluir: (taskId: string) => Promise<void>;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

function getEmpresaAtual(): 'NEWSHOP' | 'SOYE' | 'FACIL' {
  const login = obterLoginSalvo();
  if (login?.empresa === 'SOYE' || login?.empresa === 'FACIL') {
    return login.empresa;
  }
  return 'NEWSHOP';
}

const STATUS_DUPLICADO_PRIORITY: Record<CompraStatusApp, number> = {
  fazer_pedido: 400,
  produto_bom: 300,
  produto_ruim: 200,
  todo: 100,
  pedido_andamento: 90,
  compra_realizada: 80,
  concluido: 10,
};

function normalizarProdutoKey(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function getProdutoKey(produto: ProdutoComprar): string {
  const codigo = normalizarProdutoKey(produto.codigo);
  const codigoNumerico = codigo.match(/\d{6,14}/)?.[0];
  if (codigoNumerico) return `COD:${codigoNumerico}`;

  const sku = normalizarProdutoKey(produto.sku);
  if (sku) return `SKU:${sku}`;

  return codigo ? `COD:${codigo}` : '';
}

function deveSubstituirProduto(mantido: ProdutoComprar, candidato: ProdutoComprar): boolean {
  const prioridadeMantido = STATUS_DUPLICADO_PRIORITY[mantido.status] ?? 0;
  const prioridadeCandidato = STATUS_DUPLICADO_PRIORITY[candidato.status] ?? 0;

  if (prioridadeCandidato !== prioridadeMantido) {
    return prioridadeCandidato > prioridadeMantido;
  }

  return Number(candidato.date_created || 0) > Number(mantido.date_created || 0);
}

function deduplicarProdutos(produtos: ProdutoComprar[]): ProdutoComprar[] {
  const porProduto = new Map<string, ProdutoComprar>();
  const semChave: ProdutoComprar[] = [];

  for (const produto of produtos) {
    const key = getProdutoKey(produto);
    if (!key) {
      semChave.push(produto);
      continue;
    }

    const mantido = porProduto.get(key);
    if (!mantido || deveSubstituirProduto(mantido, produto)) {
      porProduto.set(key, produto);
    }
  }

  return [...semChave, ...porProduto.values()];
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError';
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return fallback;
}

function getProdutosCacheKey(empresa: 'NEWSHOP' | 'SOYE' | 'FACIL'): string {
  return `compras:produtos:${empresa}`;
}

function readProdutosCache(empresa: 'NEWSHOP' | 'SOYE' | 'FACIL'): { produtos: ProdutoComprar[]; updatedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(getProdutosCacheKey(empresa));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { produtos?: ProdutoComprar[]; updatedAt?: number };
    if (!Array.isArray(parsed.produtos) || typeof parsed.updatedAt !== 'number') return null;

    return {
      produtos: deduplicarProdutos(parsed.produtos),
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function writeProdutosCache(empresa: 'NEWSHOP' | 'SOYE' | 'FACIL', produtos: ProdutoComprar[]) {
  try {
    window.localStorage.setItem(
      getProdutosCacheKey(empresa),
      JSON.stringify({ produtos, updatedAt: Date.now() })
    );
  } catch {
    // Cache local nao e obrigatorio para o fluxo funcionar.
  }
}

export const useProdutosComprar = (): UseProdutosComprarReturn => {
  const [produtos, setProdutos] = useState<ProdutoComprar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [empresa, setEmpresa] = useState<'NEWSHOP' | 'SOYE' | 'FACIL'>(() => getEmpresaAtual());
  const requestControllerRef = useRef<AbortController | null>(null);

  const fetchProdutos = useCallback(async (force = false) => {
    const empresaAtual = getEmpresaAtual();
    setEmpresa(empresaAtual);
    const cache = readProdutosCache(empresaAtual);

    if (cache) {
      setProdutos(cache.produtos);
      setUltimaAtualizacao(new Date(cache.updatedAt));
      setLoading(false);

      if (!force && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
        setError(null);
        return;
      }
    } else {
      setLoading(true);
    }

    setError(null);
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch(`/api/clickup-compras-proxy?action=buscar-tasks&empresa=${empresaAtual}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body.error ?? `Erro ${response.status}`;
        const context = body.empresa ? ` [empresa=${body.empresa}]` : '';
        throw new Error(`${detail}${context}`);
      }

      const data = await response.json();
      const produtosAtualizados = deduplicarProdutos(data.produtos ?? []);
      setProdutos(produtosAtualizados);
      const updatedAt = new Date();
      setUltimaAtualizacao(updatedAt);
      writeProdutosCache(empresaAtual, produtosAtualizados);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        return;
      }
      console.error('[useProdutosComprar] Erro ao buscar:', err);
      setError(getErrorMessage(err, 'Falha ao carregar produtos'));
    } finally {
      if (requestControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchProdutos();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [fetchProdutos]);

  const executarAcao = useCallback(async (taskId: string, acao: string) => {
    const empresaAtual = getEmpresaAtual();
    const produtoAtual = produtos.find((p) => p.id === taskId);
    const statusAnterior = produtoAtual?.status;
    const previsao: Record<string, CompraStatusApp> = {
      LIKE: 'produto_bom',
      DISLIKE: 'produto_ruim',
      FAZER_PEDIDO: 'fazer_pedido',
      PEDIDO_ANDAMENTO: 'pedido_andamento',
      COMPRA_REALIZADA: 'compra_realizada',
      CONCLUIR: 'concluido',
    };

    if (previsao[acao]) {
      setProdutos((prev) =>
        prev.map((p) => (p.id === taskId ? { ...p, status: previsao[acao] } : p))
      );
    }

    try {
      const response = await fetch('/api/clickup-compras-proxy?action=mover-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          acao,
          empresa: empresaAtual,
          currentStatus: produtoAtual?.status ?? 'todo',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        await fetchProdutos(true);
        const detalhe = data.details ? `: ${data.details}` : '';
        const statusDisponiveis = Array.isArray(data.availableStatuses) && data.availableStatuses.length > 0
          ? ` | Status disponiveis: ${data.availableStatuses.join(', ')}`
          : '';
        const statusTentados = Array.isArray(data.attemptedStatuses) && data.attemptedStatuses.length > 0
          ? ` | Status tentados: ${data.attemptedStatuses.join(', ')}`
          : '';
        throw new Error((data.error ?? 'Erro ao executar acao') + detalhe + statusDisponiveis + statusTentados);
      }

      await fetchProdutos(true);
    } catch (err: unknown) {
      if (statusAnterior) {
        setProdutos((prev) =>
          prev.map((p) => (p.id === taskId ? { ...p, status: statusAnterior } : p))
        );
      }
      console.error('[useProdutosComprar] Erro na acao:', err);
      throw err;
    }
  }, [fetchProdutos, produtos]);

  const like = useCallback((id: string) => executarAcao(id, 'LIKE'), [executarAcao]);
  const dislike = useCallback((id: string) => executarAcao(id, 'DISLIKE'), [executarAcao]);
  const fazerPedido = useCallback((id: string) => executarAcao(id, 'FAZER_PEDIDO'), [executarAcao]);
  const pedidoAndamento = useCallback((id: string) => executarAcao(id, 'PEDIDO_ANDAMENTO'), [executarAcao]);
  const compraRealizada = useCallback((id: string) => executarAcao(id, 'COMPRA_REALIZADA'), [executarAcao]);
  const concluir = useCallback((id: string) => executarAcao(id, 'CONCLUIR'), [executarAcao]);

  return {
    produtos,
    loading,
    error,
    ultimaAtualizacao,
    empresa,
    refetch: () => fetchProdutos(true),
    like,
    dislike,
    fazerPedido,
    pedidoAndamento,
    compraRealizada,
    concluir,
  };
};

