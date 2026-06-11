// WebMCP Calendar Copilot — adapted from WebMCP-org/chrome-devtools-quickstart
// (https://github.com/WebMCP-org/chrome-devtools-quickstart, MIT). The embedded
// Persona widget and Chrome DevTools MCP call the same WebMCP tools registered
// in ./calendar.js.
//
// @mcp-b/global must be imported before registering tools.
import '@mcp-b/global';
import '@runtypelabs/persona/widget.css';
import './style.css';

import {
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  initAgentWidget,
  markdownPostprocessor,
} from '@runtypelabs/persona';
import { READ_ONLY_TOOL_NAMES, setupCalendar } from './calendar.js';

const app = document.querySelector('#app');
setupCalendar(app);

// Proxy mode, like the other example demos — the agent is defined in code as
// WEBMCP_CALENDAR_FLOW (packages/proxy/src/flows/webmcp-calendar.ts) and the
// local proxy mounts it at /api/chat/dispatch-calendar (see
// examples/vercel-edge/src/server.ts). No hosted agent or client token needed.
const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyApiUrl = import.meta.env.VITE_PROXY_URL
  ? `${import.meta.env.VITE_PROXY_URL}/api/chat/dispatch-calendar`
  : `http://localhost:${proxyPort}/api/chat/dispatch-calendar`;

// `?mode=pill` mounts Persona as its native bottom composer-bar pill instead
// of the docked side panel — same WebMCP tools, different embedding style.
const isPillMode = new URLSearchParams(window.location.search).get('mode') === 'pill';
document.body.classList.toggle('persona-pill-mode', isPillMode);
const assistantToggle = document.querySelector('#assistant-toggle');
const personaPromptNote = document.querySelector('[data-persona-prompt-note]');
const personaPromptControls = document.querySelectorAll('[data-persona-prompt-input], [data-persona-prompt-submit]');

