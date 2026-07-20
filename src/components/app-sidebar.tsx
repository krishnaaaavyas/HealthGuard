import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  ShieldCheck,
  ClipboardList,
  LayoutDashboard,
  Info,
  LifeBuoy,
  User,
  ScanLine,
  Brain,
  Activity,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLanguage, tr, type Lang } from "@/lib/i18n";

// ── Nav definitions ───────────────────────────────────────────────────────
const primaryNav = [
  { to: "/dashboard",  labelKey: "dashboard",        icon: LayoutDashboard },
  { to: "/assessment", labelKey: "healthAssessment", icon: ClipboardList   },
  { to: "/action-plan",labelKey: "actionPlan",       icon: Brain           },
  { to: "/progress",   labelKey: "progress",         icon: Activity        },
  { to: "/scanner",    labelKey: "foodScanner",      icon: ScanLine        },
  { to: "/profile",    labelKey: "profile",          icon: User            },
] as const;

const secondaryNav = [
  { to: "/about",   labelKey: "about",   icon: Info     },
  { to: "/contact", labelKey: "support", icon: LifeBuoy },
] as const;

type NavItem = { to: string; labelKey: string; icon: React.ElementType };

// ── Single nav item — icon + optional label ───────────────────────────────
function NavItem({
  item,
  pathname,
  currentLang,
  expanded,
}: {
  item: NavItem;
  pathname: string;
  currentLang: Lang;
  expanded: boolean;
}) {
  const label  = tr(item.labelKey, currentLang);
  const active = item.to.includes("?")
    ? pathname === item.to.split("?")[0] && typeof window !== "undefined" && window.location.search.includes("settings=true")
    : pathname === item.to && !(typeof window !== "undefined" && window.location.search.includes("settings=true"));

  const inner = (
    <Link
      to={item.to}
      aria-label={label}
      className={cn(
        "group flex items-center gap-3 rounded-xl border transition-all duration-200 ease-in-out select-none outline-none",
        expanded ? "w-full px-3 py-2.5" : "w-11 h-11 justify-center",
        active
          ? "bg-teal/10 text-teal border-teal/25"
          : "bg-transparent text-sidebar-foreground/55 border-transparent hover:bg-teal/[0.055] hover:text-teal hover:border-teal/10"
      )}
    >
      <item.icon
        className="h-[18px] w-[18px] shrink-0 transition-colors duration-200"
        strokeWidth={active ? 2.3 : 1.9}
      />
      {/* Label — only visible when expanded */}
      <span
        className={cn(
          "text-[12px] font-semibold whitespace-nowrap transition-all duration-200 leading-none",
          expanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 hidden"
        )}
      >
        {label}
      </span>
    </Link>
  );

  // Show tooltip only when collapsed
  if (expanded) return inner;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={14}
        className="bg-popover text-popover-foreground border border-border/60 shadow-md text-[12px] font-semibold py-1.5 px-3 rounded-lg"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────
export function AppSidebar() {
  const pathname    = useRouterState({ select: (s) => s.location.pathname });
  const currentLang = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const sidebarWidth = expanded ? "200px" : "72px";

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        style={{ width: sidebarWidth, minWidth: sidebarWidth }}
        className="relative flex flex-col h-screen border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-in-out overflow-hidden shrink-0"
      >
        {/* ── Logo header ─────────────────────────── */}
        <div className="h-14 flex items-center justify-center border-b border-sidebar-border shrink-0 px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/"
                aria-label="HealthGuard Home"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal/10 border border-teal/20 text-teal transition-all duration-200 hover:bg-teal/15 hover:border-teal/30 shrink-0"
              >
                <ShieldCheck className="h-5 w-5 shrink-0" strokeWidth={2.4} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={14} className="bg-popover text-popover-foreground border border-border/60 shadow-md text-[12px] font-semibold py-1.5 px-3 rounded-lg">
              HealthGuard
            </TooltipContent>
          </Tooltip>

          {/* App name — only shows when expanded */}
          {expanded && (
            <span className="ml-2.5 text-[13px] font-black tracking-tight text-foreground whitespace-nowrap overflow-hidden">
              HealthGuard
            </span>
          )}
        </div>

        {/* ── Primary navigation ───────────────────── */}
        <div className="flex-1 flex flex-col gap-0 py-3 overflow-y-auto overflow-x-hidden scrollbar-none">
          <nav className={cn("flex flex-col gap-1.5 w-full", expanded ? "px-3" : "px-2 items-center")}>
            {primaryNav.map((item) => (
              <NavItem key={item.to} item={item} pathname={pathname} currentLang={currentLang} expanded={expanded} />
            ))}
          </nav>

          {/* Divider */}
          <div className="py-3 w-full px-4">
            <div className="h-px bg-sidebar-border/50" />
          </div>

          {/* Secondary navigation */}
          <nav className={cn("flex flex-col gap-1.5 w-full", expanded ? "px-3" : "px-2 items-center")}>
            {secondaryNav.map((item) => (
              <NavItem key={item.to} item={item} pathname={pathname} currentLang={currentLang} expanded={expanded} />
            ))}
          </nav>
        </div>

        {/* ── Footer: toggle + version ─────────────── */}
        <div className="border-t border-sidebar-border/40 flex flex-col items-center gap-0 shrink-0">
          {/* Toggle button */}
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className={cn(
              "flex items-center gap-2 w-full transition-all duration-200",
              "text-sidebar-foreground/40 hover:text-teal hover:bg-teal/5",
              expanded ? "px-4 py-3 justify-start" : "justify-center py-3"
            )}
          >
            {expanded ? (
              <>
                <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={2} />
                <span className="text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">Collapse</span>
              </>
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={2} />
            )}
          </button>

          {/* Version */}
          <div className={cn("pb-2.5 flex", expanded ? "w-full px-4 justify-start" : "justify-center")}>
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/25 select-none">
              v1.0
            </span>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
