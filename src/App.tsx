import { Suspense, lazy } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DesktopShell } from "@/components/DesktopShell";

import { ThemeToggle } from "@/components/ui/theme-toggle";
import TourGuide from "@/components/TourGuide";
import { AppUpdateManager } from "@/components/AppUpdateManager";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { useAuth } from "@/hooks/useAuth";
import { loginEhSefuly } from "@/lib/lojaFeatures";

const Home = lazy(() => import("./pages/Home"));
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Compras = lazy(() => import("./pages/Compras"));
const SugestaoCd = lazy(() => import("./pages/SugestaoCd"));
const ConsultaPreco = lazy(() => import("./pages/ConsultaPreco"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Perfil = lazy(() => import("./pages/Perfil"));
const MeusPedidos = lazy(() => import("./pages/MeusPedidos"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Chat = lazy(() => import("./pages/Chat"));
const Notificacoes = lazy(() => import("./pages/Notificacoes"));
const Feedback = lazy(() => import("./pages/Feedback"));

const queryClient = new QueryClient();

const GlobalThemeToggle = () => {
  const { loginSalvo } = useAuth();
  if (loginEhSefuly(loginSalvo)) return null;

  return (
    <div className="fixed top-4 right-4 z-[60]">
      <ThemeToggle />
    </div>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      
      {/* 2. COLOCAMOS O BOTÃO FLUTUANTE NO CANTO SUPERIOR DIREITO */}
      <GlobalThemeToggle />

      <BrowserRouter>
        <AppUpdateManager />
        <FeedbackPrompt />
        {/* TourGuide DENTRO do Router para useLocation funcionar */}
        <TourGuide />
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Carregando...</div>}>
          <Routes>
            {/* Home gerencia o próprio DesktopShell (tem dashboard + modais embutidos) */}
            <Route path="/login" element={<Home loginOnly />} />
            <Route path="/" element={
              <ProtectedRoute requiredPermission="scanner">
                <Home />
              </ProtectedRoute>
            } />

            <Route path="/scanner" element={
              <ProtectedRoute requiredPermission="scanner">
                <DesktopShell pageTitle="Scanner"><Index /></DesktopShell>
              </ProtectedRoute>
            } />
            <Route path="/consulta-preco" element={
              <ProtectedRoute requiredPermission="consulta_preco">
                <DesktopShell pageTitle="Consulta Preço"><ConsultaPreco /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/clientes" element={
              <ProtectedRoute requiredPermission="fazer_pedido">
                <DesktopShell pageTitle="Cliente"><Clientes /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/perfil" element={
              <ProtectedRoute requiredPermission="scanner">
                <DesktopShell pageTitle="Perfil"><Perfil /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/meus-pedidos" element={
              <ProtectedRoute requiredPermission="chat">
                <DesktopShell pageTitle="Meus Pedidos"><MeusPedidos /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/chat" element={
              <ProtectedRoute requiredPermission="notificacoes">
                <DesktopShell pageTitle="Chat"><Chat /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/notificacoes" element={
              <ProtectedRoute requiredRole={['operador', 'compras', 'admin', 'super']}>
                <DesktopShell pageTitle="Notificacoes"><Notificacoes /></DesktopShell>
              </ProtectedRoute>
            } />

            {/* Rotas protegidas por role */}
            <Route path="/analytics" element={
              <ProtectedRoute requiredPermission="analytics">
                <DesktopShell pageTitle="Analytics"><Analytics /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/compras" element={
              <ProtectedRoute requiredPermission="compras">
                <DesktopShell pageTitle="Compras"><Compras /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/sugestao-cd" element={
              <ProtectedRoute requiredPermission="sugestao_cd" requiredLojaFeature="sugestao_cd">
                <DesktopShell pageTitle="Sugestao do CD"><SugestaoCd /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute requiredPermission="dashboard">
                <DesktopShell pageTitle="Dashboard"><Dashboard /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/usuarios" element={
              <ProtectedRoute requiredPermission="usuarios">
                <DesktopShell pageTitle="Usuarios"><Usuarios /></DesktopShell>
              </ProtectedRoute>
            } />

            <Route path="/feedback" element={
              <ProtectedRoute requiredRole="super">
                <DesktopShell pageTitle="Feedback"><Feedback /></DesktopShell>
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
