import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import LoginPage from "@/pages/LoginPage";
import StaffDashboard from "@/pages/StaffDashboard";
import ClientPortal from "@/pages/ClientPortal";
import NotFound from "@/pages/not-found";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <Switch>
          <Route path="/" component={LoginPage} />
          <Route path="/staff/:rest*" component={StaffDashboard} />
          <Route path="/portal/:rest*" component={ClientPortal} />
          <Route component={NotFound} />
        </Switch>
      </Router>
      <Toaster />
    </QueryClientProvider>
  );
}
