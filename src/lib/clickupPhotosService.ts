// Serviço para buscar fotos de produtos no ClickUp
import { buscarTasksCompras, ClickUpTask } from "./clickupApi";

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
    // Buscar tasks da lista de COMPRAS (onde estão os produtos sem estoque)
    const tasks = await buscarTasksCompras(empresa);
    
    console.log("📊 Total de tasks de compras encontradas:", tasks.length);
    
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
          console.log("✅ Match encontrado no attachment:", matchingAttachment.title);
          return task;
        }
      }
    }
    
    // Estratégia fallback: Buscar por código no nome da task
    const taskMatch = tasks.find(task => 
      task.name.includes(codigo) || 
      task.name.toLowerCase().includes(codigo.toLowerCase())
    );
    
    if (taskMatch) {
      console.log("✅ Match encontrado no nome da task:", taskMatch.name);
      return taskMatch;
    }
    
    // Log para debug
    console.log("🐛 Tasks de compras disponíveis:", tasks.map(t => ({
      name: t.name,
      attachments: t.attachments?.map(a => a.title)
    })));
    
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