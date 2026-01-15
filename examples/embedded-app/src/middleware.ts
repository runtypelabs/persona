import type { AgentWidgetMessage } from "@runtypelabs/persona";
import { parse as parsePartialJson, OBJ } from "partial-json";

export type ActionResponse =
  | {
      action: "message";
      text: string;
    }
  | {
      action: "nav_then_click";
      page: string;
      on_load_text: string;
    }
  | {
      action: "message_and_click";
      element: string;
      text: string;
    }
  | {
      action: "checkout";
      text: string;
      items: Array<{
        name: string;
        price: number; // Price in cents
        quantity: number;
      }>;
    };

export type PageElement = {
  className: string;
  innerText: string;
  tagName: string;
};

export const STORAGE_KEY = "vanilla-agent-action-middleware";
const NAV_FLAG_KEY = "vanilla-agent-nav-flag";
const EXECUTED_ACTIONS_KEY = "vanilla-agent-executed-actions"; // Track which message IDs have had actions executed
export const ORDER_STORAGE_KEY = "vanilla-agent-order";

// Expiry times for order cleanup
const ORDER_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for completed orders
const PENDING_ORDER_EXPIRY_MS = 60 * 60 * 1000; // 1 hour for pending/cancelled orders

export interface StorageData {
  chatHistory: AgentWidgetMessage[];
  navFlag?: {
    onLoadText: string;
    timestamp: number;
  };
  executedActionIds?: string[]; // Track message IDs that have had actions executed
}

/**
 * Order data stored in localStorage after checkout
 */
export interface OrderData {
  sessionId: string;           // Stripe checkout session ID
  items: Array<{
    name: string;
    price: number;             // Price in cents
    quantity: number;
  }>;
  totalCents: number;          // Total in cents
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: string;           // ISO timestamp when checkout started
  completedAt?: string;        // ISO timestamp when status changed
  returnedAt?: string;         // ISO timestamp when user returned to site
}

/**
 * Checkout return status from URL query params
 */
export interface CheckoutReturn {
  status: 'success' | 'cancelled' | null;
  sessionId?: string;
}

/**
 * Collects all DOM elements with their classnames and innerText
 * to provide context to the LLM about available page elements
 */
export function collectPageContext(): PageElement[] {
  const elements: PageElement[] = [];
  const seen = new Set<string>();

  // Walk through all elements in the document
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_ELEMENT,
    null
  );

  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      
      // Exclude elements within the widget
      const widgetHost = element.closest('.persona-host');
      if (widgetHost) {
        node = walker.nextNode();
        continue;
      }
      
      const className = element.className;
      
      // Skip elements without meaningful class names or text
      if (
        typeof className === "string" &&
        className.trim() &&
        element.innerText.trim()
      ) {
        const key = `${element.tagName}.${className}`;
        if (!seen.has(key)) {
          seen.add(key);
          elements.push({
            className: className.trim(),
            innerText: element.innerText.trim().substring(0, 200), // Limit text length
            tagName: element.tagName.toLowerCase()
          });
        }
      }
    }
    node = walker.nextNode();
  }

  return elements;
}

/**
 * Formats page context as a string for inclusion in LLM prompt
 */
export function formatPageContext(elements: PageElement[]): string {
  if (elements.length === 0) {
    return "No interactive elements found on the page.";
  }

  const grouped = elements
    .map(
      (el) =>
        `- ${el.tagName}.${el.className}: "${el.innerText.substring(0, 100)}"`
    )
    .join("\n");

  return `Available page elements:\n${grouped}`;
}

/**
 * Parses JSON response from LLM using partial-json library.
 * Handles both complete and potentially incomplete JSON gracefully.
 * Returns null if text is not valid JSON or doesn't contain an action.
 * 
 * The partial-json library handles:
 * - Complete JSON objects
 * - Incomplete/streaming JSON (returns partial result)
 * - Graceful failure for non-JSON text (including template placeholders like {{variable}})
 */
