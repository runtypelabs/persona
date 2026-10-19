"use client";

import { useState } from "react";
import { PersonaWidget } from "./persona-widget";
import { documents, documentMarkdown, milestones } from "../lib/workspace";

function Icon({ name, size = 18 }: { name: "document" | "sparkle" | "arrow" | "download" | "reset" | "grid"; size?: number }) {
  const paths = {
    document: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    sparkle: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /></>,
    arrow: <><path d="M5 12h14m-5-5 5 5-5 5" /></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Workspace({ liveAvailable }: { liveAvailable: boolean }) {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"preview" | "live">("preview");
  const [conversation, setConversation] = useState(0);
  const [mobileView, setMobileView] = useState<"document" | "copilot">("document");
  const document = documents[selected];
  const download = () => {
    const url = URL.createObjectURL(new Blob([documentMarkdown(document)], { type: "text/markdown;charset=utf-8" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.id}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <main className={`workspace mobile-${mobileView}`}>
      <aside className="sidebar" aria-label="Project navigation">
        <a className="wordmark" href="/" aria-label="Atlas workspace home"><span className="brand-mark">a</span>atlas<span className="workspace-label">workspace</span></a>
        <div className="project-label"><Icon name="grid" /><span>Atlas launch</span><span className="project-count">3</span></div>
        <div className="nav-caption">PROJECT DOCUMENTS</div>
        <nav className="document-nav" aria-label="Documents">
          {documents.map((item, index) => <button key={item.id} type="button" className={selected === index ? "selected" : ""} aria-current={selected === index ? "page" : undefined} onClick={() => { setSelected(index); setMobileView("document"); }}><Icon name="document" size={16} /><span>{item.title}</span></button>)}
        </nav>
        <div className="sidebar-note"><span className="small-square" />A little clarity goes a long way.<p>One project. Every perspective.</p></div>
        <div className="sidebar-footer"><span className="team-avatar">A</span><div>Atlas team<small>Sample workspace</small></div><span className="version-label">V5</span></div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="breadcrumbs"><span>Projects</span><span>/</span><span>Atlas launch</span><span>/</span><strong>{document.title}</strong></div>
          <button type="button" className="export-button" onClick={download}><Icon name="download" size={15} /><span>Export</span></button>
        </header>
        <label className="mobile-document-select"><span className="sr-only">Choose a document</span><select value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setMobileView("document"); }}>{documents.map((item, index) => <option value={index} key={item.id}>{item.title}</option>)}</select></label>
        <div className="mobile-tabs" role="group" aria-label="Workspace view"><button type="button" aria-pressed={mobileView === "document"} onClick={() => setMobileView("document")}>Document</button><button type="button" aria-pressed={mobileView === "copilot"} onClick={() => setMobileView("copilot")}>Copilot <Icon name="sparkle" size={14} /></button></div>
        <div className="work-area">
          <section className="document-pane" aria-label={document.title} key={document.id}>
            <div className="document-content">
              <div className="document-eyebrow"><span>{document.category}</span><span className="status-pill"><i />{document.status}</span></div>
              <h1>{document.title}</h1>
              <p className="document-description">{document.description}</p>
              <div className="document-meta"><span className="owner-avatar">{document.owner.split(" ").map((name) => name[0]).join("")}</span><span>{document.owner}</span><span className="meta-divider" />Updated {document.updated}</div>
              <div className="document-rule" />
              <div className="brief-callout"><span className="callout-icon"><Icon name="sparkle" size={17} /></span><p><strong>Make the next decision a little clearer.</strong> A shared reference for the team, from first insight to pilot launch.</p></div>
              {document.sections.map((section, index) => <section className="document-section" key={section.title}><div className="section-number">0{index + 1}</div><div><h2>{section.title}</h2><p>{section.content}</p></div></section>)}
              <section className="milestones"><div className="milestone-heading"><h2>The path to pilot</h2><span>OCTOBER 2026</span></div>{milestones.map((item) => <div className="milestone-row" key={item.title}><span className="milestone-date">{item.date}</span><div><strong>{item.title}</strong><small>{item.owner}</small></div><span className={item.status === "At risk" ? "milestone-status risk" : "milestone-status"}>{item.status}</span></div>)}</section>
              <footer className="document-footer"><span>ATLAS / WORKING DOCUMENT</span><span>Ideas become decisions here.</span></footer>
            </div>
          </section>
          <aside className="copilot-pane" aria-label="Document copilot">
            <header className="copilot-header"><div className="copilot-title"><Icon name="sparkle" size={17} /><strong>Copilot</strong></div><div className="copilot-controls"><label className="mode-select"><span className="sr-only">Response mode</span><select aria-label="Response mode" value={mode} onChange={(event) => setMode(event.target.value as "preview" | "live")}><option value="preview">Preview</option><option value="live" disabled={!liveAvailable}>Live Eve{liveAvailable ? "" : " · not connected"}</option></select></label><button type="button" className="icon-button" aria-label="Start a new conversation" title="Start a new conversation" onClick={() => setConversation((value) => value + 1)}><Icon name="reset" size={16} /></button></div></header>
            <div className="context-strip"><Icon name="document" size={14} /><span>{document.title}</span><span className="context-badge">In context</span></div>
            <PersonaWidget key={`${document.id}-${mode}-${conversation}`} apiUrl={`/api/eve/dispatch?mode=${mode}&document=${document.id}`} />
            <div className="copilot-footnote">{mode === "preview" ? "Preview · prepared responses, no model connected" : "Live Eve · answers grounded in your sample project"}</div>
          </aside>
        </div>
        <footer className="workspace-attribution"><span className="persona-attribution"><a href="https://persona-chat.dev" target="_blank" rel="noreferrer"><img src="/persona-js-icon.svg" width="16" height="16" alt="" />Built with persona.js</a><span>· by <a href="https://runtype.com" target="_blank" rel="noreferrer">Runtype</a></span></span></footer>
      </div>
    </main>
  );
}
