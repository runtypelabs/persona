/**
 * Page Agent — injected into the page's main world.
 *
 * Has direct access to window.AgentWidgetBrowser and the Persona widget DOM.
 * Communicates with the content-script via window.postMessage.
 */
(function () {
  'use strict';

  // Prevent double-injection
  if (window.__personaDevtoolsAgent) return;
  window.__personaDevtoolsAgent = true;

  // ── Helpers ──

  function postToExtension(payload) {
    window.postMessage({ source: 'persona-devtools-page', payload }, '*');
  }

  function generateId() {
    return 'evt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  }

  // ── Widget Detection ──

  /** Recursively find all [data-persona-root] elements, including inside Shadow DOM */
  function findPersonaRoots(root) {
    root = root || document;
    const results = [];
    const directRoots = root.querySelectorAll('[data-persona-root]');
    directRoots.forEach((r) => results.push(r));

    // Traverse shadow roots
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) {
        results.push(...findPersonaRoots(el.shadowRoot));
      }
    });
    return results;
  }

  function getDebugApi() {
    return window.AgentWidgetBrowser || null;
  }

  function getController() {
    const api = getDebugApi();
    return api?.controller || null;
  }

  function detectWidgets() {
    const roots = findPersonaRoots();
    const debugApi = getDebugApi();

    return {
      widgetCount: roots.length,
      instances: roots.map((r) => ({
        instanceId: r.getAttribute('data-persona-instance') || r.id || '',
        hasDebugApi: !!debugApi,
      })),
      debugApiAvailable: !!debugApi,
    };
  }

  function broadcastDetection() {
    const info = detectWidgets();
    postToExtension({ type: 'WIDGETS_DETECTED', data: info });
  }

  // Initial detection
  broadcastDetection();

  // Watch for dynamically added widgets
  const observer = new MutationObserver(() => {
    broadcastDetection();
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── CSS Variable Reading ──

  function getWidgetRoot(instanceId) {
    if (instanceId) {
      return (
        document.querySelector(`[data-persona-instance="${instanceId}"]`) ||
        document.querySelector('[data-persona-root]')
      );
    }
    return document.querySelector('[data-persona-root]');
  }

  function getCssVars(instanceId) {
    const root = getWidgetRoot(instanceId);
    if (!root) return { vars: {}, overrides: {} };

    const computed = getComputedStyle(root);
    const inline = root.style;
    const vars = {};
    const overrides = {};

    // Read all --persona-* vars from computed style
    // Since we can't enumerate custom properties from computed style directly,
    // we need to check known variable names. We'll also check the inline styles.
    const knownVars = getKnownCssVarNames();
    for (const name of knownVars) {
      const val = computed.getPropertyValue(name).trim();
      if (val) {
        vars[name] = val;
      }
    }

    // Check inline overrides
    for (let i = 0; i < inline.length; i++) {
      const prop = inline[i];
      if (prop.startsWith('--persona-') || prop.startsWith('--cw-')) {
        overrides[prop] = inline.getPropertyValue(prop).trim();
      }
    }

    return { vars, overrides };
  }

  /** Known CSS variable names from the Persona widget */
  function getKnownCssVarNames() {
    return [
      // Convenience aliases
      '--persona-primary', '--persona-secondary', '--persona-accent',
      '--persona-surface', '--persona-background', '--persona-container',
      '--persona-text', '--persona-text-muted', '--persona-text-inverse',
      '--persona-border', '--persona-divider', '--persona-muted',
      // Typography
      '--persona-font-family', '--persona-font-size', '--persona-font-weight', '--persona-line-height',
      '--persona-input-font-family', '--persona-input-font-weight',
      // Radius
      '--persona-radius-sm', '--persona-radius-md', '--persona-radius-lg',
      '--persona-radius-xl', '--persona-radius-full',
      // Launcher
      '--persona-launcher-radius', '--persona-launcher-bg', '--persona-launcher-fg', '--persona-launcher-border',
      // Buttons
      '--persona-button-primary-bg', '--persona-button-primary-fg', '--persona-button-radius',
      // Panel
      '--persona-panel-radius', '--persona-panel-border', '--persona-panel-shadow',
      // Input
      '--persona-input-radius', '--persona-input-background', '--persona-input-placeholder',
      // Header
      '--persona-header-bg', '--persona-header-border',
      '--persona-header-icon-bg', '--persona-header-icon-fg',
      '--persona-header-title-fg', '--persona-header-subtitle-fg',
      '--persona-header-action-icon-fg',
      '--persona-header-shadow', '--persona-header-border-bottom',
      // Messages
      '--persona-message-user-radius', '--persona-message-user-bg',
      '--persona-message-user-text', '--persona-message-user-shadow',
      '--persona-message-assistant-radius', '--persona-message-assistant-bg',
      '--persona-message-assistant-text', '--persona-message-assistant-border',
      '--persona-message-assistant-shadow', '--persona-message-border',
      // Scroll to bottom
      '--persona-scroll-to-bottom-bg', '--persona-scroll-to-bottom-fg',
      '--persona-scroll-to-bottom-border', '--persona-scroll-to-bottom-size',
      '--persona-scroll-to-bottom-radius', '--persona-scroll-to-bottom-shadow',
      '--persona-scroll-to-bottom-padding', '--persona-scroll-to-bottom-gap',
      '--persona-scroll-to-bottom-font-size', '--persona-scroll-to-bottom-icon-size',
      // Bubbles / Composer
      '--persona-tool-bubble-shadow', '--persona-reasoning-bubble-shadow', '--persona-composer-shadow',
      // Markdown
      '--persona-md-inline-code-bg', '--persona-md-inline-code-color',
      '--persona-md-link-color', '--persona-md-h1-size', '--persona-md-h1-weight',
      '--persona-md-h2-size', '--persona-md-h2-weight',
      '--persona-md-prose-font-family',
      '--persona-md-code-block-bg', '--persona-md-code-block-border-color', '--persona-md-code-block-text-color',
      '--persona-md-table-header-bg', '--persona-md-table-border-color',
      '--persona-md-hr-color',
      '--persona-md-blockquote-border-color', '--persona-md-blockquote-bg', '--persona-md-blockquote-text-color',
      // Voice
      '--persona-voice-recording-indicator', '--persona-voice-recording-bg',
      '--persona-voice-processing-icon', '--persona-voice-speaking-icon',
      // Approval
      '--persona-approval-bg', '--persona-approval-border', '--persona-approval-text',
      '--persona-approval-approve-bg', '--persona-approval-deny-bg',
      // Attachment
      '--persona-attachment-image-bg', '--persona-attachment-image-border',
      // Collapsible widget
      '--cw-container', '--cw-surface', '--cw-border',
      // Icon button
      '--persona-icon-btn-bg', '--persona-icon-btn-border', '--persona-icon-btn-color',
      '--persona-icon-btn-padding', '--persona-icon-btn-radius',
      '--persona-icon-btn-hover-bg', '--persona-icon-btn-hover-color',
      '--persona-icon-btn-active-bg', '--persona-icon-btn-active-border',
      // Label button
      '--persona-label-btn-bg', '--persona-label-btn-border', '--persona-label-btn-color',
      '--persona-label-btn-padding', '--persona-label-btn-radius',
      '--persona-label-btn-hover-bg', '--persona-label-btn-font-size', '--persona-label-btn-gap',
    ];
  }

  // ── Theme Zone Inspection ──

  function getThemeZones(instanceId) {
    const root = getWidgetRoot(instanceId);
    if (!root) return [];

    const zones = [];
    const zoneEls = root.querySelectorAll('[data-persona-theme-zone]');
    zoneEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      zones.push({
        zone: el.getAttribute('data-persona-theme-zone'),
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        inShadowDom: el.getRootNode() !== document,
      });
    });
    return zones;
  }

  function getZoneComputedVars(instanceId, zoneName) {
    const root = getWidgetRoot(instanceId);
    if (!root) return {};

    const zoneEl = root.querySelector(`[data-persona-theme-zone="${zoneName}"]`);
    if (!zoneEl) return {};

    const computed = getComputedStyle(zoneEl);
    const vars = {};
    const names = getKnownCssVarNames();
    for (const name of names) {
      const val = computed.getPropertyValue(name).trim();
      if (val) vars[name] = val;
    }
    return vars;
  }

  // ── Element Highlight ──

  let highlightOverlay = null;

  function highlightElement(instanceId, zoneName) {
    clearHighlight();
    const root = getWidgetRoot(instanceId);
    if (!root) return;

    const el = zoneName
      ? root.querySelector(`[data-persona-theme-zone="${zoneName}"]`)
      : root;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    highlightOverlay = document.createElement('div');
    Object.assign(highlightOverlay.style, {
      position: 'fixed',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      background: 'rgba(59, 130, 246, 0.15)',
      border: '2px solid rgba(59, 130, 246, 0.8)',
      borderRadius: '2px',
      pointerEvents: 'none',
      zIndex: '2147483647',
      transition: 'all 0.15s ease',
    });
    document.body.appendChild(highlightOverlay);
  }

  function clearHighlight() {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
  }

  // ── State & Messages ──

  function getWidgetState() {
    const ctrl = getController();
    if (!ctrl) return null;
    return {
      state: typeof ctrl.getState === 'function' ? ctrl.getState() : null,
      status: typeof ctrl.getStatus === 'function' ? ctrl.getStatus() : null,
    };
  }

  function getMessages() {
    const api = getDebugApi();
    if (!api) return null;
    const msgs = typeof api.getMessages === 'function' ? api.getMessages() : [];
    // Serialize for postMessage (strip non-cloneable data)
    return JSON.parse(JSON.stringify(msgs));
  }

  function getMetadata() {
    const api = getDebugApi();
    if (!api) return null;
    const meta = typeof api.getMetadata === 'function' ? api.getMetadata() : {};
    return JSON.parse(JSON.stringify(meta));
  }

  // ── Event Subscriptions ──

  let eventSubscribed = false;
  let sseCapturing = false;
  let ssePaused = false;

  function subscribeControllerEvents() {
    if (eventSubscribed) return;
    const ctrl = getController();
    if (!ctrl || typeof ctrl.on !== 'function') return;

    const events = [
      'widget:state', 'user:message', 'assistant:message', 'assistant:complete',
      'message:feedback', 'approval:requested', 'approval:resolved',
    ];
    events.forEach((evtName) => {
      ctrl.on(evtName, (payload) => {
        postToExtension({
          type: 'STATE_UPDATE',
          data: {
            event: evtName,
            payload: JSON.parse(JSON.stringify(payload)),
            timestamp: Date.now(),
          },
        });
      });
    });
    eventSubscribed = true;
  }

  function startSseCapture() {
    if (sseCapturing) return;
    const ctrl = getController();
    if (!ctrl) return;

    // Try to access the client's SSE callback via the debug API
    // The controller should have a way to set the SSE event callback
    if (typeof ctrl.setSSEEventCallback === 'function') {
      ctrl.setSSEEventCallback((type, payload) => {
        if (ssePaused) return;
        postToExtension({
          type: 'SSE_EVENT',
          data: {
            id: generateId(),
            type: type,
            timestamp: Date.now(),
            payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
          },
        });
      });
      sseCapturing = true;
    }
  }

  // ── Config ──

  function getWidgetConfig() {
    const ctrl = getController();
    if (!ctrl) return null;
    // The controller may expose config via getState or internal access
    // Try accessing through the debug API
    try {
      // Controller's update method hints at internal config
      // Best-effort: return what we can serialize
      const state = typeof ctrl.getState === 'function' ? ctrl.getState() : {};
      return JSON.parse(JSON.stringify(state));
    } catch {
      return null;
    }
  }

  // ── Widget Actions ──

  function executeWidgetAction(action, args) {
    const ctrl = getController();
    if (!ctrl) return { error: 'No controller available' };

    switch (action) {
      case 'open':
        ctrl.open?.();
        return { ok: true };
      case 'close':
        ctrl.close?.();
        return { ok: true };
      case 'toggle':
        ctrl.toggle?.();
        return { ok: true };
      case 'clearChat':
        ctrl.clearChat?.();
        return { ok: true };
      case 'sendMessage':
        ctrl.sendMessage?.(args?.text || 'Test message');
        return { ok: true };
      default:
        return { error: 'Unknown action: ' + action };
    }
  }

  // ── Command Handler ──

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'persona-devtools-cs') return;

    const msg = event.data.payload;
    if (!msg || !msg.type) return;

    const instanceId = msg.instanceId || '';
    let response = null;

    switch (msg.type) {
      case 'DETECT_WIDGETS':
        broadcastDetection();
        break;

      case 'GET_CSS_VARS':
        response = getCssVars(instanceId);
        postToExtension({ type: 'CSS_VARS', data: response, requestId: msg.requestId });
        break;

      case 'SET_CSS_VAR': {
        const root = getWidgetRoot(instanceId);
        if (root && msg.varName && msg.value != null) {
          root.style.setProperty(msg.varName, msg.value);
        }
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;
      }

      case 'RESET_CSS_VAR': {
        const root = getWidgetRoot(instanceId);
        if (root && msg.varName) {
          root.style.removeProperty(msg.varName);
        }
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;
      }

      case 'RESET_ALL_CSS_VARS': {
        const root = getWidgetRoot(instanceId);
        if (root) {
          const toRemove = [];
          for (let i = 0; i < root.style.length; i++) {
            const prop = root.style[i];
            if (prop.startsWith('--persona-') || prop.startsWith('--cw-')) {
              toRemove.push(prop);
            }
          }
          toRemove.forEach((p) => root.style.removeProperty(p));
        }
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;
      }

      case 'IMPORT_THEME': {
        // msg.vars is a Record<string, string> of CSS variable name -> value
        const root = getWidgetRoot(instanceId);
        if (root && msg.vars) {
          Object.entries(msg.vars).forEach(([name, val]) => {
            root.style.setProperty(name, val);
          });
        }
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;
      }

      case 'GET_STATE':
        response = getWidgetState();
        postToExtension({ type: 'STATE_UPDATE', data: { event: 'snapshot', payload: response }, requestId: msg.requestId });
        break;

      case 'GET_MESSAGES':
        response = getMessages();
        postToExtension({ type: 'MESSAGES_UPDATE', data: response, requestId: msg.requestId });
        break;

      case 'GET_METADATA':
        response = getMetadata();
        postToExtension({ type: 'METADATA', data: response, requestId: msg.requestId });
        break;

      case 'SUBSCRIBE_EVENTS':
        subscribeControllerEvents();
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;

      case 'CAPTURE_SSE':
        startSseCapture();
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;

      case 'PAUSE_SSE':
        ssePaused = !!msg.paused;
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;

      case 'CLEAR_SSE':
        // Client-side clear — the panel manages its own buffer
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;

      case 'GET_CONFIG':
        response = getWidgetConfig();
        postToExtension({ type: 'CONFIG', data: response, requestId: msg.requestId });
        break;

      case 'UPDATE_CONFIG': {
        const ctrl = getController();
        if (ctrl && typeof ctrl.update === 'function' && msg.config) {
          ctrl.update(msg.config);
        }
        postToExtension({ type: 'RESPONSE', data: { ok: true }, requestId: msg.requestId });
        break;
      }

      case 'GET_THEME_ZONES':
        response = getThemeZones(instanceId);
        postToExtension({ type: 'THEME_ZONES', data: response, requestId: msg.requestId });
        break;

      case 'GET_ZONE_VARS':
        response = getZoneComputedVars(instanceId, msg.zoneName);
        postToExtension({ type: 'ZONE_VARS', data: response, requestId: msg.requestId });
        break;

      case 'HIGHLIGHT_ELEMENT':
        highlightElement(instanceId, msg.zoneName);
        break;

      case 'CLEAR_HIGHLIGHT':
        clearHighlight();
        break;

      case 'WIDGET_ACTION':
        response = executeWidgetAction(msg.action, msg.args);
        postToExtension({ type: 'RESPONSE', data: response, requestId: msg.requestId });
        break;
    }
  });
})();
