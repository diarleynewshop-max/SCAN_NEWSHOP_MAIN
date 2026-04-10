import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Analytics from "./pages/Analytics";
import Comprador from "./pages/Comprador";
import Compras from "./pages/Compras";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// 1. IMPORTAMOS O BOTÃO AQUI
import { ThemeToggle } from "@/components/ui/theme-toggle"; 
import TutorialButton from "@/components/TutorialButton";
import TourGuide from "@/components/TourGuide";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      
      {/* 2. COLOCAMOS O BOTÃO FLUTUANTE NO CANTO SUPERIOR DIREITO */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Botão para iniciar o Tutorial (acima do conteúdo) */}
      <div className="fixed top-4 right-12 z-50" style={{ display: 'flex', gap: 8 }}>
        <TutorialButton />
      </div>

      {/* Guia de Tour global (inicia oculto; ativado pelo TutorialButton) */}
      <TourGuide />

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/scanner" element={<Index />} />
          
          {/* Rotas protegidas por role */}
          <Route path="/analytics" element={
            <ProtectedRoute requiredRole={['admin', 'super']}>
              <Analytics />
            </ProtectedRoute>
          } />
          
          <Route path="/compras" element={
            <ProtectedRoute requiredRole={['compras', 'admin', 'super']}>
              <Compras />
            </ProtectedRoute>
          } />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
