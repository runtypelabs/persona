"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PersonaWidget } from "./persona-widget";

type Conversation = { id: number; title: string; mode: "preview" | "live"; adapter: "ai-sdk" | "openai-responses" };
const initial: Conversation = { id: 1, title: "New conversation", mode: "preview", adapter: "ai-sdk" };

export function Workspace({ liveAvailable }: { liveAvailable: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([initial]);
  const [active, setActive] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 680px)");
    const update = () => {
      setMobile(query.matches);
      if (!query.matches) setSidebarOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !sidebarOpen) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebarOpen(false);
      } else if (event.key === "Tab") {
        const controls = sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        const first = controls?.[0];
        const last = controls?.[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Do not focus the hamburger if a resize has hidden it on desktop.
      if (menuRef.current?.getClientRects().length) menuRef.current.focus();
    };
  }, [mobile, sidebarOpen]);
  const current = conversations.find(item => item.id === active)!;
  const updateTitle = useCallback((id: number, title: string) => {
    setConversations(items => items.map(item => item.id === id ? { ...item, title } : item));
  }, []);
  function start(overrides: Partial<Conversation> = {}) {
    const conversation = { ...current, ...overrides, id: Date.now(), title: "New conversation" };
    setConversations(items => [...items, conversation]);
    setActive(conversation.id);
    setSidebarOpen(false);
  }

  return (
    <main className="workspace">
      {mobile && sidebarOpen && <button className="sidebarScrim" tabIndex={-1} aria-hidden="true" onClick={() => setSidebarOpen(false)} />}
      <aside id="conversation-navigation" ref={sidebarRef} className="sidebar" data-open={sidebarOpen} aria-label="Conversation navigation" role={mobile ? "dialog" : undefined} aria-modal={mobile && sidebarOpen ? true : undefined} aria-hidden={mobile && !sidebarOpen ? true : undefined} inert={mobile && !sidebarOpen}>
        <button ref={closeRef} className="sidebarClose" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>Close <span aria-hidden="true">×</span></button>
        <a className="brand" href="/" aria-label="Persona workspace home"><img className="brandLogo" src="/persona-js.svg" width="112" height="31" alt="persona.js" /><span className="brandEdition">Workspace</span></a>
        <button className="newChat" onClick={() => start()}><span aria-hidden="true">＋</span> New conversation <span className="shortcut" aria-hidden="true">↗</span></button>
        <div className="navLabel">YOUR CONVERSATIONS</div>
        <nav className="conversationList" aria-label="Conversations in this visit">
          {[...conversations].reverse().map(item => <button key={item.id} className="conversationLink" aria-current={item.id === active ? "page" : undefined} onClick={() => { setActive(item.id); setSidebarOpen(false); }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 12.5a2 2 0 0 1-2 2H7l-3 2v-10a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2Z" /></svg><span>{item.title}</span></button>)}
        </nav>
        <div className="sidebarFoot"><span className="workspaceAvatar">P</span><div>Personal workspace<small>Conversations stay in this visit</small></div></div>
      </aside>
      <section className="mainPane" aria-label="Chat workspace" inert={mobile && sidebarOpen}>
        <header className="workspaceHeader">
          <button ref={menuRef} className="mobileMenu" aria-controls="conversation-navigation" aria-label="Open navigation" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="workspaceLocation">Workspace <span>/</span> <strong>Chat</strong></div>
          <div className="headerControls">
            <label className="adapterSelect"><span className="srOnly">Provider adapter</span><select value={current.adapter} onChange={event => start({ adapter: event.target.value as Conversation["adapter"] })}><option value="ai-sdk">Vercel AI SDK</option><option value="openai-responses">OpenAI Responses</option></select></label>
            <div className="modeSwitch" aria-label="Connection mode"><button aria-pressed={current.mode === "preview"} onClick={() => current.mode !== "preview" && start({ mode: "preview" })}>Preview</button><button aria-pressed={current.mode === "live"} onClick={() => current.mode !== "live" && start({ mode: "live" })}>Live</button></div>
          </div>
        </header>
        <div className="modeNote"><span className="statusDot" />{current.mode === "preview" ? "Preview · Sample research, no API key needed" : liveAvailable ? "Live · Connected to your configured provider" : "Live · Provider setup required"}</div>
        {conversations.map(item => <div key={item.id} className="conversationPane" hidden={item.id !== active}>
          {item.mode === "live" && !liveAvailable ? <div className="setupState"><div className="welcomeSymbol">↗</div><p className="eyebrow">MAKE IT YOURS</p><h1>Connect your own intelligence.</h1><p>Add <code>OPENAI_API_KEY</code> to your server’s <code>.env.local</code> and restart the app to chat with a live model.</p><button className="primaryButton" onClick={() => start({ mode: "preview" })}>Explore the preview</button><a href="https://github.com/runtypelabs/persona/tree/main/examples/ai-sdk-next" target="_blank" rel="noreferrer">Read the setup guide ↗</a></div> : <PersonaWidget apiUrl={item.mode === "preview" ? `/api/preview/dispatch?adapter=${item.adapter}` : `/api/${item.adapter}/dispatch`} conversationId={item.id} onTitle={updateTitle} preview={item.mode === "preview"} />}
        </div>)}
        <footer className="workspaceFooter">{current.mode === "preview" ? "A guided preview with sample data. No live search or model calls." : "AI can make mistakes. Review important details."}<span className="persona-attribution"><a href="https://persona-chat.dev" target="_blank" rel="noreferrer"><img src="/persona-js-icon.svg" width="16" height="16" alt="" />Built with persona.js</a><span>· by <a href="https://runtype.com" target="_blank" rel="noreferrer">Runtype</a></span></span></footer>
      </section>
    </main>
  );
}
