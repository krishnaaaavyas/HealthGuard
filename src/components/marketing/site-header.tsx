import { Link, useRouterState } from "@tanstack/react-router";
import { ShieldCheck, Menu, User, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/contexts/auth-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage, tr } from "@/lib/i18n";

const nav = [
  { to: "/", labelKey: "home" as const },
  { to: "/assessment", labelKey: "assessment" as const },
  { to: "/about", labelKey: "about" as const },
];

export function SiteHeader() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { user, loading, logout } = useAuth();
  const currentLang = useLanguage();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() || "PT";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between px-4 py-4">
        <Link
          to="/"
          className="flex items-center gap-2.5 group/brand transition-transform duration-200"
        >
          <div className="relative h-9 w-9 shrink-0 select-none glass-logo">
            <span className="glass-logo__back" />
            <span className="glass-logo__front">
              <ShieldCheck className="h-5 w-5 text-teal" strokeWidth={2.4} />
            </span>
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] font-bold tracking-tight text-foreground">
              HealthGuard
            </div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-teal/85">
              {tr("brandSubtitle", currentLang)}
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1.5 md:flex">
          {nav.map((n) => {
            const active = pathname === n.to;
            const linkProps =
              n.to === "/assessment" && !user
                ? { to: "/login", search: { redirect: "/assessment" } }
                : { to: n.to };
            return (
              <Link
                key={n.to}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                {...(linkProps as any)}
                className={`relative rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-300 border ${
                  active
                    ? "bg-teal/10 text-teal border-teal/20 shadow-[0_2px_8px_-2px_rgba(60,176,176,0.15)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 border-transparent"
                }`}
              >
                {tr(n.labelKey, currentLang)}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center md:flex">
          <ThemeToggle />
          <div className="h-4 w-px bg-border mx-3.5" />
          <LanguageSwitcher />

          <div className="h-4 w-px bg-border mx-3.5" />

          {loading ? (
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground/50 select-none animate-pulse">
              <User className="h-4.5 w-4.5 text-muted-foreground/30" />
              <span>{tr("signIn", currentLang)}</span>
            </div>
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 cursor-pointer focus:outline-none select-none text-sm font-medium text-foreground hover:text-teal transition-colors py-1">
                  <Avatar className="h-7 w-7 border border-border">
                    <AvatarImage
                      src={
                        user.providerData.find((p) => p.providerId === "google.com")?.photoURL ||
                        user.photoURL ||
                        undefined
                      }
                      alt={user.displayName || tr("patient", currentLang)}
                    />
                    <AvatarFallback className="bg-teal/10 text-teal text-[11px] font-bold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-[150px] truncate">
                    {user.displayName || tr("patient", currentLang)}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
          ) : (
            <Link
              to="/login"
              preload="intent"
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-teal transition-colors"
            >
              <User className="h-4.5 w-4.5 text-muted-foreground" />
              <span>{tr("signIn", currentLang)}</span>
            </Link>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px]">
            <div className="mt-8 flex flex-col gap-1">
              {nav.map((n) => {
                const linkProps =
                  n.to === "/assessment" && !user
                    ? { to: "/login", search: { redirect: "/assessment" } }
                    : { to: n.to };
                return (
                  <Link
                    key={n.to}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {...(linkProps as any)}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-3 text-base font-medium text-foreground hover:bg-muted"
                  >
                    {tr(n.labelKey, currentLang)}
                  </Link>
                );
              })}
              <div className="mt-4 grid gap-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
                {loading ? (
                  <div className="h-10 w-full animate-pulse rounded-md bg-muted/60" />
                ) : user ? (
                  <>
                    <Button asChild variant="outline">
                      <Link to="/action-plan" onClick={() => setOpen(false)}>
                        {tr("actionPlan", currentLang)}
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/profile" onClick={() => setOpen(false)}>
                        {tr("myProfile", currentLang)}
                      </Link>
                    </Button>
                    <Button
                      onClick={() => {
                        logout();
                        setOpen(false);
                      }}
                      variant="destructive"
                    >
                      {tr("logOut", currentLang)}
                    </Button>
                  </>
                ) : (
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/login" onClick={() => setOpen(false)}>
                      {tr("signIn", currentLang)}
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
