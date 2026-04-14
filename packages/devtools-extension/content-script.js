/**
 * Content script — bridges the extension (background/panel) and the page-agent.
 *
 * Runs in the content script isolated world. Injects page-agent.js into the
 * page's main world so it can access window.AgentWidgetBrowser.
 */

// ── Inject page-agent into main world ──

function injectPageAgent() {
  if (document.querySelector('script[data-persona-devtools-agent]')) return;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('page-agent.js');
  script.dataset.personaDevtoolsAgent = 'true';
  (document.head || document.documentElement).appendChild(script);
}

injectPageAgent();

// ── Port to background service worker ──

let bgPort = null;

function ensurePort() {
  if (bgPort) return bgPort;
  bgPort = chrome.runtime.connect({ name: 'persona-devtools-content' });
  bgPort.onDisconnect.addListener(() => {
    bgPort = null;
  });

  // Messages from panel (via background) -> forward to page agent
  bgPort.onMessage.addListener((msg) => {
    window.postMessage({
      source: 'persona-devtools-cs',
      payload: msg,
    }, '*');
  });

  return bgPort;
}

ensurePort();

// ── Listen for messages from page-agent ──

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!event.data || event.data.source !== 'persona-devtools-page') return;

  const msg = event.data.payload;
  if (!msg) return;

  // Forward to background -> panel
  try {
    const port = ensurePort();
    port.postMessage(msg);
  } catch {
    // Port disconnected, try to reconnect on next message
    bgPort = null;
  }
});
