import "@runtypelabs/persona/widget.css";
import "./index.css";

import {
  initAgentWidget,
  type AgentWidgetMessage,
  type AgentWidgetConfig,
  type AgentWidgetStreamParser,
  type AgentWidgetStreamParserResult,
  markdownPostprocessor,
  DEFAULT_WIDGET_CONFIG,
  createLocalStorageAdapter,
  defaultActionHandlers
} from "@runtypelabs/persona";
import {
  collectPageContext,
  formatPageContext,
  parseActionResponse,
  executeAction,
  loadChatHistory,
  loadExecutedActionIds,
  saveExecutedActionId,
  checkNavigationFlag,
  STORAGE_KEY
} from "./middleware";
import { createFlexibleJsonStreamParser } from "@runtypelabs/persona";
// Import types directly from the widget package
import type {
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState,
  AgentWidgetRequestPayload,
  AgentWidgetActionHandler
} from "../../../packages/widget/src/types";

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ??
  `http://localhost:${proxyPort}/api/chat/dispatch-action`;

// Create a context provider that collects page context for metadata
const pageContextProvider = () => {
  const elements = collectPageContext();
  const formattedContext = formatPageContext(elements);
  
  // Return context in a format suitable for metadata
  return {
    page_elements: elements.slice(0, 50), // Limit to first 50 elements
    page_element_count: elements.length,
    page_context: formattedContext,
    page_url: window.location.href,
    page_title: document.title,
    timestamp: new Date().toISOString()
  };
};

// Load chat history from localStorage
let savedMessages = loadChatHistory();

// Create a custom storage adapter that syncs our executedActionIds with widget SDK metadata
// This wraps the widget SDK's storage adapter to sync our data structure
const createSyncedStorageAdapter = () => {
  const baseAdapter = createLocalStorageAdapter(STORAGE_KEY);

  return {
    load: () => {
      try {
        const stored = baseAdapter.load?.();
        if (!stored || typeof stored !== 'object' || 'then' in stored) {
          return null;
        }

        const parsed = stored as Record<string, unknown>;

        // Check if this is widget SDK format (has 'messages') or old custom format (has 'chatHistory')
        if (Array.isArray(parsed.messages)) {
          // Widget SDK format
          const widgetProcessedIds = Array.isArray((parsed.metadata as Record<string, unknown>)?.processedActionMessageIds)
            ? (parsed.metadata as Record<string, unknown>).processedActionMessageIds as string[]
            : [];
          widgetProcessedIds.forEach(id => processedActionIds.add(id));
          return stored as AgentWidgetStoredState;
        }

        // Old custom format - convert to widget format
        if (Array.isArray(parsed.chatHistory) || Array.isArray(parsed.executedActionIds)) {
          const processedIds = Array.isArray(parsed.executedActionIds)
            ? parsed.executedActionIds as string[]
            : [];
          processedIds.forEach(id => processedActionIds.add(id));
          return {
            messages: (parsed.chatHistory as any[]) || [],
            metadata: {
              processedActionMessageIds: processedIds
            }
          };
        }

        // Plain array of messages (legacy)
        if (Array.isArray(parsed)) {
          return {
            messages: parsed,
            metadata: { processedActionMessageIds: [] }
          };
        }

        return null;
      } catch (error) {
        console.error("[Storage Adapter] Failed to load:", error);
        return null;
      }
    },
    save: (state: AgentWidgetStoredState) => {
      try {
        // Save using widget SDK's format (includes messages and metadata.processedActionMessageIds)
        baseAdapter.save?.(state);

        // Update our in-memory Set from the saved state
        const widgetProcessedIds = Array.isArray(state.metadata?.processedActionMessageIds)
          ? state.metadata.processedActionMessageIds as string[]
          : [];
        widgetProcessedIds.forEach(id => processedActionIds.add(id));
      } catch (error) {
        console.error("[Storage Adapter] Failed to save:", error);
      }
    },
    clear: () => {
      try {
        baseAdapter.clear?.();
        processedActionIds.clear();
      } catch (error) {
        console.error("[Storage Adapter] Failed to clear:", error);
      }
    }
  };
};