export function parseActionResponse(text: string): ActionResponse | null {
  console.log("[parseActionResponse] Called with text:", text ? text.substring(0, 200) : "NULL");
  
  if (!text || typeof text !== "string") {
    console.log("[parseActionResponse] Invalid input - not a string or empty");
    return null;
  }

  try {
    // Try to extract JSON from markdown code blocks if present
    let jsonText = text.trim();
    console.log("[parseActionResponse] Trimmed text:", jsonText.substring(0, 200));
    
    // Remove markdown code blocks
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      console.log("[parseActionResponse] Found markdown code block");
      jsonText = codeBlockMatch[1].trim();
    }
    
    // Quick check: if text doesn't start with { or [, it's not JSON
    // This also catches template placeholders like {{variable}} since they start with {{
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
      console.log("[parseActionResponse] Text doesn't look like JSON (doesn't start with { or [)");
      return null;
    }
    
    // Use partial-json to parse - it gracefully handles incomplete JSON
    // OBJ flag allows parsing incomplete objects during streaming
    const parsed = parsePartialJson(jsonText, OBJ);
    console.log("[parseActionResponse] Parsed JSON:", parsed);
    
    // Ensure we got an object
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.log("[parseActionResponse] Parsed result is not an object");
      return null;
    }
    
    // Validate action type
    if (
      parsed.action === "message" &&
      typeof parsed.text === "string"
    ) {
      return parsed as ActionResponse;
    }
    
    if (
      parsed.action === "nav_then_click" &&
      typeof parsed.page === "string" &&
      typeof parsed.on_load_text === "string"
    ) {
      return parsed as ActionResponse;
    }
    
    if (
      parsed.action === "message_and_click" &&
      typeof parsed.element === "string" &&
      typeof parsed.text === "string"
    ) {
      return parsed as ActionResponse;
    }
    
    if (
      parsed.action === "checkout" &&
      typeof parsed.text === "string" &&
      Array.isArray(parsed.items) &&
      parsed.items.every(
        (item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "name" in item &&
          "price" in item &&
          "quantity" in item &&
          typeof (item as { name: unknown; price: unknown; quantity: unknown }).name === "string" &&
          typeof (item as { name: unknown; price: unknown; quantity: unknown }).price === "number" &&
          typeof (item as { name: unknown; price: unknown; quantity: unknown }).quantity === "number"
      )
    ) {
      return parsed as ActionResponse;
    }
    
    console.warn("Invalid action response format:", parsed);
    return null;
  } catch (error) {
    // If it's a JSON parse error, return null
    console.error("JSON parse error:", error, "Text:", text);
    return null;
  }
}

/**
 * Executes an action based on the parsed response
 */
let isNavigating = false; // Flag to prevent multiple navigations
const NAVIGATION_TIMEOUT = 2000; // 2 second timeout to prevent duplicate navigations

