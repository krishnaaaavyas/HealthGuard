import { createLazyFileRoute, Navigate } from "@tanstack/react-router";
import { useHealthResult } from "@/lib/health-store";

export const Route = createLazyFileRoute("/_app/dashboard")({
  component: DashboardRedirect,
});

function DashboardRedirect() {
  const [result] = useHealthResult();
  if (result) {
    return <Navigate to="/action-plan" replace />;
  }
  return <Navigate to="/assessment" replace />;
}