// Check for navigation flag and auto-open if needed
const navMessage = checkNavigationFlag();
const shouldAutoOpen = navMessage !== null;

// If we have a navigation message, add it as an initial assistant message
// But only add it once - check if it's already in savedMessages to prevent duplicates
if (navMessage) {
  const navMessageExists = savedMessages.some(msg => 
    msg.role === "assistant" && msg.content === navMessage
  );
  
  if (!navMessageExists) {
    const navMessageObj: AgentWidgetMessage = {
      id: `nav-${Date.now()}`,
      role: "assistant",
      content: navMessage,
      createdAt: new Date().toISOString(),
      streaming: false
    };
    savedMessages = [...savedMessages, navMessageObj];
  }
}

// Load previously executed action IDs from localStorage (for syncing with widget SDK metadata)
let processedActionIds = new Set<string>(loadExecutedActionIds());
console.log("[Action Middleware] Loaded processedActionIds:", Array.from(processedActionIds));
console.log("[Action Middleware] Loaded savedMessages:", savedMessages.map(m => ({ id: m.id, role: m.role, hasRawContent: !!m.rawContent })));
// Debug: Check localStorage structure
try {
  const stored = localStorage.getItem("persona-action-middleware");
  if (stored) {
    const parsed = JSON.parse(stored);
    console.log("[Action Middleware] localStorage structure:", {
      isArray: Array.isArray(parsed),
      hasExecutedActionIds: !Array.isArray(parsed) && parsed.executedActionIds,
      executedActionIdsCount: !Array.isArray(parsed) ? (parsed.executedActionIds?.length || 0) : 0
    });
  }
} catch (e) {
  console.error("[Action Middleware] Failed to inspect localStorage:", e);
}
// Store raw JSON for action parsing (map by message ID)
let rawJsonByMessageId = new Map<string, string>();

// Store the last raw JSON globally (will be associated with message ID in postprocessMessage)
let lastRawJson: string | null = null;

// Create a custom parser that wraps the flexible JSON parser and stores raw content
const createActionAwareParser = (): AgentWidgetStreamParser => {
  // Use the flexible parser with custom text extraction logic
  const baseParser = createFlexibleJsonStreamParser((parsed) => {
    if (!parsed || typeof parsed !== 'object') return null;
    
    // Custom text extraction based on action type
    if (parsed.action === 'nav_then_click') {
      return parsed.on_load_text || parsed.text || 'Navigating...';
    } else if (parsed.action === 'message') {
      return parsed.text || '';
    } else if (parsed.action === 'message_and_click') {
      return parsed.text || 'Processing...';
    } else if (parsed.action === 'checkout') {
      return parsed.text || 'Setting up checkout...';
    }
    
    // Fallback to common text fields
    return parsed.text || parsed.display_text || parsed.message || null;
  });
  
  return {
    processChunk: (accumulatedContent: string): AgentWidgetStreamParserResult | string | null | Promise<AgentWidgetStreamParserResult | string | null> => {
      // Call the base parser
      const result = baseParser.processChunk(accumulatedContent);
      
      // Handle async result
      if (result instanceof Promise) {
        return result.then((resolvedResult) => {
          // Store the raw JSON for action parsing
          if (resolvedResult && typeof resolvedResult === 'object' && 'raw' in resolvedResult && resolvedResult.raw) {
            lastRawJson = resolvedResult.raw;
            console.log("[Parser] Stored raw JSON, length:", resolvedResult.raw.length);
          }
          return resolvedResult;
        });
      }
      
      // Handle synchronous result
      if (result && typeof result === 'object' && 'raw' in result && result.raw) {
        lastRawJson = result.raw;
        console.log("[Parser] Stored raw JSON, length:", result.raw.length);
      }
      
      return result;
    },
    getExtractedText: () => baseParser.getExtractedText(),
    close: () => {
      // Clear the raw JSON when parsing is complete
      lastRawJson = null;
      return baseParser.close?.();
    }
  };
};

