// Serviço para buscar fotos de produtos no ClickUp
import { buscarTasksAnalisado, ClickUpTask } from "./clickupApi";

// Cache em memória para evitar múltiplas chamadas
const photoCache = new Map<string, string>();

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
    // Buscar todas as tasks analisadas (já tem cache no proxy)
    const tasks = await buscarTasksAnalisado(empresa, "loja");
    
    console.log("📊 Total de tasks encontradas:", tasks.length);
    
    // Estratégia 1: Buscar por código exato no nome da task
    const exactMatch = tasks.find(task => 
      task.name.includes(codigo) || 
      task.name === codigo ||
      task.name.toLowerCase().includes(codigo.toLowerCase())
    );
    
    if (exactMatch) {
      console.log("✅ Match exato encontrado:", exactMatch.name);
      return exactMatch;
    }
    
    // Estratégia 2: Buscar por padrão mais flexível (código dentro do texto)
    const flexibleMatch = tasks.find(task => {
      // Remove espaços e caracteres especiais para busca mais ampla
      const cleanTaskName = task.name.replace(/[^a-zA-Z0-9]/g, '');
      const cleanCodigo = codigo.replace(/[^a-zA-Z0-9]/g, '');
      
      return cleanTaskName.includes(cleanCodigo) || 
             cleanCodigo.includes(cleanTaskName);
    });
    
    if (flexibleMatch) {
      console.log("✅ Match flexível encontrado:", flexibleMatch.name);
      return flexibleMatch;
    }
    
    // Estratégia 3: Log todas as tasks para debug
    console.log("🐛 Tasks disponíveis para debug:", tasks.map(t => t.name));
    
    return null;
  } catch (error) {
    console.error("❌ Erro ao buscar tarefa do produto:", error);
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
    console.error("❌ Erro ao extrair foto da tarefa:", error);
    return null;
  }
}

/**
 * Serviço principal para buscar foto de produto
 */
export async function getProductPhoto(
  codigo: string,
  empresa: "NEWSHOP" | "SOYE" | "FACIL" = "NEWSHOP"
): Promise<string | null> {
  // Verificar cache primeiro
  const cacheKey = `${empresa}:${codigo}`;
  if (photoCache.has(cacheKey)) {
    return photoCache.get(cacheKey) || null;
  }
  
  try {
    console.log("🔍 Buscando foto para produto:", codigo);
    
    // Buscar tarefa do produto
    const task = await findProductTask(codigo, empresa);
    if (!task) {
      console.log("📭 Tarefa não encontrada para:", codigo);
      return null;
    }
    
    // Extrair foto da tarefa
    const photo = await getProductPhotoFromTask(task);
    if (!photo) {
      console.log("📭 Nenhuma foto encontrada na tarefa:", task.id);
      return null;
    }
    
    console.log("✅ Foto encontrada:", photo.url);
    
    // Armazenar no cache
    photoCache.set(cacheKey, photo.url);
    
    return photo.url;
  } catch (error) {
    console.error("❌ Erro ao buscar foto do produto:", codigo, error);
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