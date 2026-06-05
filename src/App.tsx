import { Suspense, lazy } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DesktopShell } from "@/components/DesktopShell";

// 1. IMPORTAMOS O BOTÃO AQUI
import { ThemeToggle } from "@/components/ui/theme-toggle";
import TutorialButton from "@/components/TutorialButton";
import TourGuide from "@/components/TourGuide";
import { EmpresaToggleSF } from "@/components/EmpresaToggleSF";

const Home = lazy(() => import("./pages/Home"));
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Compras = lazy(() => import("./pages/Compras"));
const ConsultaPreco = lazy(() => import("./pages/ConsultaPreco"));
const MeusPedidos = lazy(() => import("./pages/MeusPedidos"));
const ClickUp = lazy(() => import("./pages/ClickUp"));
const RelatorioPessoas = lazy(() => import("./pages/RelatorioPessoas"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      
      {/* 2. COLOCAMOS O BOTÃO FLUTUANTE NO CANTO SUPERIOR DIREITO */}
      <div className="fixed top-4 right-4 z-[60]">
        <ThemeToggle />
      </div>

      {/* Botão SOYE ↔ FACIL (apenas para Compras/Admin logado em SOYE ou FACIL) */}
      <EmpresaToggleSF />

{/* Botão para iniciar o Tutorial (acima do conteúdo) */}
      {/* <div className="fixed top-4 right-20 z-50" style={{ display: 'flex', gap: 8 }}>
        <TutorialButton />
      </div> */}

      {/* Guia de Tour global (inicia oculto; ativado pelo TutorialButton) */}
      {/* <TourGuide /> */}

      <BrowserRouter>
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando...</div>}>
          <Routes>
            {/* Home gerencia o próprio DesktopShell (tem dashboard + modais embutidos) */}
            <Route path="/" element={<Home />} />

            <Route path="/scanner" element={
              <DesktopShell pageTitle="Scanner"><Index /></DesktopShell>
            } />
            <Route path="/consulta-preco" element={
              <DesktopShell pageTitle="Consulta Preço"><ConsultaPreco /></DesktopShell>
            } />
            <Route path="/meus-pedidos" element={
              <DesktopShell pageTitle="Meus Pedidos"><MeusPedidos /></DesktopShell>
            } />

            {/* Rotas protegidas por role */}
            <Route path="/analytics" element={
              <ProtectedRoute requiredRole={['admin', 'super']}>
                <DesktopShell pageTitle="Analytics"><Analytics /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/compras" element={
              <ProtectedRoute requiredRole={['compras', 'admin', 'super']}>
                <DesktopShell pageTitle="Compras"><Compras /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute requiredRole={['compras', 'admin', 'super']}>
                <DesktopShell pageTitle="Dashboard"><Dashboard /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/clickup" element={
              <ProtectedRoute requiredRole={['admin', 'super']}>
                <DesktopShell pageTitle="ClickUp"><ClickUp /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/relatorio-pessoas" element={
              <ProtectedRoute requiredRole={['admin', 'super']}>
                <DesktopShell pageTitle="Relatorio Pessoas"><RelatorioPessoas /></DesktopShell>
              </ProtectedRoute>
            } />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <VercelAnalytics />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
