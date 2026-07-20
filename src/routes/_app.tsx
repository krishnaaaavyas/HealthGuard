import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLanguage, tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/auth-context";

import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Loader2, PanelLeft, PanelLeftClose } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { ThemeToggle } from "@/components/ui/theme-toggle";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, syncing, logout } = useAuth();
  const navigate = useNavigate();
  const currentLang = useLanguage();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate({
        to: "/",
        replace: true,
      });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-teal" />
          <p className="text-sm font-medium text-muted-foreground">
            {tr("verifyingCredentials", currentLang)}
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() || "PT";

  return (
    <>
      <Toaster richColors position="top-center" />
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((e) => !e)} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSidebarExpanded((e) => !e)}
                    aria-label={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                    className="flex items-center justify-center h-9 w-9 rounded-xl text-muted-foreground hover:text-teal hover:bg-teal/10 border border-transparent hover:border-teal/20 transition-all cursor-pointer"
                  >
                    {sidebarExpanded ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={8} className="bg-popover text-popover-foreground border border-border/60 shadow-md text-[11px] font-semibold py-1 px-2.5 rounded-lg">
                  {sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="ml-auto flex items-center gap-4">
              <ThemeToggle />
              <div className="h-4 w-px bg-border" />
              <LanguageSwitcher />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 cursor-pointer focus:outline-none select-none">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage
                        src={
                          user.providerData.find((p) => p.providerId === "google.com")?.photoURL ||
                          user.photoURL ||
                          undefined
                        }
                        alt={user.displayName || tr("patient", currentLang)}
                      />
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden text-sm font-semibold text-foreground md:inline-block">
                      {user.displayName || tr("patient", currentLang)}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 border-border bg-surface">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold leading-none text-foreground">
                        {user.displayName || tr("patient", currentLang)}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="border-border" />
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/action-plan">{tr("actionPlan", currentLang)}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/profile">{tr("myProfile", currentLang)}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="border-border" />
                  <DropdownMenuItem
                    onClick={logout}
                    className="text-red-500 hover:bg-red-500/10 cursor-pointer font-medium"
                  >
                    {tr("logOut", currentLang)}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </>
  );
}
