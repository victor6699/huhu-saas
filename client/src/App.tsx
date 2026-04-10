import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/LoginPage";
import StaffDashboard from "@/pages/StaffDashboard";
import OrgDashboard from "@/pages/OrgDashboard";
import ClientPortal from "@/pages/ClientPortal";
import NotFound from "@/pages/not-found";

function AppRouter() {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#E0F8F7] via-white to-[#F0FEFE]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-[#0ABAB5]/20 animate-pulse flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-[#0ABAB5]/40 animate-pulse" />
          </div>
          <p className="text-gray-500 text-sm">載入中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginPage />;
  }

  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={() => {
          // Auto-redirect based on role
          const isHuhuStaff = ["admin", "sales", "finance", "support", "superadmin"].includes(user.roleCode || "");
          const isOrgAdmin = ["org_admin", "case_manager"].includes(user.roleCode || "");
          if (isHuhuStaff) {
            window.location.hash = "#/staff/dashboard";
            return null;
          }
          if (isOrgAdmin) {
            window.location.hash = "#/org/overview";
            return null;
          }
          window.location.hash = "#/portal/overview";
          return null;
        }} />
        <Route path="/staff/:rest*" component={StaffDashboard} />
        <Route path="/org/:rest*" component={OrgDashboard} />
        <Route path="/portal/:rest*" component={ClientPortal} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}
