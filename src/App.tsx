import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// 1. IMPORTAMOS O BOTÃO AQUI
import { ThemeToggle } from "@/components/ui/theme-toggle"; 
import TutorialButton from "@/components/TutorialButton";
import TourGuide from "@/components/TourGuide";

const Home = lazy(() => import("./pages/Home"));
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Compras = lazy(() => import("./pages/Compras"));

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
      {/* <div className="fixed top-4 right-20 z-50" style={{ display: 'flex', gap: 8 }}>
        <TutorialButton />
      </div> */}

      {/* Guia de Tour global (inicia oculto; ativado pelo TutorialButton) */}
      {/* <TourGuide /> */}

      <BrowserRouter>
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando...</div>}>
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
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
