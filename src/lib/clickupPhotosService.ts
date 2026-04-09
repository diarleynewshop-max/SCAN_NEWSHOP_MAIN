// Serviço para buscar fotos de produtos no ClickUp
import { buscarTasksCompras, ClickUpTask } from "./clickupApi";

// Padrão base das URLs do ClickUp attachments
const CLICKUP_ATTACHMENT_BASE = "https://t90133045250.p.clickup-attachments.com/t90133045250";

/**
 * Constrói URL da foto baseada no padrão do ClickUp
 */
export function buildClickUpPhotoUrl(codigo: string, descricao: string): string {
  // Normalizar descrição: remover acentos, caracteres especiais, substituir espaços
  const cleanDescricao = descricao
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-zA-Z0-9]/g, '_') // Substitui caracteres especiais por _
    .toUpperCase();
  
  // Gerar fileId consistente baseado no código (hash simples)
  const fileId = generateFileId(codigo);
  
  return `${CLICKUP_ATTACHMENT_BASE}/${fileId}/nao_tem_${codigo}_${cleanDescricao}.jpg?view=open`;
}

/**
 * Gera fileId consistente baseado no código do produto
 */
function generateFileId(codigo: string): string {
  // Hash simples para gerar ID consistente
  let hash = 0;
  for (let i = 0; i < codigo.length; i++) {
    hash = ((hash << 5) - hash) + codigo.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Converter para formato UUID-like (8-4-4-4-12)
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

/**
 * Verifica se uma URL de imagem é acessível
 */
export async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok && response.headers.get('content-type')?.startsWith('image/');
  } catch {
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
    
    // Log para debug - mostrar attachments das tasks
    console.log("🐛 Tasks de compras com attachments:", tasks.map(t => ({
      name: t.name,
      attachments: t.attachments?.map(a => ({
        title: a.title,
        hasImage: a.mimetype?.startsWith("image/") || a.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
      }))
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
  sku: string = "",
  empresa: "NEWSHOP" | "SOYE" | "FACIL" = "NEWSHOP"
): Promise<string | null> {
  // Verificar cache primeiro
  const cacheKey = `${empresa}:${codigo}`;
  if (photoCache.has(cacheKey)) {
    return photoCache.get(cacheKey) || null;
  }
  
  try {
    console.log("🔍 Buscando foto para produto:", codigo);
    
    // Primeiro: tentar buscar via API do ClickUp
    const task = await findProductTask(codigo, empresa);
    if (task) {
      const photo = await getProductPhotoFromTask(task);
      if (photo) {
        console.log("✅ Foto encontrada via API:", photo.url);
        photoCache.set(cacheKey, photo.url);
        return photo.url;
      }
    }
    
    // Fallback: construir URL baseada no padrão
    const descricao = sku || codigo;
    const constructedUrl = buildClickUpPhotoUrl(codigo, descricao);
    
    console.log("🛠️ Tentando URL construída:", constructedUrl);
    
    // Verificar se a URL construída é acessível
    const isAccessible = await isImageAccessible(constructedUrl);
    
    if (isAccessible) {
      console.log("✅ URL construída funciona!");
      photoCache.set(cacheKey, constructedUrl);
      return constructedUrl;
    }
    
    console.log("📭 Nenhuma foto encontrada para:", codigo);
    return null;
    
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