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
  loadExecutedActionIds,
  saveExecutedActionId,
  checkNavigationFlag,
  STORAGE_KEY,
  // Order-related imports
  checkCheckoutReturn,
  clearCheckoutQueryParams,
  loadOrder,
  updateOrderStatus,
  cleanupExpiredOrders,
  clearOrder,
  type OrderData
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

// ============================================================================
// Order State Management
// ============================================================================

// Clean up expired orders on page load
cleanupExpiredOrders();

// Check if user is returning from checkout
const checkoutReturn = checkCheckoutReturn();
let orderContextMessage: string | null = null;

if (checkoutReturn.status) {
  const order = loadOrder();

  if (checkoutReturn.status === 'success' && order) {
    // Update order status to completed
    updateOrderStatus('completed', checkoutReturn.sessionId);
    const totalFormatted = (order.totalCents / 100).toFixed(2);
    const itemNames = order.items.map(i => i.name).join(', ');
    orderContextMessage = `Thank you for your purchase! Your order for ${itemNames} (total: $${totalFormatted}) has been confirmed. Order reference: ${order.sessionId.slice(-8)}. Is there anything else I can help you with?`;
    console.log("[Order] Checkout completed:", { sessionId: checkoutReturn.sessionId, items: order.items });
  } else if (checkoutReturn.status === 'cancelled') {
    // Update order status to cancelled
    updateOrderStatus('cancelled');
    orderContextMessage = `I see you cancelled the checkout. Your items are still saved if you'd like to try again. Would you like to proceed with the purchase or explore other options?`;
    console.log("[Order] Checkout cancelled");
  }

  // Clear checkout query params from URL
  clearCheckoutQueryParams();
}

// Helper to get dynamic welcome message based on order state
const getWelcomeConfig = () => {
  const order = loadOrder();

  if (order?.status === 'completed') {
    const completedTime = order.completedAt ? new Date(order.completedAt).getTime() : new Date(order.createdAt).getTime();
    const hoursAgo = (Date.now() - completedTime) / (1000 * 60 * 60);

    if (hoursAgo < 24) {
      const itemSummary = order.items.length > 2
        ? `${order.items.slice(0, 2).map(i => i.name).join(', ')} and more`
        : order.items.map(i => i.name).join(', ');

      return {
        title: `Welcome back! Order confirmed`,
        subtitle: `Your ${itemSummary} order is confirmed. Ask me anything!`
      };
    }
  }

  return {
    title: "Hi, what can I help you with?",
    subtitle: "Try asking for products or adding items to your cart"
  };
};

const { title: welcomeTitle, subtitle: welcomeSubtitle } = getWelcomeConfig();

// ============================================================================
// Page Context Provider
// ============================================================================

// Create a context provider that collects page context for metadata
const pageContextProvider = () => {
  const elements = collectPageContext();
  const formattedContext = formatPageContext(elements);
  const order = loadOrder();

  // Return context in a format suitable for metadata
  return {
    page_elements: elements.slice(0, 50), // Limit to first 50 elements
    page_element_count: elements.length,
    page_context: formattedContext,
    page_url: window.location.href,
    page_title: document.title,
    timestamp: new Date().toISOString(),
    // Include order context for assistant (if available)
    recent_order: order ? {
      session_id: order.sessionId,
      items: order.items,
      total: (order.totalCents / 100).toFixed(2),
      status: order.status,
      created_at: order.createdAt,
      completed_at: order.completedAt,
    } : null,
  };
};

// Note: Chat history is loaded automatically by the storage adapter
// and messages are injected via onStateLoaded hook

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

// Auto-open if we have a navigation message OR an order context message
const navMessage = checkNavigationFlag();
const shouldAutoOpen = navMessage !== null || orderContextMessage !== null;

// Helper to inject a message into state (used by onStateLoaded)
const injectMessage = (
  state: AgentWidgetStoredState,
  content: string,
  idPrefix: string
): AgentWidgetStoredState => {
  const messages = state.messages || [];

  // Check if this message already exists (avoid duplicates)
  const messageExists = messages.some(msg =>
    msg.role === "assistant" && msg.content === content
  );

  if (messageExists) {
    return state;
  }

  console.log(`[Action Middleware] Injecting ${idPrefix} message via onStateLoaded`);
  return {
    ...state,
    messages: [...messages, {
      id: `${idPrefix}-${Date.now()}`,
      role: "assistant" as const,
      content,
      createdAt: new Date().toISOString(),
      streaming: false
    }]
  };
};

// Load previously executed action IDs from localStorage (for syncing with widget SDK metadata)
let processedActionIds = new Set<string>(loadExecutedActionIds());
console.log("[Action Middleware] Loaded processedActionIds:", Array.from(processedActionIds));
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
  // Use onStateLoaded to inject navigation and order messages after page load
  onStateLoaded: (state) => {
    // Check for pending navigation message
    if (navMessage) {
      state = injectMessage(state, navMessage, "nav");
    }
    // Check for order context message (returning from checkout)
    if (orderContextMessage) {
      state = injectMessage(state, orderContextMessage, "order");
    }
    return state;
  },
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
    welcomeTitle,  // Dynamic based on order state
    welcomeSubtitle,  // Dynamic based on order state
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
// Note: We use a separate variable to avoid reference error in onReady callback
let widgetControllerRef: ReturnType<typeof initAgentWidget> | null = null;

const widgetController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config,
  onReady: () => {
    // Handle auto-open for navigation message or checkout return
    // Use setTimeout to ensure widgetControllerRef is assigned
    if (shouldAutoOpen) {
      setTimeout(() => {
        widgetControllerRef?.open();
      }, 100);
    }
  }
});

widgetControllerRef = widgetController;

// Clear in-memory state when chat is cleared
// (localStorage is automatically cleared via clearChatHistoryStorageKey config option)
window.addEventListener("persona:clear-chat", () => {
  console.log("[Action Middleware] Clear chat event received, clearing in-memory state");
  processedActionIds.clear();
  rawJsonByMessageId.clear();
  // Optionally clear order data when chat is cleared
  clearOrder();
});

// Expose controller for debugging
(window as any).widgetController = widgetController;
