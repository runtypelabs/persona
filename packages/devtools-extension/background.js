/**
 * MV3 Service Worker — routes messages between DevTools panel and content scripts.
 *
 * Maintains a map of tabId -> panel port so content-script messages
 * can be forwarded to the correct DevTools panel instance.
 */

/** @type {Map<number, chrome.runtime.Port>} */
const panelPorts = new Map();

/** @type {Map<number, chrome.runtime.Port>} */
const contentPorts = new Map();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'persona-devtools-panel') {
    // Panel connection — extract the tab ID from the first message
    port.onMessage.addListener(function onFirst(msg) {
      if (msg.type === 'INIT' && typeof msg.tabId === 'number') {
        const tabId = msg.tabId;
        panelPorts.set(tabId, port);

        port.onDisconnect.addListener(() => {
          panelPorts.delete(tabId);
        });

        // Remove this one-time listener
        port.onMessage.removeListener(onFirst);

        // Forward subsequent panel messages to the content script
        port.onMessage.addListener((msg) => {
          chrome.tabs.sendMessage(tabId, msg).catch(() => {
            // Content script may not be ready yet
          });
        });

        // If the content script is already connected, notify it
        const cp = contentPorts.get(tabId);
        if (cp) {
          cp.postMessage({ type: 'PANEL_CONNECTED' });
        }
      }
    });
    return;
  }

  if (port.name === 'persona-devtools-content') {
    const tabId = port.sender?.tab?.id;
    if (typeof tabId !== 'number') return;

    contentPorts.set(tabId, port);

    port.onDisconnect.addListener(() => {
      contentPorts.delete(tabId);
    });

    // Forward content-script messages to the panel
    port.onMessage.addListener((msg) => {
      const pp = panelPorts.get(tabId);
      if (pp) {
        pp.postMessage(msg);
      }
    });
  }
});

// Also handle one-shot messages from the content script (for initial detection)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!sender.tab?.id) return;
  const tabId = sender.tab.id;
  const pp = panelPorts.get(tabId);
  if (pp) {
    pp.postMessage(msg);
  }
  sendResponse({ ok: true });
});
