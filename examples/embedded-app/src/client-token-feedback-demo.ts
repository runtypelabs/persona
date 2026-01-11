import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  DEFAULT_WIDGET_CONFIG,
  markdownPostprocessor
} from "@runtypelabs/persona";
import type { ClientSession, AgentWidgetMessageFeedback, AgentWidgetMessage } from "@runtypelabs/persona";

// Proxy URL for demo mode
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL
    ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch`
    : `http://localhost:${proxyPort}/api/chat/dispatch`;

// DOM Elements
const demoModeCheckbox = document.getElementById('demo-mode') as HTMLInputElement;
const clientTokenInput = document.getElementById('client-token') as HTMLInputElement;
const apiUrlInput = document.getElementById('api-url') as HTMLInputElement;
const tokenGroup = document.getElementById('token-group') as HTMLDivElement;
const apiUrlGroup = document.getElementById('api-url-group') as HTMLDivElement;
const initBtn = document.getElementById('init-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const widgetRoot = document.getElementById('widget-root') as HTMLDivElement;
const apiLogEl = document.getElementById('api-log') as HTMLDivElement;
const clearLogBtn = document.getElementById('clear-log') as HTMLButtonElement;

// Widget controller reference
let widgetController: ReturnType<typeof initAgentWidget> | null = null;

// Log API requests
const apiLogs: Array<{ time: string; method: string; endpoint: string; body: string }> = [];

function addLogEntry(method: string, endpoint: string, body: Record<string, unknown>) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  
  apiLogs.unshift({
    time,
    method,
    endpoint,
    body: JSON.stringify(body)
  });

  // Keep only last 20 entries
  while (apiLogs.length > 20) {
    apiLogs.pop();
  }

  renderApiLog();
}

function renderApiLog() {
  if (apiLogs.length === 0) {
    apiLogEl.innerHTML = `
      <div class="api-log-empty">
        Feedback requests will appear here when you upvote, downvote, or copy messages.
      </div>
    `;
    return;
  }

  apiLogEl.innerHTML = apiLogs.map(log => `
    <div class="api-log-entry">
      <span class="api-log-time">${log.time}</span>
      <span class="api-log-method">${log.method}</span>
      <span class="api-log-endpoint">${log.endpoint}</span>
      <span class="api-log-body">${log.body}</span>
    </div>
  `).join('');
}

function clearLog() {
  apiLogs.length = 0;
  renderApiLog();
}

// Status UI
function setStatus(status: 'idle' | 'initializing' | 'connected' | 'error', message: string) {
  statusEl.className = `status ${status}`;
  statusText.textContent = message;
}

// Toggle demo mode fields
function updateModeFields() {
  const isDemoMode = demoModeCheckbox.checked;
  tokenGroup.classList.toggle('hidden', isDemoMode);
  apiUrlGroup.classList.toggle('hidden', isDemoMode);
}

// Initialize widget
function initializeWidget() {
  const isDemoMode = demoModeCheckbox.checked;
  const clientToken = clientTokenInput.value.trim();
  
  if (!isDemoMode && !clientToken) {
    setStatus('error', 'Please enter a client token or enable Demo Mode');
    return;
  }

  // Clean up existing widget
  if (widgetController) {
    widgetRoot.innerHTML = '';
    widgetController = null;
  }

  setStatus('initializing', 'Initializing...');
  clearLog();

  // Get optional API URL (for client token mode)
  const apiUrl = apiUrlInput.value.trim();

  try {
    // Build config based on mode
    const config: Record<string, unknown> = {
      ...DEFAULT_WIDGET_CONFIG,
      debug: true,
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        enabled: false,
        width: '100%'
      },
      theme: {
        ...DEFAULT_WIDGET_CONFIG.theme,
        primary: '#0f172a',
        accent: '#0d9488',
        surface: '#ffffff',
        muted: '#64748b',
        container: '#f8fafc',
        border: '#e2e8f0'
      },
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: 'Feedback Demo 👍',
        welcomeSubtitle: isDemoMode 
          ? 'Demo mode: Chat works, feedback logged locally'
          : 'Try the feedback buttons on my responses!',
        inputPlaceholder: 'Ask me anything...'
      },
      suggestionChips: [
        'Tell me a joke',
        'What is the meaning of life?',
        'Write a haiku'
      ],
      
      // ✨ THE KEY PART: Just enable the buttons!
      messageActions: {
        enabled: true,
        showCopy: true,
        showUpvote: true,
        showDownvote: true,
        visibility: 'hover',
        
        // Callback for logging (in demo mode, this is all we have)
        // In client token mode, the SDK ALSO sends to the backend automatically!
        // onFeedback: (feedback: AgentWidgetMessageFeedback) => {
        //   const endpoint = isDemoMode ? '(demo - local only)' : '/v1/client/feedback';
        //   addLogEntry('POST', endpoint, {
        //     type: feedback.type,
        //     message_id: feedback.messageId,
        //     session_id: isDemoMode ? '(demo)' : '(from session)'
        //   });
        //   console.log('[Demo] Feedback:', feedback.type, feedback.messageId);
        // },
        onCopy: (message: AgentWidgetMessage) => {
          const endpoint = isDemoMode ? '(demo - local only)' : '/v1/client/feedback';
          addLogEntry('POST', endpoint, {
            type: 'copy',
            message_id: message.id,
            session_id: isDemoMode ? '(demo)' : '(from session)'
          });
          console.log('[Demo] Copy:', message.id);
        }
      },
      
      postprocessMessage: ({ text }: { text: string }) => markdownPostprocessor(text),
    };

    if (isDemoMode) {
      // Demo mode: use local proxy
      config.apiUrl = proxyUrl;
      setStatus('connected', 'Demo Mode • Using local proxy');
    } else {
      // Client token mode: use real API
      config.clientToken = clientToken;
      if (apiUrl) {
        config.apiUrl = apiUrl;
      }
      config.onSessionInit = (session: ClientSession) => {
        console.log('[Demo] Session initialized:', session.sessionId);
        setStatus('connected', `Connected • ${session.flow.name || 'Flow'}`);
      };
      config.onSessionExpired = () => {
        console.log('[Demo] Session expired');
        setStatus('error', 'Session expired - please refresh');
      };
    }

    widgetController = initAgentWidget({
      target: widgetRoot,
      useShadowDom: false,
      config: config as Parameters<typeof initAgentWidget>[0]['config']
    });

  } catch (error) {
    console.error('[Demo] Failed to initialize:', error);
    setStatus('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Event listeners
demoModeCheckbox.addEventListener('change', updateModeFields);
initBtn.addEventListener('click', initializeWidget);
clearLogBtn.addEventListener('click', clearLog);

clientTokenInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    initializeWidget();
  }
});

// Initialize UI
updateModeFields();

// Auto-initialize in demo mode for convenience
if (demoModeCheckbox.checked) {
  // Small delay to ensure DOM is ready
  setTimeout(initializeWidget, 100);
}

console.log('[ClientTokenFeedbackDemo] Ready.');
console.log('[ClientTokenFeedbackDemo] Demo Mode uses local proxy. Uncheck to use real client token.');
console.log('[ClientTokenFeedbackDemo] With client token, feedback is sent to backend automatically!');