export function executeAction(
  action: ActionResponse,
  onMessage: (text: string) => void
): void {
  console.log("[executeAction] Called with action:", action);
  
  if (action.action === "message") {
    // Just display the message
    console.log("[executeAction] Executing 'message' action");
    onMessage(action.text);
  } else if (action.action === "message_and_click") {
    // Display message and click element
    console.log("[executeAction] Executing 'message_and_click' action");
    console.log("[executeAction] Looking for element:", action.element);
    console.log("[executeAction] Message to display:", action.text);
    onMessage(action.text);
    
    // Find and click the element
    // First, let's check if the selector is valid by testing it
    try {
      const element = document.querySelector(action.element);
      console.log("[executeAction] querySelector result:", {
        found: !!element,
        tagName: element?.tagName,
        className: element?.className,
        id: element?.id,
        elementRef: element
      });
      
      // Also try to find all elements matching individual class parts
      const classNames = action.element.replace(/\./g, '').split(' ').filter(Boolean);
      console.log("[executeAction] Parsed class names:", classNames);
      const elementsWithAllClasses = Array.from(document.querySelectorAll('[class*="' + classNames[0] + '"]'))
        .filter(el => classNames.every(cn => el.className.includes(cn)));
      console.log("[executeAction] Elements with all classes:", elementsWithAllClasses.length);
      
      if (element && element instanceof HTMLElement) {
        console.log("[executeAction] Will click element in 500ms");
        setTimeout(() => {
          console.log("[executeAction] About to click element");
          console.log("[executeAction] Element is visible:", element.offsetParent !== null);
          console.log("[executeAction] Element is enabled:", !(element as HTMLButtonElement).disabled);
          element.click();
          console.log("[executeAction] Element.click() called successfully");
          
          // Verify the click was registered
          setTimeout(() => {
            console.log("[executeAction] Post-click verification - element still exists:", document.body.contains(element));
          }, 100);
        }, 500); // Small delay to ensure message is visible
      } else {
        console.warn(`[executeAction] Element not found with selector: ${action.element}`);
        console.log("[executeAction] Attempting to find similar elements...");
        const allButtons = document.querySelectorAll('button');
        console.log(`[executeAction] Total buttons on page: ${allButtons.length}`);
        allButtons.forEach((btn, idx) => {
          if (btn.className.includes('AddToCartButton')) {
            console.log(`[executeAction] Button ${idx}: ${btn.className}`);
          }
        });
      }
    } catch (error) {
      console.error("[executeAction] Error querying element:", error);
    }
  } else if (action.action === "checkout") {
    // Display message and create Stripe checkout
    onMessage(action.text);

    // Create checkout session via API
    fetch(`${window.location.origin.replace(/:\d+$/, "")}:43111/api/checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: action.items,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && data.checkoutUrl) {
          // Save pending order before redirect
          const totalCents = action.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          );
          saveOrder({
            sessionId: data.sessionId || 'unknown',
            items: action.items,
            totalCents,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });

          // Redirect to Stripe checkout
          window.location.href = data.checkoutUrl;
        } else {
          console.error("Failed to create checkout session:", data.error);
          alert("Failed to create checkout session. Please try again.");
        }
      })
      .catch((error) => {
        console.error("Checkout error:", error);
        alert("Failed to create checkout session. Please try again.");
      });
  } else if (action.action === "nav_then_click") {
    // Prevent duplicate navigation
    if (isNavigating) {
      console.warn("[Action Middleware] Navigation already in progress, ignoring duplicate nav_then_click");
      return;
    }
    
    // Check if we've already navigated recently (stored in sessionStorage)
    const lastNavTime = sessionStorage.getItem("persona-last-nav-time");
    const now = Date.now();
    if (lastNavTime) {
      const timeSinceLastNav = now - parseInt(lastNavTime, 10);
      if (timeSinceLastNav < NAVIGATION_TIMEOUT) {
        console.warn("[Action Middleware] Navigation happened too recently, ignoring duplicate nav_then_click");
        return;
      }
    }
    
    isNavigating = true;
    sessionStorage.setItem("persona-last-nav-time", now.toString());
    
    // Save navigation flag and navigate
    const navFlag = {
      onLoadText: action.on_load_text,
      timestamp: Date.now()
    };
    localStorage.setItem(NAV_FLAG_KEY, JSON.stringify(navFlag));
    
    // Navigate to the page (handle both absolute and relative URLs)
    let targetUrl = action.page;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      // Relative URL - make it relative to current origin
      const baseUrl = window.location.origin;
      targetUrl = new URL(targetUrl, baseUrl).toString();
    }
    
    console.log("[Action Middleware] Scheduling navigation to:", targetUrl);
    
    // Add a delay to ensure all checks are complete before navigation
    // This also gives time for processedActionIds to be set
    setTimeout(() => {
      if (isNavigating) {
        console.log("[Action Middleware] Navigating to:", targetUrl);
        window.location.href = targetUrl;
      } else {
        console.warn("[Action Middleware] Navigation cancelled - flag was cleared");
      }
    }, 500); // 500ms delay to allow checks to complete
  }
}

/**
 * Saves chat history to localStorage
 */
export function saveChatHistory(messages: AgentWidgetMessage[], processedActionIds?: Set<string>): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const existingData: StorageData = stored ? JSON.parse(stored) : { chatHistory: [] };
    
    // Use provided processedActionIds if available, otherwise fall back to stored ones
    const executedIds = processedActionIds 
      ? Array.from(processedActionIds)
      : (existingData.executedActionIds || []);
    
    const data: StorageData = {
      chatHistory: messages.map((msg) => ({
        ...msg,
        // Remove any non-serializable properties
        streaming: false
      })),
      executedActionIds: executedIds
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save chat history:", error);
  }
}

/**
 * Loads chat history from localStorage
 * Handles both old format (chatHistory) and new widget SDK format (messages)
 */
export function loadChatHistory(): AgentWidgetMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);

      // Check for widget SDK format first (messages array)
      if (Array.isArray(data.messages)) {
        return data.messages as AgentWidgetMessage[];
      }

      // Fall back to old format (chatHistory)
      if (Array.isArray(data.chatHistory)) {
        return data.chatHistory as AgentWidgetMessage[];
      }

      // If it's just a plain array of messages
      if (Array.isArray(data)) {
        return data as AgentWidgetMessage[];
      }
    }
  } catch (error) {
    console.error("Failed to load chat history:", error);
  }
  return [];
}

/**
 * Loads executed action IDs from localStorage
 * Handles both old format (executedActionIds) and widget SDK format (metadata.processedActionMessageIds)
 */
export function loadExecutedActionIds(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);

      // Handle plain array (legacy)
      if (Array.isArray(parsed)) {
        console.warn("[Middleware] localStorage contains array instead of StorageData structure");
        return [];
      }

      // Check for widget SDK format first (metadata.processedActionMessageIds)
      if (parsed.metadata && Array.isArray(parsed.metadata.processedActionMessageIds)) {
        return parsed.metadata.processedActionMessageIds as string[];
      }

      // Fall back to old format (executedActionIds)
      if (Array.isArray(parsed.executedActionIds)) {
        return parsed.executedActionIds as string[];
      }
    }
  } catch (error) {
    console.error("Failed to load executed action IDs:", error);
  }
  return [];
}

/**
 * Clears chat history and executed action IDs from localStorage
 */
export function clearChatHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log("[Middleware] Cleared chat history from localStorage");
  } catch (error) {
    console.error("Failed to clear chat history:", error);
  }
}

/**
 * Saves executed action ID to localStorage
 */
export function saveExecutedActionId(messageId: string): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const existingData: StorageData = stored ? JSON.parse(stored) : { chatHistory: [] };
    
    const executedIds = existingData.executedActionIds || [];
    if (!executedIds.includes(messageId)) {
      executedIds.push(messageId);
      // Keep only the last 100 executed IDs to prevent localStorage from growing too large
      const data: StorageData = {
        ...existingData,
        executedActionIds: executedIds.slice(-100)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch (error) {
    console.error("Failed to save executed action ID:", error);
  }
}

/**
 * Checks for navigation flag and returns the message to display
 */
export function checkNavigationFlag(): string | null {
  try {
    const stored = localStorage.getItem(NAV_FLAG_KEY);
    if (stored) {
      const flag = JSON.parse(stored);
      // Clear the flag after reading
      localStorage.removeItem(NAV_FLAG_KEY);

      // Check if flag is still valid (within 5 minutes)
      const age = Date.now() - flag.timestamp;
      if (age < 5 * 60 * 1000) {
        return flag.onLoadText;
      }
    }
  } catch (error) {
    console.error("Failed to check navigation flag:", error);
  }
  return null;
}

// ============================================================================
// Order Storage Functions
// ============================================================================

/**
 * Saves order data to localStorage before Stripe redirect
 */
export function saveOrder(order: OrderData): void {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    console.log("[Order] Saved order:", order.sessionId);
  } catch (error) {
    console.error("[Order] Failed to save order:", error);
  }
}

/**
 * Loads order data from localStorage
 */
export function loadOrder(): OrderData | null {
  try {
    const stored = localStorage.getItem(ORDER_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as OrderData;
    }
  } catch (error) {
    console.error("[Order] Failed to load order:", error);
  }
  return null;
}

/**
 * Updates order status after checkout return
 * @param status - New status ('completed' or 'cancelled')
 * @param sessionId - Optional session ID to verify (from Stripe success URL)
 */
export function updateOrderStatus(
  status: 'completed' | 'cancelled',
  sessionId?: string
): void {
  try {
    const order = loadOrder();
    if (!order) {
      console.warn("[Order] No order found to update");
      return;
    }

    // Optionally verify session ID matches (if provided)
    if (sessionId && order.sessionId !== sessionId) {
      console.warn("[Order] Session ID mismatch, updating anyway:", {
        stored: order.sessionId,
        received: sessionId
      });
      // Update the session ID to the one from Stripe if different
      order.sessionId = sessionId;
    }

    order.status = status;
    order.completedAt = new Date().toISOString();
    order.returnedAt = new Date().toISOString();

    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
    console.log("[Order] Updated order status to:", status);
  } catch (error) {
    console.error("[Order] Failed to update order status:", error);
  }
}

/**
 * Clears order data from localStorage
 */
export function clearOrder(): void {
  try {
    localStorage.removeItem(ORDER_STORAGE_KEY);
    console.log("[Order] Cleared order data");
  } catch (error) {
    console.error("[Order] Failed to clear order:", error);
  }
}

/**
 * Cleans up expired orders from localStorage
 * - Completed orders expire after 24 hours
 * - Pending/cancelled orders expire after 1 hour
 */
export function cleanupExpiredOrders(): void {
  try {
    const order = loadOrder();
    if (!order) return;

    const now = Date.now();
    const createdTime = new Date(order.createdAt).getTime();
    const completedTime = order.completedAt
      ? new Date(order.completedAt).getTime()
      : createdTime;

    const relevantTime = order.status === 'completed' ? completedTime : createdTime;
    const expiryMs = order.status === 'completed' ? ORDER_EXPIRY_MS : PENDING_ORDER_EXPIRY_MS;
    const age = now - relevantTime;

    if (age > expiryMs) {
      console.log("[Order] Cleaning up expired order:", {
        sessionId: order.sessionId,
        status: order.status,
        ageHours: (age / (1000 * 60 * 60)).toFixed(1)
      });
      clearOrder();
    }
  } catch (error) {
    console.error("[Order] Failed to cleanup expired orders:", error);
  }
}

/**
 * Checks URL query params for checkout return status
 * Stripe redirects with ?checkout=success&session_id=cs_xxx or ?checkout=cancelled
 */
export function checkCheckoutReturn(): CheckoutReturn {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutStatus = urlParams.get('checkout');
    const sessionId = urlParams.get('session_id');

    if (checkoutStatus === 'success') {
      return { status: 'success', sessionId: sessionId || undefined };
    } else if (checkoutStatus === 'cancelled') {
      return { status: 'cancelled' };
    }
  } catch (error) {
    console.error("[Order] Failed to check checkout return:", error);
  }

  return { status: null };
}

/**
 * Clears checkout query params from URL without page reload
 */
export function clearCheckoutQueryParams(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    url.searchParams.delete('session_id');
    window.history.replaceState({}, '', url.toString());
    console.log("[Order] Cleared checkout query params");
  } catch (error) {
    console.error("[Order] Failed to clear checkout query params:", error);
  }
}