const calendarCopilotTheme = {
  palette: {
    colors: {
      primary: { 500: '#0f172a', 600: '#1e293b', 700: '#334155' },
      accent: { 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af' },
      gray: {
        50: '#ffffff',
        100: '#f8fafc',
        200: '#e2e8f0',
        300: '#cbd5e1',
        500: '#64748b',
        700: '#334155',
        900: '#0f172a',
      },
      success: { 500: '#059669' },
      warning: { 500: '#d97706' },
      error: { 500: '#dc2626' },
    },
    radius: {
      md: '0.5rem',
      lg: '0.75rem',
      xl: '1rem',
      '2xl': '1.25rem',
      full: '9999px',
    },
    typography: {
      fontFamily: {
        sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      },
    },
  },
  semantic: {
    colors: {
      primary: '#0f172a',
      accent: '#2563eb',
      surface: '#ffffff',
      background: '#ffffff',
      container: '#f8fafc',
      text: '#0f172a',
      textMuted: '#64748b',
      textInverse: '#ffffff',
      border: '#e2e8f0',
      divider: '#e2e8f0',
      interactive: {
        default: '#0f172a',
        hover: '#1e293b',
        focus: '#2563eb',
        active: '#020617',
      },
      feedback: {
        info: '#2563eb',
        success: '#059669',
        warning: '#d97706',
        error: '#dc2626',
      },
    },
  },
  components: {
    panel: {
      borderRadius: '0',
      border: 'none',
      shadow: 'none',
    },
    header: {
      borderRadius: '0',
      background: '#ffffff',
      titleForeground: '#0f172a',
      subtitleForeground: '#64748b',
      iconBackground: '#2563eb',
      iconForeground: '#ffffff',
      actionIconForeground: '#64748b',
      borderBottom: '1px solid #e2e8f0',
    },
    input: {
      background: '#ffffff',
      placeholder: '#94a3b8',
      border: '#dbe3ef',
      borderRadius: '24px',
      focus: {
        border: '#2563eb',
        ring: 'rgba(37, 99, 235, 0.12)',
      },
    },
    message: {
      user: {
        background: '#0f172a',
        text: '#ffffff',
        borderRadius: '18px',
        shadow: 'none',
      },
      assistant: {
        background: '#f8fafc',
        text: '#0f172a',
        border: '#e2e8f0',
        borderRadius: '18px',
        shadow: 'none',
      },
    },
    introCard: {
      background: '#ffffff',
      border: 'rgba(30, 41, 59, 0.08)',
      borderRadius: '24px',
      shadow: '0 22px 70px rgba(15, 23, 42, 0.09)',
    },
    approval: {
      requested: {
        background: '#ffffff',
        border: '#e2e8f0',
        text: '#0f172a',
      },
      approve: {
        background: '#0f172a',
        foreground: '#ffffff',
        border: '#0f172a',
        borderRadius: '999px',
      },
      deny: {
        background: '#ffffff',
        foreground: '#dc2626',
        border: '#e2e8f0',
        borderRadius: '999px',
      },
    },
    toolBubble: {
      shadow: 'none',
    },
    reasoningBubble: {
      shadow: 'none',
    },
    composer: {
      shadow: '0 14px 36px rgba(15, 23, 42, 0.07)',
    },
    markdown: {
      inlineCode: {
        background: '#eef2ff',
        foreground: '#3730a3',
      },
      link: {
        foreground: '#1d4ed8',
      },
    },
    collapsibleWidget: {
      container: '#f8fafc',
      surface: '#ffffff',
      border: '#e2e8f0',
    },
  },
};

const formatApprovalTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

// User-facing summary copy for tool approval bubbles. Returning undefined
// falls back to Persona's humanized default ("The assistant wants to use …").
const describeCalendarApproval = ({ toolName, parameters }) => {
  const params = parameters && typeof parameters === 'object' ? parameters : {};
  const name = String(toolName ?? '').replace(/^webmcp[:_]/, '');
  const when = params.startDate ? formatApprovalTime(params.startDate) : null;

  switch (name) {
    case 'create_event': {
      if (params.title && when) return `Add “${params.title}” to the calendar for ${when}?`;
      if (params.title) return `Add “${params.title}” to the calendar?`;
      return 'Add a new event to the calendar?';
    }
    case 'update_event': {
      const target = params.title
        ? `“${params.title}”`
        : params.eventId
          ? `event ${params.eventId}`
          : 'this event';
      return when ? `Update ${target} to start ${when}?` : `Update ${target}?`;
    }
    case 'delete_event':
      return params.eventId
        ? `Delete event ${params.eventId} from the calendar?`
        : 'Delete this event from the calendar?';
    case 'select_date':
      return params.date ? `Jump the calendar to ${params.date}?` : 'Move the calendar view?';
    default:
      return undefined;
  }
};

const setPersonaStatus = (message, tone = 'ready') => {
  const status = document.querySelector('[data-tool-status]');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
};

const syncToggleUi = (widget) => {
  if (!assistantToggle || !widget) return;
  const open = widget.getState?.().open ?? widget.isOpen?.() ?? false;
  assistantToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  assistantToggle.setAttribute('aria-label', open ? 'Hide Calendar Copilot' : 'Open Calendar Copilot');
  assistantToggle.title = open ? 'Hide Calendar Copilot' : 'Open Calendar Copilot';
  assistantToggle.classList.toggle('is-active', open);
  // In pill mode the expanded panel overlays the page, so the layout
  // simplification (header/prompt/quick-add collapse) only applies to docked.
  document.body.classList.toggle('copilot-open', open && !isPillMode);
};

const openAndFocus = (widget, message) => {
  widget.open();
  window.setTimeout(() => {
    if (message) {
      widget.setMessage?.(message);
    }
    widget.focusInput?.();
    syncToggleUi(widget);
  }, 180);
};

const submitAndExpand = (widget, message) => {
  const prompt = String(message ?? '').trim();
  if (!prompt) {
    openAndFocus(widget);
    return;
  }

  widget.open();
  setPersonaStatus('Submitting prompt to Calendar Copilot…', 'ready');

  const attemptSubmit = (attempt = 0) => {
    const submitted = widget.submitMessage?.(prompt) ?? false;
    syncToggleUi(widget);

    if (submitted) {
      setPersonaStatus('Calendar Copilot is working on the submitted prompt.', 'ready');
      return;
    }

    if (attempt < 4) {
      widget.setMessage?.(prompt);
      window.setTimeout(() => attemptSubmit(attempt + 1), 220);
      return;
    }

    widget.setMessage?.(prompt);
    widget.focusInput?.();
    setPersonaStatus('Calendar Copilot opened with the prompt ready to send.', 'ready');
  };

  window.setTimeout(() => attemptSubmit(), 240);
};

const setCompactPromptEnabled = (enabled, note) => {
  personaPromptControls.forEach((control) => {
    control.disabled = !enabled;
  });
  if (personaPromptNote && note) {
    personaPromptNote.textContent = note;
  }
};

const workspaceTarget = document.querySelector('#workspace-dock-target');

if (!workspaceTarget) {
  console.warn('[Calendar] Workspace dock target not found.');
  setCompactPromptEnabled(false, 'Calendar Copilot mount point is missing.');
} else {
  const widget = initAgentWidget({
    target: workspaceTarget,
    useShadowDom: false,
    config: {
      ...DEFAULT_WIDGET_CONFIG,
      apiUrl: proxyApiUrl,
      debug: true,
      storageAdapter: createLocalStorageAdapter('persona-state-calendar-copilot'),
      postprocessMessage: ({ text }) => markdownPostprocessor(text),
      colorScheme: 'light',
      theme: calendarCopilotTheme,
      copy: {
        ...DEFAULT_WIDGET_CONFIG.copy,
        welcomeTitle: 'Ask Calendar Copilot',
        welcomeSubtitle:
          'I can inspect availability, create events, and update this dashboard using the page’s WebMCP tools.',
        inputPlaceholder: 'Ask Copilot to schedule, move, or summarize events…',
      },
      suggestionChips: [
        'Create a Team Standup tomorrow at 10am',
        'Find a free 30 minute slot tomorrow',
        'What events are visible this week?',
        'Move Sprint Planning to Friday afternoon',
      ],
      suggestionChipsConfig: {
        fontWeight: '700',
      },
      launcher: {
        ...DEFAULT_WIDGET_CONFIG.launcher,
        mountMode: isPillMode ? 'composer-bar' : 'docked',
        ...(isPillMode
          ? {
              composerBar: {
                expandOnSubmit: true,
                expandedSize: 'anchored',
                bottomOffset: '16px',
              },
            }
          : {
              dock: {
                side: 'right',
                width: '440px',
                reveal: 'emerge',
                animate: true,
              },
            }),
        autoExpand: false,
        mobileBreakpoint: 1080,
        title: 'Calendar Copilot',
        subtitle: 'Scheduling assistant',
      },
      webmcp: {
        enabled: true,
        autoApprove: (info) => READ_ONLY_TOOL_NAMES.has(info.toolName),
      },
      features: {
        ...DEFAULT_WIDGET_CONFIG.features,
        // Advertise the built-in ask_user_question tool so Copilot can ask
        // structured clarifying questions (answer-pill sheet) mid-task.
        askUserQuestion: { expose: true },
      },
      approval: {
        ...DEFAULT_WIDGET_CONFIG.approval,
        title: 'Run calendar tool?',
        approveLabel: 'Run tool',
        denyLabel: 'Cancel',
        detailsDisplay: 'collapsed',
        formatDescription: describeCalendarApproval,
      },
      statusIndicator: {
        ...DEFAULT_WIDGET_CONFIG.statusIndicator,
        visible: true,
        idleText: 'Copilot can make mistakes. Verify calendar changes.',
        connectedText: 'Copilot can make mistakes. Verify calendar changes.',
        connectingText: 'Connecting Calendar Copilot…',
        errorText: 'Calendar Copilot connection error',
      },
      onSessionInit: (session) => {
        setPersonaStatus(`Calendar Copilot connected to ${session.flow?.name || 'WebMCP Calendar Flow'}.`, 'ready');
      },
      onSessionExpired: () => {
        setPersonaStatus('Calendar Copilot session expired — refresh the page to reconnect.', 'error');
      },
      onError: (error) => {
        console.error('[Calendar] Persona error', error);
      },
    },
  });

  assistantToggle?.addEventListener('click', () => {
    widget.toggle();
    window.setTimeout(() => {
      syncToggleUi(widget);
      if (widget.getState?.().open) {
        widget.focusInput?.();
      }
    }, 80);
  });

  widget.on('widget:opened', () => syncToggleUi(widget));
  widget.on('widget:closed', () => syncToggleUi(widget));
  window.addEventListener('calendar:open-copilot', () => openAndFocus(widget));
  window.addEventListener('calendar:suggest-prompt', (event) => {
    openAndFocus(widget, event.detail?.prompt);
  });
  window.addEventListener('calendar:submit-prompt', (event) => {
    submitAndExpand(widget, event.detail?.prompt);
  });

  syncToggleUi(widget);
  window.personaCalendarWidget = widget;
}
