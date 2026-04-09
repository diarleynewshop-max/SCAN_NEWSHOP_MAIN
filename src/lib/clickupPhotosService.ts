// Serviço para buscar fotos de produtos no ClickUp
import { buscarTasksCompras, ClickUpTask } from "./clickupApi";

// ============================================================
// Cache de Tasks (evita chamadas repetidas à API)
// ============================================================
interface TasksCacheEntry {
  tasks: ClickUpTask[];
  timestamp: number;
}

class TasksCache {
  private cache = new Map<string, TasksCacheEntry>();
  private TTL = 5 * 60 * 1000; // 5 min

  get(empresa: string): ClickUpTask[] | undefined {
    const entry = this.cache.get(empresa);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(empresa);
      return undefined;
    }

    return entry.tasks;
  }

  set(empresa: string, tasks: ClickUpTask[]) {
    this.cache.set(empresa, {
      tasks,
      timestamp: Date.now()
    });
  }

  clear() {
    this.cache.clear();
  }
}

const tasksCache = new TasksCache();

// ============================================================
// Cache de Fotos (URLs individuais)
// ============================================================
interface PhotoCacheEntry {
  url: string | null;
  timestamp: number;
  attempts: number;
}

class PhotoCache {
  private cache = new Map<string, PhotoCacheEntry>();
  private TTL = 24 * 60 * 60 * 1000; // 24h
  private MAX_FAILED_ATTEMPTS = 3;

  get(key: string): string | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return undefined;
    }

    if (entry.url === null && entry.attempts >= this.MAX_FAILED_ATTEMPTS) {
      return null;
    }

    return entry.url;
  }

  set(key: string, url: string | null) {
    const existing = this.cache.get(key);
    this.cache.set(key, {
      url,
      timestamp: Date.now(),
      attempts: url === null ? (existing?.attempts || 0) + 1 : 0
    });
  }

  clear() {
    this.cache.clear();
  }
}

const photoCache = new PhotoCache();

// ============================================================
// Retry Logic
// ============================================================
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) break;
      
      const isNetworkError = error instanceof TypeError || 
        (error instanceof Error && error.message.includes('fetch'));
      
      if (!isNetworkError) break;
      
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
  
  throw lastError || new Error('Unknown error');
}

// ============================================================
// Validação de imagem com timeout
// ============================================================
export async function isImageAccessible(url: string, timeout: number = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-1024' },
      signal: controller.signal,
      credentials: 'include'
    });

    clearTimeout(timeoutId);
    return response.ok && response.headers.get('content-type')?.startsWith('image/');
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('⏱️ Timeout verificando imagem:', url);
    }
    return false;
  }
}

export interface ProductPhoto {
  url: string;
  mimetype: string;
  title: string;
}

/**
 * Estratégias para encontrar a tarefa do produto no ClickUp
 */
export async function findProductTask(
  codigo: string,
  empresa: "NEWSHOP" | "SOYE" | "FACIL" = "NEWSHOP"
): Promise<ClickUpTask | null> {
  try {
    // Verificar cache de tasks primero
    const cachedTasks = tasksCache.get(empresa);
    const tasks = cachedTasks || await buscarTasksCompras(empresa);
    
    if (!cachedTasks) {
      tasksCache.set(empresa, tasks);
    }
    
    // Padrão: "nao_tem_CODIGO_DESCRICAO" nos attachments
    for (const task of tasks) {
      if (task.attachments && task.attachments.length > 0) {
        // Procurar attachment que corresponde ao padrão
        const matchingAttachment = task.attachments.find(attachment => {
          const fileName = attachment.title || '';
          // Verifica se o nome do arquivo contém o código no padrão esperado
          return fileName.toLowerCase().includes(`nao_tem_${codigo.toLowerCase()}`) ||
                 fileName.toLowerCase().includes(`nao_tem_tudo_${codigo.toLowerCase()}`) ||
                 fileName.includes(codigo);
        });
        
        if (matchingAttachment) {
          return task;
        }
      }
    }
    
    const taskMatch = tasks.find(task => 
      task.name.includes(codigo) || 
      task.name.toLowerCase().includes(codigo.toLowerCase())
    );
    
    if (taskMatch) {
      return taskMatch;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Busca a primeira imagem de uma tarefa ClickUp
 */
export async function getProductPhotoFromTask(
  task: ClickUpTask
): Promise<ProductPhoto | null> {
  try {
    // Filtrar apenas attachments que são imagens
    const imageAttachments = task.attachments?.filter(attachment => 
      attachment.mimetype?.startsWith("image/") ||
      attachment.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
    );
    
    if (!imageAttachments || imageAttachments.length === 0) {
      return null;
    }
    
    // Retornar a primeira imagem
    const firstImage = imageAttachments[0];
    return {
      url: firstImage.url,
      mimetype: firstImage.mimetype || "image/jpeg",
      title: firstImage.title || `Imagem do produto`
    };
  } catch (error) {
    return null;
  }
}

/**
 * Serviço principal para buscar foto de produto (API Only)
 */
export async function getProductPhoto(
  codigo: string,
  empresa: "NEWSHOP" | "SOYE" | "FACIL" = "NEWSHOP"
): Promise<string | null> {
  const cacheKey = `${empresa}:${codigo}`;
  
  const cached = photoCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
   
  try {
    const task = await findProductTask(codigo, empresa);
    if (!task) {
      photoCache.set(cacheKey, null);
      return null;
    }
    
    const photo = await getProductPhotoFromTask(task);
    if (!photo) {
      photoCache.set(cacheKey, null);
      return null;
    }
    
    photoCache.set(cacheKey, photo.url);
    return photo.url;
    
  } catch (error) {
    photoCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Hook para uso React com estado de loading/error
 */
export function useProductPhotos() {
  const getPhotoUrl = async (codigo: string): Promise<string | null> => {
    return getProductPhoto(codigo);
  };
  
  return {
    getPhotoUrl,
    clearCache: () => photoCache.clear()
  };
}

/**
 * Pré-carregar fotos para vários produtos
 */
export async function preloadProductPhotos(
  codigos: string[],
  empresa: "NEWSHOP" | "SOYE" | "FACIL" = "NEWSHOP"
): Promise<void> {
  // Limitar para evitar sobrecarga
  const limitedCodigos = codigos.slice(0, 20);
  
  await Promise.allSettled(
    limitedCodigos.map(codigo => 
      getProductPhoto(codigo, empresa).catch(() => null)
    )
  );
}