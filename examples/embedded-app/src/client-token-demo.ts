import "@runtypelabs/persona/widget.css";

import {
  initAgentWidget,
  DEFAULT_WIDGET_CONFIG,
  markdownPostprocessor
} from "@runtypelabs/persona";
import type { ClientSession } from "@runtypelabs/persona";

// DOM Elements
const clientTokenInput = document.getElementById('client-token') as HTMLInputElement;
const flowIdInput = document.getElementById('flow-id') as HTMLInputElement;
const apiUrlInput = document.getElementById('api-url') as HTMLInputElement;
const initBtn = document.getElementById('init-btn') as HTMLButtonElement;
const clearBtn = document.getElementById('clear-btn') as HTMLButtonElement;
const sessionStatus = document.getElementById('session-status') as HTMLDivElement;
const sessionDetails = document.getElementById('session-details') as HTMLDivElement;
const sessionIdEl = document.getElementById('session-id') as HTMLSpanElement;
const sessionExpiresEl = document.getElementById('session-expires') as HTMLSpanElement;
const sessionFlowEl = document.getElementById('session-flow') as HTMLSpanElement;
const widgetRoot = document.getElementById('widget-root') as HTMLDivElement;

// Tab functionality
const tabs = document.querySelectorAll('.tab');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const tabId = tab.getAttribute('data-tab');
    
    // Update active tab
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update active content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`)?.classList.add('active');
  });
});

// Status UI helpers
function setStatus(status: 'idle' | 'initializing' | 'connected' | 'error', message: string) {
  sessionStatus.innerHTML = `
    <span class="status-indicator ${status}">
      <span class="status-dot"></span>
      ${message}
    </span>
  `;
}

function showSessionDetails(session: ClientSession) {
  sessionDetails.style.display = 'block';
  sessionIdEl.textContent = truncateSessionId(session.sessionId);
  sessionExpiresEl.textContent = formatExpiryTime(session.expiresAt);
  sessionFlowEl.textContent = session.flow.name || session.flow.id;
}

function truncateSessionId(id: string): string {
  if (id.length > 20) {
    return id.substring(0, 12) + '...' + id.substring(id.length - 6);
  }
  return id;
}

function formatExpiryTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const minutes = Math.floor(diff / 60000);
  
  if (minutes < 60) {
    return `${minutes}m remaining`;
  }
  
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m remaining`;
}

function hideSessionDetails() {
  sessionDetails.style.display = 'none';
}

// Widget controller reference
let widgetController: ReturnType<typeof initAgentWidget> | null = null;

// Initialize the widget with client token
function initializeWidget() {
  const clientToken = clientTokenInput.value.trim();
  
  if (!clientToken) {
    setStatus('error', 'Please enter a client token');
    return;
  }

  // Clean up existing widget
  if (widgetController) {
    widgetRoot.innerHTML = '';
    widgetController = null;
  }

  setStatus('initializing', 'Initializing session...');
  hideSessionDetails();

  // Build config - using Play Tailwind inspired colors
  const config: Record<string, unknown> = {
    ...DEFAULT_WIDGET_CONFIG,
    clientToken,
    launcher: {
      ...DEFAULT_WIDGET_CONFIG.launcher,
      enabled: false, // Embedded mode
      width: '100%'
    },
    theme: {
      ...DEFAULT_WIDGET_CONFIG.theme,
      primary: '#090E34',
      accent: '#3056D3',
      surface: '#ffffff',
      muted: '#637381',
      container: '#f3f4f6',
      border: '#e7e7e7'
    },
    copy: {
      ...DEFAULT_WIDGET_CONFIG.copy,
      welcomeTitle: 'Welcome! 👋',
      welcomeSubtitle: 'Connected via client token. Ask me anything!',
      inputPlaceholder: 'Type your message...'
    },
    suggestionChips: [
      'Hello!',
      'What can you help with?',
      'Tell me a joke'
    ],
    postprocessMessage: ({ text }: { text: string }) => markdownPostprocessor(text),
    onSessionInit: (session: ClientSession) => {
      console.log('[ClientTokenDemo] Session initialized:', session);
      setStatus('connected', 'Session active');
      showSessionDetails(session);
      
      // Apply welcome message from server config if available
      if (session.config.welcomeMessage) {
        console.log('[ClientTokenDemo] Server welcome:', session.config.welcomeMessage);
      }
      
      // Log server-provided theme
      if (session.config.theme) {
        console.log('[ClientTokenDemo] Server theme:', session.config.theme);
      }
    },
    onSessionExpired: () => {
      console.log('[ClientTokenDemo] Session expired');
      setStatus('error', 'Session expired - please refresh');
      hideSessionDetails();
    }
  };

  // Add optional flow ID
  const flowId = flowIdInput.value.trim();
  if (flowId) {
    config.flowId = flowId;
  }

  // Add optional API URL
  const apiUrl = apiUrlInput.value.trim();
  if (apiUrl) {
    config.apiUrl = apiUrl;
  }

  // Initialize the widget
  try {
    widgetController = initAgentWidget({
      target: widgetRoot,
      useShadowDom: false,
      config: config as any
    });

    // The session will be initialized automatically on first message,
    // or we can pre-initialize it to get the session info right away
    // This is handled by the onSessionInit callback above
    
  } catch (error) {
    console.error('[ClientTokenDemo] Failed to initialize:', error);
    setStatus('error', `Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Clear the widget and session
function clearWidget() {
  if (widgetController) {
    widgetRoot.innerHTML = '';
    widgetController = null;
  }
  setStatus('idle', 'Not initialized');
  hideSessionDetails();
}

// Event listeners
initBtn.addEventListener('click', initializeWidget);
clearBtn.addEventListener('click', clearWidget);

// Allow Enter key in token input to initialize
clientTokenInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    initializeWidget();
  }
});

// Initialize with demo values if running locally (for testing)
// In production, these would come from actual Travrse dashboard
if (window.location.hostname === 'localhost') {
  // You can pre-fill a test token here for local development
  // clientTokenInput.value = 'ct_test_...';
}

console.log('[ClientTokenDemo] Ready. Enter a client token to begin.');

