import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Database,
  History,
  Plus,
  Home,
  Settings,
  ChevronLeft,
  ChevronRight,
  FileDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/clone", icon: Database, label: "Clone" },
  { href: "/download-schema", icon: FileDown, label: "Schema" },
  { href: "/history", icon: History, label: "History" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar - Fixed and Independent */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen border-r bg-muted/30 backdrop-blur-sm flex flex-col transition-all duration-300 z-10",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className={cn("p-6", isCollapsed && "p-3")}>
          {!isCollapsed ? (
            <>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                DB Clone
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                PostgreSQL Cloning Tool
              </p>
            </>
          ) : (
            <div className="flex justify-center">
              <Database className="h-6 w-6 text-primary" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <TooltipProvider delayDuration={0}>
          <nav className="px-2 space-y-1 flex-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.href;

              if (isCollapsed) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={cn(
                          "flex items-center justify-center h-10 w-10 mx-auto rounded-md text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </TooltipProvider>

        {/* New Connection Button */}
        <TooltipProvider delayDuration={0}>
          <div className={cn("px-2 pb-4", !isCollapsed && "px-4")}>
            {!isCollapsed ? (
              <Link
                to="/connection/new"
                className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                New Connection
              </Link>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to="/connection/new"
                    className="flex items-center justify-center h-10 w-10 mx-auto bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">New Connection</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>

        {/* Toggle Button */}
        <div className={cn("px-2 pb-4", !isCollapsed && "px-4")}>
          <Button
            variant="outline"
            size={isCollapsed ? "icon" : "sm"}
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn("w-full", isCollapsed && "mx-auto h-10 w-10")}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>

      {/* Main content - Adjusts based on sidebar width */}
      <main
        className={cn(
          "flex-1 transition-all duration-300 overflow-auto",
          isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        <div className="container py-6 max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