// Custom checkout handler that uses executeAction from middleware
// Note: Action manager prevents re-execution via processedActionMessageIds
const checkoutHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "checkout") return;

  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const items = payload.items as Array<{ name: string; price: number; quantity: number }> | undefined;

  if (items && Array.isArray(items)) {
    // Use executeAction from middleware.ts which already has checkout logic
    executeAction(
      { action: "checkout", text, items },
      () => {} // onMessage callback - text is already displayed by widget
    );
  }

  return {
    handled: true,
    displayText: text
  };
};

// Create a custom config with middleware hooks
const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  initialMessages: savedMessages.length > 0 ? savedMessages : undefined,
  clearChatHistoryStorageKey: "persona-action-middleware",  // Automatically clear localStorage on clear chat
  streamParser: createActionAwareParser,  // Use our custom parser that provides both text and raw
  // Use widget SDK's default action handlers - they work with the action manager's built-in deduplication
  actionHandlers: [
    defaultActionHandlers.message,
    defaultActionHandlers.messageAndClick,
    checkoutHandler
  ],
  // Use custom storage adapter that syncs our executedActionIds with widget SDK metadata
  storageAdapter: createSyncedStorageAdapter(),
  // Add context provider to send DOM content in metadata
  contextProviders: [pageContextProvider],
  // Move context to metadata in request (like sample.html)
  requestMiddleware: ({ payload }) => {
    if (payload.context) {
      // Return a new payload with metadata instead of context
      return {
        ...payload,
        metadata: payload.context,
        context: undefined
      } as AgentWidgetRequestPayload & { metadata?: Record<string, unknown> };
    }
    return payload;
  },
  launcher: {
    ...DEFAULT_WIDGET_CONFIG.launcher,
    enabled: true,
    autoExpand: shouldAutoOpen,
    width: "min(920px, 95vw)",
    title: "Shopping Assistant",
    subtitle: "I can help you find products and add them to your cart",
    agentIconText: "🛍️"
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#111827",
    accent: "#0ea5e9",
    surface: "#ffffff",
    muted: "#64748b"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle: "Hi, what can I help you with?",
    welcomeSubtitle: "Try asking for products or adding items to your cart",
    inputPlaceholder: "Type your message…",
    sendButtonLabel: "Send"
  },
  suggestionChips: [
    "I am looking for a black shirt in medium",
    "Show me available products",
    "Add an item to cart"
  ],
  postprocessMessage: ({ text, streaming, message }) => {
    console.log("[Action Middleware] postprocessMessage called:", { 
      role: message.role, 
      streaming, 
      textLength: text.length,
      textPreview: text.substring(0, 100),
      messageId: message.id
    });
    
    // Note: Message persistence is handled automatically by the widget SDK's storage adapter
    // No need to manually save here - the widget SDK saves messages and metadata automatically
    
    // Note: Action execution is now handled by the widget SDK's action manager and default handlers
    // The widget SDK automatically prevents re-execution via processedActionMessageIds in metadata
    // We only need to handle custom actions (like nav_then_click) if needed
    
    // For streaming of non-JSON or no action: return text as-is (the parser already extracted any needed text)
    // For non-assistant messages: return as-is
    return markdownPostprocessor(text);
  },
  debug: true
};

// Initialize widget
const widgetController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config,
  onReady: () => {
    // Handle navigation message after widget is ready
    if (navMessage && shouldAutoOpen) {
      setTimeout(() => {
        widgetController.open();
      }, 300);
    }
  }
});

// Clear in-memory state when chat is cleared
// (localStorage is automatically cleared via clearChatHistoryStorageKey config option)
window.addEventListener("persona:clear-chat", () => {
  console.log("[Action Middleware] Clear chat event received, clearing in-memory state");
  processedActionIds.clear();
  rawJsonByMessageId.clear();
});

// Expose controller for debugging
(window as any).widgetController = widgetController;
