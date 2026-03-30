import { Toaster } from "@/shared/ui/toaster";
import { Toaster as Sonner } from "@/shared/ui/sonner";
import { DailyBriefController } from "@/features/daily-brief";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { I18nProvider } from "@lingui/react";
import { Suspense, lazy } from "react";
import NotFoundPage from "@/app/NotFoundPage";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { ProtectedRoute } from "@/app/ProtectedRoute";
import { i18n } from "@/shared/lib/i18n";
import { useLocaleStore } from "@/shared/store/localeStore";
import { RouteAnalytics } from "@/app/RouteAnalytics";
import { PageErrorBoundary } from "@/app/PageErrorBoundary";

const queryClient = new QueryClient();

const LandingPage = lazy(() => import("@/features/marketing/pages/LandingPage"));
const AuthPage = lazy(() => import("@/features/auth/pages/AuthPage"));
const InvitePage = lazy(() => import("@/features/auth/pages/InvitePage"));
const AdminUsersPage = lazy(() => import("@/features/admin/pages/AdminUsersPage"));
const PlannerPage = lazy(() => import("@/features/planner/pages/PlannerPage"));
const DashboardPage = lazy(() => import("@/features/dashboard/pages/DashboardPage"));
const ProjectsPage = lazy(() => import("@/features/projects/pages/ProjectsPage"));
const MembersPage = lazy(() => import("@/features/members/pages/MembersPage"));

const App = () => {
  const locale = useLocaleStore((state) => state.locale);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n} key={locale}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <DailyBriefController />
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <RouteAnalytics />
              <PageErrorBoundary>
                <Suspense
                  fallback={(
                    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  )}
                >
                  <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/invite/:inviteToken" element={<InvitePage />} />
                  <Route
                    path="/app/admin/users"
                    element={(
                      <ProtectedRoute>
                        <AdminUsersPage />
                      </ProtectedRoute>
                    )}
                  />
                  <Route
                    path="/app"
                    element={(
                      <ProtectedRoute>
                        <PlannerPage />
                      </ProtectedRoute>
                    )}
                  />
                  <Route
                    path="/app/dashboard"
                    element={(
                      <ProtectedRoute>
                        <DashboardPage />
                      </ProtectedRoute>
                    )}
                  />
                  <Route
                    path="/app/projects"
                    element={(
                      <ProtectedRoute>
                        <ProjectsPage />
                      </ProtectedRoute>
                    )}
                  />
                  <Route
                    path="/app/members"
                    element={(
                      <ProtectedRoute>
                        <MembersPage />
                      </ProtectedRoute>
                    )}
                  />
                  <Route path="/admin/users" element={<Navigate to="/app/admin/users" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="/projects" element={<Navigate to="/app/projects" replace />} />
                  <Route path="/members" element={<Navigate to="/app/members" replace />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </PageErrorBoundary>
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
};

export default App;
