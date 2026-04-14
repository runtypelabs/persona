/**
 * Message protocol constants shared between panel, background, content-script, and page-agent.
 */

// Sources used in window.postMessage to identify our messages
export const SOURCE_CONTENT_SCRIPT = 'persona-devtools-cs';
export const SOURCE_PAGE_AGENT = 'persona-devtools-page';

// Port names for chrome.runtime.connect
export const PORT_PANEL = 'persona-devtools-panel';
export const PORT_CONTENT = 'persona-devtools-content';

// ── Command types (Panel -> Page Agent) ──

export const CMD_DETECT_WIDGETS = 'DETECT_WIDGETS';

// Theme
export const CMD_GET_CSS_VARS = 'GET_CSS_VARS';
export const CMD_SET_CSS_VAR = 'SET_CSS_VAR';
export const CMD_RESET_CSS_VAR = 'RESET_CSS_VAR';
export const CMD_RESET_ALL_CSS_VARS = 'RESET_ALL_CSS_VARS';
export const CMD_IMPORT_THEME = 'IMPORT_THEME';

// State
export const CMD_GET_STATE = 'GET_STATE';
export const CMD_GET_MESSAGES = 'GET_MESSAGES';
export const CMD_GET_METADATA = 'GET_METADATA';
export const CMD_SUBSCRIBE_EVENTS = 'SUBSCRIBE_EVENTS';
export const CMD_WIDGET_ACTION = 'WIDGET_ACTION'; // open, close, clearChat, sendMessage

// Events
export const CMD_CAPTURE_SSE = 'CAPTURE_SSE';
export const CMD_PAUSE_SSE = 'PAUSE_SSE';
export const CMD_CLEAR_SSE = 'CLEAR_SSE';

// Config
export const CMD_GET_CONFIG = 'GET_CONFIG';
export const CMD_UPDATE_CONFIG = 'UPDATE_CONFIG';

// Elements
export const CMD_GET_THEME_ZONES = 'GET_THEME_ZONES';
export const CMD_HIGHLIGHT_ELEMENT = 'HIGHLIGHT_ELEMENT';
export const CMD_CLEAR_HIGHLIGHT = 'CLEAR_HIGHLIGHT';
export const CMD_GET_ZONE_VARS = 'GET_ZONE_VARS';

// ── Event types (Page Agent -> Panel) ──

export const EVT_WIDGETS_DETECTED = 'WIDGETS_DETECTED';
export const EVT_WIDGET_REMOVED = 'WIDGET_REMOVED';
export const EVT_CSS_VARS = 'CSS_VARS';
export const EVT_STATE_UPDATE = 'STATE_UPDATE';
export const EVT_MESSAGES_UPDATE = 'MESSAGES_UPDATE';
export const EVT_MESSAGE_ADDED = 'MESSAGE_ADDED';
export const EVT_MESSAGE_COMPLETE = 'MESSAGE_COMPLETE';
export const EVT_SSE_EVENT = 'SSE_EVENT';
export const EVT_CONFIG = 'CONFIG';
export const EVT_THEME_ZONES = 'THEME_ZONES';
export const EVT_ZONE_VARS = 'ZONE_VARS';
export const EVT_METADATA = 'METADATA';
export const EVT_RESPONSE = 'RESPONSE'; // Generic response wrapper
