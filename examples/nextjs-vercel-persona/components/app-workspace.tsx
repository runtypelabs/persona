"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FileText, LayoutDashboard, PanelRightClose, PanelRightOpen } from "lucide-react";

import { AppStateProvider } from "@/lib/app-state";
import { demoRoutes, type DemoRouteId } from "@/lib/demo-routes";
import { PersonaChat } from "@/components/persona-chat";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PersonaBackend } from "@/lib/chat/provider";

const navigationItems: Array<{
  routeId: DemoRouteId;
  icon: typeof LayoutDashboard;
}> = [
  { routeId: "home", icon: LayoutDashboard },
  { routeId: "demo_form", icon: FileText }
];

export function AppWorkspace({
  activeBackend,
  backendLabel,
  backendError,
  children
}: {
  activeBackend: PersonaBackend;
  backendLabel: string;
  backendError: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantReady, setAssistantReady] = useState(false);
  const [toggleRequest, setToggleRequest] = useState(0);

  const handleAssistantStateChange = useCallback(
    (state: { open: boolean; ready: boolean }) => {
      setAssistantOpen(state.open);
      setAssistantReady(state.ready);
    },
    []
  );

  return (
    <AppStateProvider activeBackend={activeBackend}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_40%),linear-gradient(180deg,#f7fafc_0%,#eef2ff_100%)] text-slate-900">
        <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:h-screen lg:grid-cols-[272px_1fr] lg:overflow-hidden">
          <aside className="border-b border-white/70 bg-slate-950 px-6 py-8 text-slate-100 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                  Persona Demo
                </p>
                <h1 className="text-lg font-semibold">Embedded Next.js App</h1>
              </div>
            </div>

            <div className="mt-8 space-y-2">
              {navigationItems.map(({ routeId, icon: Icon }) => {
                const route = demoRoutes[routeId];
                const active = pathname === route.path;

                return (
                  <Link
                    key={routeId}
                    href={route.path}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl px-4 py-3 transition-colors",
                      active
                        ? "bg-white/10 text-white"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{route.label}</div>
                      <div className="text-xs text-slate-400">
                        {route.description}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 lg:h-screen lg:min-h-0">
            <div
              id="workspace-dock-target"
              className="flex min-h-screen min-w-0 flex-col lg:h-full lg:min-h-0 lg:overflow-hidden"
            >
              <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/75 backdrop-blur">
                <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-10">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      Existing Next.js application
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-950">
                      Persona embedded in a shadcn-style app
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                      Navigate between routes, run allowlisted local tools, gate
                      sensitive actions with approval, and theme the docked
                      assistant to match the host UI.
                    </p>
                  </div>
                  <div
                    className="flex flex-wrap items-center justify-end gap-3"
                    data-persona-ignore="true"
                  >
                    <Badge
                      variant={
                        backendLabel === "Setup required" ? "warning" : "info"
                      }
                    >
                      {backendLabel}
                    </Badge>
                    <Badge variant={assistantOpen ? "success" : "default"}>
                      {assistantReady
                        ? assistantOpen
                          ? "Assistant open"
                          : "Assistant ready"
                        : "Assistant loading"}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => setToggleRequest((value) => value + 1)}
                      disabled={!assistantReady}
                      aria-pressed={assistantOpen}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {assistantOpen ? (
                        <PanelRightClose className="h-4 w-4" />
                      ) : (
                        <PanelRightOpen className="h-4 w-4" />
                      )}
                      {assistantOpen ? "Hide assistant" : "Open assistant"}
                    </button>
                  </div>
                </div>
              </header>

              <main className="flex-1 px-6 py-8 lg:min-h-0 lg:overflow-y-auto lg:px-10">
                {backendError ? (
                  <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 shadow-sm">
                    <p className="font-medium">Persona setup required</p>
                    <p className="mt-1 leading-6">
                      The docked assistant should still open from the header
                      button, but chat will not work until the backend is
                      configured.
                    </p>
                    <p className="mt-2 font-mono text-xs leading-5 text-amber-900">
                      {backendError}
                    </p>
                  </div>
                ) : null}
                {children}
              </main>
            </div>
          </div>
        </div>

        <PersonaChat
          onDockStateChange={handleAssistantStateChange}
          toggleRequest={toggleRequest}
        />
      </div>
    </AppStateProvider>
  );
}
