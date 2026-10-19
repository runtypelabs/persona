"use client";

import { useEffect, useRef, useState } from "react";
import { initAgentWidget, markdownPostprocessor } from "@runtypelabs/persona";
import { releases } from "../lib/releases";

const releaseToolLabels: Record<
  string,
  { active: string; complete: string; failed: string }
> = {
  inspect_release: {
    active: "Reviewing release",
    complete: "Reviewed release",
    failed: "Release review failed",
  },
  read_changes: {
    active: "Reading changes",
    complete: "Read changes",
    failed: "Change lookup failed",
  },
};
function toolActivity(tool: {
  name?: string;
  status: "pending" | "running" | "complete";
  success?: boolean;
}): string | null {
  const labels = releaseToolLabels[tool.name ?? ""];
  if (!labels) return null;
  return tool.status !== "complete"
    ? labels.active
    : tool.success === false
    ? labels.failed
    : labels.complete;
}

type Mode = "preview" | "live";
export function ReleaseWorkspace({
  liveAvailable,
}: {
  liveAvailable: boolean;
}) {
  const [releaseId, setReleaseId] = useState("october");
  const [filter, setFilter] = useState("All changes");
  const [mode, setMode] = useState<Mode>("preview");
  const host = useRef<HTMLDivElement>(null);
  const assistant = useRef<ReturnType<typeof initAgentWidget> | null>(null);
  const release = releases.find((item) => item.id === releaseId)!;
  const passed = release.checks.filter(
    (check) => check.status === "passed"
  ).length;
  const changes = release.changes.filter(
    (change) => filter === "All changes" || change.area === filter
  );

  useEffect(() => {
    if (!host.current) return;
    let conversationId = crypto.randomUUID();
    const handle = initAgentWidget({
      target: host.current,
      config: {
        future: { v5Defaults: true },
        persistState: false,
        // Composer-bar geometry owns the panel width, including when the artifact pane is hidden.
        features: {
          artifacts: { layout: { expandLauncherPanelWhenOpen: false } },
        },
        toolCall: {
          renderCollapsedSummary: ({ toolCall }) => toolActivity(toolCall),
          renderGroupedSummary: ({ toolCalls }) => {
            const labels = toolCalls.map(toolActivity);
            if (labels.some((label) => label === null)) return null;
            return [...new Set(labels)]
              .map((label, index) =>
                index === 0
                  ? label
                  : label!.charAt(0).toLowerCase() + label!.slice(1)
              )
              .join(", ");
          },
        },
        apiUrl: `/api/flue/dispatch?mode=${mode}`,
        launcher: {
          enabled: true,
          mountMode: "composer-bar",
          title: "Orbit assistant",
          subtitle:
            mode === "preview"
              ? "Preview · Sample workspace"
              : "Live · Powered by Flue",
          agentIconName: "sparkles",
          headerIconName: "sparkles",
          composerBar: {
            collapsedMaxWidth: "760px",
            bottomOffset: "24px",
            expandedSize: "anchored",
            expandedMaxWidth: "820px",
            expandedTopOffset: "12vh",
          },
        },
        welcome: {
          title: "Ask about this release",
          subtitle: "",
          variant: "card",
          layout: "top",
          align: "start",
        },
        copy: { inputPlaceholder: "Ask Orbit about this release…" },
        contextProviders: [() => ({ release: releaseId, conversationId })],
        theme: {
          components: { introCard: { padding: "0", title: { fontSize: "18px", lineHeight: "24px" } } },
          semantic: {
            colors: {
              accent: "#c34c2c",
              primary: "#20201e",
              background: "#ffffff",
              surface: "#ffffff",
            },
          },
        },
        suggestions: {
          starters: {
            items: [
              "Check launch readiness",
              "Draft the release notes",
              "Summarize the changes",
            ],
            placement: "welcome",
            variant: "chip",
            maxItems: 3,
          },
        },
        postprocessMessage: ({ text }) => markdownPostprocessor(text),
      },
    });
    assistant.current = handle;
    const clearConversation = (event: Event) => {
      if (
        (event as CustomEvent<{ instanceId?: string }>).detail?.instanceId ===
        handle.instanceId
      ) {
        conversationId = crypto.randomUUID();
      }
    };
    window.addEventListener("persona:clear-chat", clearConversation);
    return () => {
      window.removeEventListener("persona:clear-chat", clearConversation);
      handle.destroy();
      assistant.current = null;
    };
  }, [mode, releaseId, release.version]);

  const ask = (message: string) => {
    assistant.current?.open();
    assistant.current?.submitMessage(message);
  };

  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Orbit home">
          <span className="orbit-mark" />
          orbit<span className="workspace-name">/ &nbsp; Acme workspace</span>
        </a>
        <div className="topbar-right">
          <span className="avatar">MC</span>
        </div>
      </header>
      <nav className="subnav" aria-label="Workspace">
        <a href="#release" className="nav-active">
          Releases
        </a>
        <a href="#changes">Changelog</a>
        <a href="#readiness">Readiness</a>
        <span className="nav-spacer" />
        <div className="mode-toggle" aria-label="Assistant mode">
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            aria-pressed={mode === "live"}
            disabled={!liveAvailable}
            title={
              liveAvailable
                ? "Use the connected Flue agent"
                : "Configure the Flue service to enable Live mode"
            }
            onClick={() => setMode("live")}
          >
            Live
            <span
              className={liveAvailable ? "live-dot available" : "live-dot"}
            />
          </button>
        </div>
      </nav>
      <main id="release">
        <div className="page-heading">
          <h1>Release room</h1>
          <label className="release-picker">
            <span>Release</span>
            <select
              aria-label="Release"
              value={releaseId}
              onChange={(event) => {
                setReleaseId(event.target.value);
                setFilter("All changes");
              }}
            >
              <option value="october">October · v2.8</option>
              <option value="september">September · v2.7</option>
            </select>
          </label>
        </div>
        <section className="release-grid" aria-label="Release overview">
          <div className="release-card">
            <div className="release-copy">
              <span className="release-label">
                ORBIT {release.version} <span> / </span> {release.date}
              </span>
              <h2>{release.title}</h2>
              <p>{release.description}</p>
              <button
                className="text-action"
                onClick={() =>
                  ask("Draft customer-facing release notes for this release.")
                }
              >
                Draft release notes <span>↗</span>
              </button>
            </div>
            <div className="release-art" aria-hidden="true">
              <div className="art-grid" />
              <div className="art-orbit orbit-one" />
              <div className="art-orbit orbit-two" />
              <div className="art-planet" />
              <span className="art-version">{release.version}</span>
            </div>
          </div>
          <aside className="readiness-summary">
            <div className="card-eyebrow">
              LAUNCH READINESS
              <span className={passed === 4 ? "status green" : "status"}>
                {passed === 4 ? "Ready" : "In review"}
              </span>
            </div>
            <div className="readiness-count">
              {passed}
              <span>/ 4</span>
            </div>
            <p>checks complete</p>
            <div className="progress-bars">
              {release.checks.map((check) => (
                <span
                  key={check.name}
                  className={check.status === "passed" ? "complete" : ""}
                />
              ))}
            </div>
            <button
              className="review-button"
              onClick={() =>
                ask(
                  "Check launch readiness. What needs attention and who owns it?"
                )
              }
            >
              <span>✧</span> Review with assistant <span>↗</span>
            </button>
          </aside>
        </section>
        <section className="readiness-section" id="readiness">
          <div className="section-heading">
            <h3>The final checks</h3>
          </div>
          <div className="check-grid">
            {release.checks.map((check) => (
              <article className="check-card" key={check.name}>
                <div className="check-top">
                  <span className={`check-icon ${check.status}`}>
                    {check.status === "passed" ? "✓" : "◷"}
                  </span>
                  <span>{check.owner}</span>
                </div>
                <h4>{check.name}</h4>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="changes-section" id="changes">
          <div className="section-heading">
            <h3>
              In this release{" "}
              <span className="count-badge">{release.changes.length}</span>
            </h3>
            <label className="filter-label">
              <span className="sr-only">Filter changes</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {["All changes", "Workspace", "Analytics", "Performance"].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  )
                )}
              </select>
            </label>
          </div>
          <div className="changes-table">
            <div className="table-head">
              <span>CHANGE</span>
              <span>AREA</span>
              <span>CONTRIBUTOR</span>
            </div>
            {changes.map((change) => (
              <button
                className="change-row"
                key={change.id}
                onClick={() =>
                  ask(
                    `Explain the release change “${change.title}” (${change.id}) using the available release data.`
                  )
                }
              >
                <span className="change-title">
                  <span className="change-id">{change.id}</span>
                  {change.title}
                </span>
                <span className="area-tag">{change.area}</span>
                <span className="contributor">
                  <span className="mini-avatar">
                    {change.author
                      .split(" ")
                      .map((part) => part[0])
                      .join("")}
                  </span>
                  {change.author}
                  <span className="row-arrow">↗</span>
                </span>
              </button>
            ))}
          </div>
        </section>
        <footer className="workspace-footer">
          <span>
            <span className="footer-dot" />{" "}
            {mode === "preview"
              ? "Preview workspace · Sample data"
              : "Live assistant · Sample workspace"}
          </span>
          <div className="persona-attribution">
            <a href="https://persona-chat.dev" target="_blank" rel="noreferrer">
              <img src="/persona-js-icon.svg" width="16" height="16" alt="" />
              Built with persona.js
            </a>
            <span>· by <a href="https://runtype.com" target="_blank" rel="noreferrer">Runtype</a></span>
          </div>
        </footer>
      </main>
      <div ref={host} id="orbit-assistant" />
    </>
  );
}
