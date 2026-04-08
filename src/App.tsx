import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Analytics from "./pages/Analytics";
import Compras from "./pages/Compras";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// 1. IMPORTAMOS O BOTÃO AQUI
import { ThemeToggle } from "@/components/ui/theme-toggle"; 

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
