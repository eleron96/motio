import { Toaster as Sonner } from "@/shared/ui/sonner";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { withSentryReactRouterV6Routing } from "@sentry/react";
import { I18nProvider } from "@lingui/react";
import { Suspense } from "react";
import { lazyDefault, lazyNamed } from "@/shared/lib/lazyComponent";
import NotFoundPage from "@/app/NotFoundPage";
import { AuthProvider } from "@/features/auth/providers/AuthProvider";
import { ProtectedRoute } from "@/app/ProtectedRoute";
import { WorkspaceLayout } from "@/features/workspace/components/WorkspaceLayout";
import { i18n } from "@/shared/lib/i18n";
import { useLocaleStore } from "@/shared/store/localeStore";
import { PageErrorBoundary } from "@/app/PageErrorBoundary";
import { BackgroundSuspenseBoundary } from "@/app/BackgroundSuspenseBoundary";

const queryClient = new QueryClient();

// The daily-brief feature pulls in Dialog + urgent-tasks/milestones rendering
// + their data fetches. The controller is mounted on every authenticated page
// but renders nothing until a once-per-day trigger fires, so keep it out of
// the eager main bundle.
const DailyBriefController = lazyNamed(
  () => import("@/features/daily-brief"),
  "DailyBriefController"
);

const LandingPage = lazyDefault(() => import("@/features/marketing/pages/LandingPage"), "LandingPage");
const PrivacyPage = lazyDefault(() => import("@/features/legal/pages/PrivacyPage"), "PrivacyPage");
const TermsPage = lazyDefault(() => import("@/features/legal/pages/TermsPage"), "TermsPage");
const AuthPage = lazyDefault(() => import("@/features/auth/pages/AuthPage"), "AuthPage");
const InvitePage = lazyDefault(() => import("@/features/auth/pages/InvitePage"), "InvitePage");
const AdminLayout = lazyDefault(() => import("@/features/admin/components/AdminLayout"), "AdminLayout");
const AdminOverviewPage = lazyDefault(() => import("@/features/admin/pages/AdminOverviewPage"), "AdminOverviewPage");
const AdminUsersPage = lazyDefault(() => import("@/features/admin/pages/AdminUsersPage"), "AdminUsersPage");
const AdminWorkspacesPage = lazyDefault(() => import("@/features/admin/pages/AdminWorkspacesPage"), "AdminWorkspacesPage");
const AdminEasterEggsPage = lazyDefault(() => import("@/features/admin/pages/AdminEasterEggsPage"), "AdminEasterEggsPage");
const AdminBackupsPage = lazyDefault(() => import("@/features/admin/pages/AdminBackupsPage"), "AdminBackupsPage");
const AdminBroadcastPage = lazyDefault(() => import("@/features/admin/pages/AdminBroadcastPage"), "AdminBroadcastPage");
const PlannerPage = lazyDefault(() => import("@/features/planner/pages/PlannerPage"), "PlannerPage");
const DashboardPage = lazyDefault(() => import("@/features/dashboard/pages/DashboardPage"), "DashboardPage");
const ProjectsPage = lazyDefault(() => import("@/features/projects/pages/ProjectsPage"), "ProjectsPage");
const MembersPage = lazyDefault(() => import("@/features/members/pages/MembersPage"), "MembersPage");
const DemoPage = lazyDefault(() => import("@/features/demo/pages/DemoPage"), "DemoPage");

const SentryRoutes = withSentryReactRouterV6Routing(Routes);

const App = () => {
  const locale = useLocaleStore((state) => state.locale);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider i18n={i18n} key={locale}>
        <TooltipProvider>
          <Sonner />
          <AuthProvider>
            <BackgroundSuspenseBoundary>
              <Suspense fallback={null}>
                <DailyBriefController />
              </Suspense>
            </BackgroundSuspenseBoundary>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <PageErrorBoundary>
                <Suspense
                  fallback={(
                    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
                      Loading...
                    </div>
                  )}
                >
                  <SentryRoutes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/invite/:inviteToken" element={<InvitePage />} />
                  <Route path="/demo/*" element={<DemoPage />} />
                  <Route
                    element={(
                      <ProtectedRoute>
                        <AdminLayout />
                      </ProtectedRoute>
                    )}
                  >
                    <Route path="/app/admin" element={<AdminOverviewPage />} />
                    <Route path="/app/admin/users" element={<AdminUsersPage />} />
                    <Route path="/app/admin/workspaces" element={<AdminWorkspacesPage />} />
                    <Route path="/app/admin/easter-eggs" element={<AdminEasterEggsPage />} />
                    <Route path="/app/admin/broadcast" element={<AdminBroadcastPage />} />
                    <Route path="/app/admin/backups" element={<AdminBackupsPage />} />
                  </Route>
                  <Route
                    element={(
                      <ProtectedRoute>
                        <WorkspaceLayout />
                      </ProtectedRoute>
                    )}
                  >
                    <Route path="/app" element={<PlannerPage />} />
                    <Route path="/app/dashboard" element={<DashboardPage />} />
                    <Route path="/app/projects" element={<ProjectsPage />} />
                    <Route path="/app/members" element={<MembersPage />} />
                  </Route>
                  <Route path="/admin/users" element={<Navigate to="/app/admin/users" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
                  <Route path="/projects" element={<Navigate to="/app/projects" replace />} />
                  <Route path="/members" element={<Navigate to="/app/members" replace />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFoundPage />} />
                  </SentryRoutes>
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
