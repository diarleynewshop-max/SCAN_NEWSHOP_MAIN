// Test file para verificar cache
import { getProductPhoto } from "./clickupPhotosService";

async function testCache() {
  console.log("🧪 Testando cache...");
  
  // Primeira chamada - deve fazer requisição
  const firstCall = await getProductPhoto("7908475130792");
  console.log("📞 Primeira chamada:", firstCall);
  
  // Segunda chamada - deve usar cache
  const secondCall = await getProductPhoto("7908475130792");
  console.log("📞 Segunda chamada:", secondCall);
  
  // Produto diferente - nova requisição
  const differentProduct = await getProductPhoto("7896019619887");
  console.log("📞 Produto diferente:", differentProduct);
  
  console.log("✅ Teste de cache concluído");
}

// Execute apenas se chamado diretamente
if (require.main === module) {
  testCache().catch(console.error);
}