import { Link, useRouterState } from "@tanstack/react-router";
import {
  HeartPulse,
  ClipboardList,
  LayoutDashboard,
  Info,
  LifeBuoy,
  User,
  ScanLine,
  Brain,
  Sparkles,
  Activity,
  Stethoscope,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useHealthResult, useProfile } from "@/lib/health-store";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const product = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assessment", label: "Assessment", icon: ClipboardList },
  { to: "/scanner", label: "Food Scanner", icon: ScanLine },
  { to: "/action-plan", label: "Action Plan", icon: Brain },
  { to: "/progress", label: "Progress", icon: Activity },
  { to: "/expert-review", label: "Expert Review", icon: Stethoscope },
  { to: "/profile", label: "Profile", icon: User },
];


const more = [
  { to: "/about", label: "About", icon: Info },
  { to: "/contact", label: "Support", icon: LifeBuoy },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const tabParam = (search as any).tab;
  const [result] = useHealthResult();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border [&_[data-sidebar=sidebar]]:bg-sidebar"
    >
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5 bg-sidebar/30 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:items-center transition-all duration-300">
        <Link
          to="/"
          className="flex items-center gap-3 group/brand w-full overflow-hidden group-data-[collapsible=icon]:justify-center"
        >
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal text-white transition-transform duration-300 group-hover/brand:scale-105">
            <HeartPulse className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="leading-tight min-w-0 transition-all duration-300 origin-left group-data-[state=collapsed]:opacity-0 group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:scale-x-75 group-data-[state=collapsed]:w-0 group-data-[state=collapsed]:translate-x-4">
            <div className="font-display text-sm font-bold text-sidebar-foreground truncate tracking-wide">
              HealthGuard
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-teal/85 truncate">
              Health Insights
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent className="gap-8 py-6">
        {/* Health Platform Group */}
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2 transition-all duration-300">
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal/65 mb-2 px-3 group-data-[collapsible=icon]:mb-0 group-data-[collapsible=icon]:px-0">
            Health Platform
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {product.map((item) => {
                const active = item.search
                  ? pathname === item.to && tabParam === item.search.tab
                  : item.to === "/dashboard"
                    ? pathname === "/dashboard" && (!tabParam || tabParam === "overview")
                    : pathname === item.to;
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        "relative transition-all duration-300 h-10 border-l-2 pr-3 pl-[10px] flex items-center group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:p-0",
                        active
                          ? "bg-teal/10 text-teal border-teal rounded-r-lg rounded-l-none font-semibold"
                          : "text-sidebar-foreground/75 border-transparent hover:text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1 rounded-lg",
                      )}
                    >
                      <Link
                        to={item.to}
                        search={item.search}
                        className="flex items-center gap-3 w-full justify-start group-data-[collapsible=icon]:justify-center"
                      >
                        <div
                          className={cn(
                            "relative flex items-center justify-center shrink-0",
                            active
                              ? "text-teal"
                              : "text-sidebar-foreground/60 group-hover/btn:text-sidebar-foreground",
                          )}
                        >
                          <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                        </div>
                        <span className="text-sm tracking-wide transition-all duration-300 origin-left group-data-[state=collapsed]:opacity-0 group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:translate-x-3 group-data-[state=collapsed]:w-0 truncate">
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Resources Group */}
        <SidebarGroup className="px-3 group-data-[collapsible=icon]:px-2 transition-all duration-300">
          <SidebarGroupLabel className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal/65 mb-2 px-3 group-data-[collapsible=icon]:mb-0 group-data-[collapsible=icon]:px-0">
            Resources
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {more.map((item) => {
                const active = pathname === item.to;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        "relative transition-all duration-300 h-10 border-l-2 pr-3 pl-[10px] flex items-center group-data-[collapsible=icon]:border-l-0 group-data-[collapsible=icon]:p-0",
                        active
                          ? "bg-teal/10 text-teal border-teal rounded-r-lg rounded-l-none font-semibold"
                          : "text-sidebar-foreground/75 border-transparent hover:text-sidebar-foreground hover:bg-sidebar-accent hover:translate-x-1 rounded-lg",
                      )}
                    >
                      <Link
                        to={item.to}
                        className="flex items-center gap-3 w-full justify-start group-data-[collapsible=icon]:justify-center"
                      >
                        <div
                          className={cn(
                            "relative flex items-center justify-center shrink-0",
                            active
                              ? "text-teal"
                              : "text-sidebar-foreground/60 group-hover/btn:text-sidebar-foreground",
                          )}
                        >
                          <item.icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.8} />
                        </div>
                        <span className="text-sm tracking-wide transition-all duration-300 origin-left group-data-[state=collapsed]:opacity-0 group-data-[state=collapsed]:pointer-events-none group-data-[state=collapsed]:translate-x-3 group-data-[state=collapsed]:w-0 truncate">
                          {item.label}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 mt-auto border-t border-sidebar-border/30 bg-sidebar/20 flex items-center justify-center transition-all duration-300 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:overflow-hidden group-data-[collapsible=icon]:border-t-0">
        <div className="text-[10px] text-sidebar-foreground/45 uppercase tracking-[0.2em] font-semibold font-display truncate group-data-[collapsible=icon]:opacity-0 transition-opacity duration-300">
          HealthGuard v1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
