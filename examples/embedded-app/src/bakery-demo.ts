import "vanilla-agent/widget.css";
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
} from "vanilla-agent";
import {
  collectPageContext,
  formatPageContext,
  parseActionResponse,
  executeAction,
  loadChatHistory,
  loadExecutedActionIds,
  checkCheckoutReturn,
  clearCheckoutQueryParams,
  loadOrder,
  updateOrderStatus,
  cleanupExpiredOrders,
  clearOrder,
  saveOrder,
  STORAGE_KEY
} from "./middleware";
import { createFlexibleJsonStreamParser } from "vanilla-agent";
import type {
  AgentWidgetStorageAdapter,
  AgentWidgetStoredState,
  AgentWidgetRequestPayload,
  AgentWidgetActionHandler
} from "../../../packages/widget/src/types";

// Use bakery-specific storage key
const BAKERY_STORAGE_KEY = "bakery-demo-chat";
const CART_STORAGE_KEY = "bakery-cart";

// Timing configuration (in milliseconds)
const TIMING = {
  navigation: 100,        // Delay before page navigation
  addToCartClick: 50,     // Delay before clicking add to cart button
  scrollThenAdd: 150,     // Delay after scroll before adding to cart
  showCartOverlay: 80,    // Delay for widget to open before showing cart
  badgeReposition: 50,    // Delay for badge repositioning after widget state change
};

// Declare widget controller ref early so it can be checked during initialization
let widgetControllerRef: ReturnType<typeof initAgentWidget> | null = null;

const proxyPort = import.meta.env.VITE_PROXY_PORT ?? 43111;
const proxyUrl =
  import.meta.env.VITE_PROXY_URL ??
  `http://localhost:${proxyPort}/api/chat/dispatch-bakery`;

// ============================================================================
// Cart Management
// ============================================================================

interface CartItem {
  id: string;
  name: string;
  price: number; // cents
  quantity: number;
}

function getCart(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCart(cart: CartItem[]): void {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartBadge();
  window.dispatchEvent(new CustomEvent('cart-updated', { detail: { count: getCartCount(), cart } }));
}

function addToCart(item: { id: string; name: string; price: number }): void {
  const cart = getCart();
  const existingItem = cart.find(i => i.id === item.id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ ...item, quantity: 1 });
  }
  saveCart(cart);
}

function getCartCount(): number {
  return getCart().reduce((sum, item) => sum + item.quantity, 0);
}

function clearCart(): void {
  localStorage.removeItem(CART_STORAGE_KEY);
  // Only update UI if widget is initialized (avoid errors during page load)
  if (widgetControllerRef) {
    updateCartBadge();
    updateIntroCard();
  }
}

function removeFromCart(itemId: string): void {
  const cart = getCart();
  const updatedCart = cart.filter(item => item.id !== itemId);
  saveCart(updatedCart);
  updateIntroCard();
}

// ============================================================================
// Cart Badge
// ============================================================================

let isWidgetOpen = false;
let isCartOverlayOpen = false;

function createCartBadge(): HTMLElement {
  // Add pop animation keyframes to document if not already present
  if (!document.getElementById('cart-badge-styles')) {
    const style = document.createElement('style');
    style.id = 'cart-badge-styles';
    style.textContent = `
      @keyframes cartBadgePop {
        0% { transform: scale(0); opacity: 0; }
        50% { transform: scale(1.2); }
        100% { transform: scale(1); opacity: 1; }
      }
      .cart-badge-pop {
        animation: cartBadgePop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
      }
    `;
    document.head.appendChild(style);
  }

  const badge = document.createElement('div');
  badge.id = 'cart-badge';
  badge.style.cssText = `
    position: fixed;
    background: #D4A574;
    color: white;
    border-radius: 12px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 3px;
    z-index: 10001;
    font-family: Inter, system-ui, sans-serif;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transform: scale(0);
  `;
  // Cart icon SVG + count + action buttons (hidden by default)
  badge.innerHTML = `
    <span id="cart-badge-content" style="display: flex; align-items: center; gap: 3px; cursor: pointer;">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="21" r="1"></circle>
        <circle cx="20" cy="21" r="1"></circle>
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
      </svg>
      <span id="cart-badge-count"></span>
    </span>
    <span id="cart-badge-actions" style="display: none; align-items: center; gap: 2px;">
      <button id="cart-view-btn" style="display: flex; align-items: center; gap: 2px; background: transparent; border: none; color: white; font-size: 11px; font-weight: 600; cursor: pointer; padding: 2px 6px; border-radius: 6px; font-family: inherit;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        View
      </button>
    </span>
  `;

  // Hover effects
  badge.addEventListener('mouseenter', () => {
    const content = badge.querySelector('#cart-badge-content') as HTMLElement;
    const actions = badge.querySelector('#cart-badge-actions') as HTMLElement;
    const viewBtn = badge.querySelector('#cart-view-btn') as HTMLElement;
    if (content) content.style.display = 'none';
    if (actions) actions.style.display = 'flex';
    badge.style.background = '#b8956a';

    // Update button text/icon based on cart overlay state
    if (viewBtn && isCartOverlayOpen) {
      viewBtn.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        Hide
      `;
    }
  });

  badge.addEventListener('mouseleave', () => {
    const content = badge.querySelector('#cart-badge-content') as HTMLElement;
    const actions = badge.querySelector('#cart-badge-actions') as HTMLElement;
    const viewBtn = badge.querySelector('#cart-view-btn') as HTMLElement;
    if (content) content.style.display = 'flex';
    if (actions) actions.style.display = 'none';
    badge.style.background = '#D4A574';

    // Reset button to View state
    if (viewBtn) {
      viewBtn.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        View
      `;
    }
  });

  // View/Hide cart button
  const viewBtn = badge.querySelector('#cart-view-btn');
  viewBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isCartOverlayOpen) {
      hideCartOverlay();
      // Immediately update to "View"
      (viewBtn as HTMLElement).innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        View
      `;
    } else {
      showCartInWidget();
      // Immediately update to "Hide"
      (viewBtn as HTMLElement).innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        </svg>
        Hide
      `;
    }
  });
  viewBtn?.addEventListener('mouseenter', () => {
    (viewBtn as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
  });
  viewBtn?.addEventListener('mouseleave', () => {
    (viewBtn as HTMLElement).style.background = 'transparent';
  });

  document.body.appendChild(badge);
  return badge;
}

function hideCartOverlay(): void {
  const overlay = document.getElementById('cart-overlay');
  if (overlay) {
    overlay.remove();
  }
  isCartOverlayOpen = false;

  // Focus the message input
  const launcherRoot = document.getElementById('launcher-root');
  const textarea = launcherRoot?.querySelector('textarea');
  if (textarea) {
    textarea.focus();
  }
}

function showCartInWidget(): void {
  // Open widget if not already open
  if (!isWidgetOpen && widgetControllerRef) {
    widgetControllerRef.open();
  }

  // Wait for widget to open, then show cart overlay
  setTimeout(() => {
    const launcherRoot = document.getElementById('launcher-root');
    const container = launcherRoot?.querySelector('.tvw-widget-container');
    if (!container) return;

    // Remove existing cart overlay if any
    const existing = document.getElementById('cart-overlay');
    if (existing) existing.remove();

    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Create cart overlay - positioned over the entire container
    const overlay = document.createElement('div');
    overlay.id = 'cart-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: #FAFAF9;
      z-index: 100;
      display: flex;
      flex-direction: column;
      padding: 20px;
      overflow-y: auto;
      border-radius: 16px;
    `;

    overlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1C1917;">Your Cart</h3>
        <button id="cart-overlay-close" style="background: transparent; border: 1px solid #D6D3D1; border-radius: 6px; cursor: pointer; padding: 6px 12px; color: #78716C; font-size: 13px; font-weight: 500; font-family: inherit;">
          Back to Chat
        </button>
      </div>
      <div id="cart-items" style="flex: 1; display: flex; flex-direction: column; gap: 12px; overflow-y: auto;">
        ${cart.length === 0 ? `
          <p style="color: #78716C; text-align: center; margin-top: 40px;">Your cart is empty</p>
        ` : cart.map(item => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: white; border-radius: 8px; border: 1px solid #E7E5E4;">
            <div style="flex: 1;">
              <div style="font-weight: 500; color: #1C1917;">${item.name}</div>
              <div style="font-size: 13px; color: #78716C;">Qty: ${item.quantity}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="font-weight: 600; color: #1C1917;">$${(item.price * item.quantity / 100).toFixed(2)}</div>
              <button class="cart-remove-btn" data-item-id="${item.id}" style="background: none; border: none; cursor: pointer; padding: 4px; color: #A8A29E; display: flex; align-items: center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
      ${cart.length > 0 ? `
        <div style="border-top: 1px solid #E7E5E4; padding-top: 16px; margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <span style="font-weight: 500; color: #1C1917;">Total</span>
            <span style="font-weight: 700; font-size: 18px; color: #1C1917;">$${(total / 100).toFixed(2)}</span>
          </div>
          <button id="cart-checkout-btn" style="width: 100%; padding: 12px; background: #1C1917; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
            Proceed to Checkout
          </button>
        </div>
      ` : ''}
    `;

    // Ensure container has relative positioning for absolute overlay
    (container as HTMLElement).style.position = 'relative';
    container.appendChild(overlay);
    isCartOverlayOpen = true;

    // Close button hover effect
    const closeBtn = overlay.querySelector('#cart-overlay-close') as HTMLElement;
    closeBtn?.addEventListener('mouseenter', () => {
      closeBtn.style.background = '#F5F5F4';
    });
    closeBtn?.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
    });
    closeBtn?.addEventListener('click', () => {
      hideCartOverlay();
    });

    // Remove item buttons
    overlay.querySelectorAll('.cart-remove-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => {
        (btn as HTMLElement).style.color = '#DC2626';
      });
      btn.addEventListener('mouseleave', () => {
        (btn as HTMLElement).style.color = '#A8A29E';
      });
      btn.addEventListener('click', () => {
        const itemId = (btn as HTMLElement).dataset.itemId;
        if (itemId) {
          removeFromCart(itemId);
          overlay.remove();
          // Only re-render if cart still has items, otherwise close and focus input
          if (getCartCount() > 0) {
            showCartInWidget();
          } else {
            isCartOverlayOpen = false;
            // Focus the message input
            const textarea = launcherRoot?.querySelector('textarea');
            if (textarea) {
              (textarea as HTMLTextAreaElement).focus();
            }
          }
        }
      });
    });

    // Checkout button handler
    overlay.querySelector('#cart-checkout-btn')?.addEventListener('click', () => {
      overlay.remove();
      isCartOverlayOpen = false;
      // Trigger checkout through the chat
      const checkoutUrl = `${window.location.origin.replace(/:\d+$/, "")}:43111/api/checkout/bakery`;
      const items = cart.map(item => ({ name: item.name, price: item.price, quantity: item.quantity }));

      fetch(checkoutUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success && data.checkoutUrl) {
            saveOrder({
              sessionId: data.sessionId || 'unknown',
              items,
              totalCents: total,
              status: 'pending',
              createdAt: new Date().toISOString(),
            });
            window.location.href = data.checkoutUrl;
          } else {
            console.error("[Bakery] Failed to create checkout session:", data.error);
            alert("Failed to create checkout. Please try again.");
          }
        })
        .catch((error) => {
          console.error("[Bakery] Checkout error:", error);
          alert("Failed to create checkout. Please try again.");
        });
    });
  }, isWidgetOpen ? 0 : TIMING.showCartOverlay);
}

function positionCartBadge(): void {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;

  // Use requestAnimationFrame to ensure layout is complete
  requestAnimationFrame(() => {
    const launcherRoot = document.getElementById('launcher-root');

    // Use widget controller's isOpen() method for accurate state
    const widgetIsOpen = widgetControllerRef?.isOpen() ?? false;

    if (widgetIsOpen) {
      // Position on top-left of the chat panel container (the white card)
      const container = launcherRoot?.querySelector('.tvw-widget-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        badge.style.top = `${rect.top - 10}px`;
        badge.style.left = `${rect.left - 10}px`;
        badge.style.bottom = 'auto';
        badge.style.right = 'auto';
      }
    } else {
      // Position on top-left of the launcher button icon
      const launcherIcon = launcherRoot?.querySelector('[data-role="launcher-icon"]');
      if (launcherIcon) {
        const rect = launcherIcon.getBoundingClientRect();
        badge.style.top = `${rect.top - 20}px`;
        badge.style.left = `${rect.left - 24}px`;
        badge.style.bottom = 'auto';
        badge.style.right = 'auto';
      } else {
        // Fallback: fixed position for launcher in bottom-right
        badge.style.top = 'auto';
        badge.style.bottom = '68px';
        badge.style.left = 'auto';
        badge.style.right = '12px';
      }
    }
  });
}

function updateCartBadge(): void {
  let badge = document.getElementById('cart-badge');
  const wasHidden = !badge || badge.style.display === 'none';

  if (!badge) {
    badge = createCartBadge();
  }
  const count = getCartCount();
  const countEl = badge.querySelector('#cart-badge-count');
  if (countEl) {
    countEl.textContent = String(count);
  }

  if (count > 0) {
    badge.style.display = 'flex';
    // Trigger pop animation if badge was hidden
    if (wasHidden) {
      badge.classList.remove('cart-badge-pop');
      // Force reflow to restart animation
      void badge.offsetWidth;
      badge.classList.add('cart-badge-pop');
    }
  } else {
    badge.style.display = 'none';
    badge.classList.remove('cart-badge-pop');
  }

  positionCartBadge();
}

// Set up resize/scroll listeners for badge positioning
function setupBadgeRepositioning(): void {
  window.addEventListener('resize', positionCartBadge);
  window.addEventListener('scroll', positionCartBadge);
}

// Initialize cart badge after a short delay to ensure widget is mounted
setTimeout(() => {
  updateCartBadge();
  setupBadgeRepositioning();
}, 100);

// ============================================================================
// Navigation Flag Management (bakery-specific)
// ============================================================================

const BAKERY_NAV_FLAG_KEY_CHECK = "bakery-demo-nav-flag";

// Check and consume nav flag - returns the message text if valid
function consumeNavigationFlag(): string | null {
  try {
    const stored = localStorage.getItem(BAKERY_NAV_FLAG_KEY_CHECK);
    if (stored) {
      const flag = JSON.parse(stored);
      // Clear the flag after reading
      localStorage.removeItem(BAKERY_NAV_FLAG_KEY_CHECK);

      // Check if flag is still valid (within 5 minutes)
      const age = Date.now() - flag.timestamp;
      if (age < 5 * 60 * 1000) {
        console.log("[Bakery] Nav flag consumed:", flag.onLoadText?.substring(0, 50) + "...");
        return flag.onLoadText;
      }
    }
  } catch (error) {
    console.error("[Bakery] Failed to check navigation flag:", error);
  }
  return null;
}

// Check nav flag without consuming (for display purposes)
function peekNavigationFlag(): string | null {
  try {
    const stored = localStorage.getItem(BAKERY_NAV_FLAG_KEY_CHECK);
    if (stored) {
      const flag = JSON.parse(stored);
      const age = Date.now() - flag.timestamp;
      if (age < 5 * 60 * 1000) {
        return flag.onLoadText;
      }
    }
  } catch (error) {
    // Ignore
  }
  return null;
}

// ============================================================================
// Order State Management
// ============================================================================

cleanupExpiredOrders();

const checkoutReturn = checkCheckoutReturn();
let orderContextMessage: string | null = null;

if (checkoutReturn.status) {
  const order = loadOrder();

  if (checkoutReturn.status === 'success' && order) {
    updateOrderStatus('completed', checkoutReturn.sessionId);
    const totalFormatted = (order.totalCents / 100).toFixed(2);
    const itemNames = order.items.map(i => i.name).join(', ');
    orderContextMessage = `Thank you for your purchase! Your order for ${itemNames} (total: $${totalFormatted}) has been confirmed. Please check your email for confirmation. Is there anything else I can help you with?`;
    // Clear cart after successful checkout
    clearCart();
    console.log("[Bakery] Checkout completed:", { sessionId: checkoutReturn.sessionId, items: order.items });
  } else if (checkoutReturn.status === 'cancelled') {
    updateOrderStatus('cancelled');
    orderContextMessage = `I see you cancelled the checkout. No worries - your cart is still saved if you'd like to complete your order later. Is there anything else I can help you with?`;
    console.log("[Bakery] Checkout cancelled");
  }

  clearCheckoutQueryParams();
}

// Dynamic welcome message based on order and cart state
const getWelcomeConfig = () => {
  const order = loadOrder();
  const cartCount = getCartCount();

  if (order?.status === 'completed') {
    const completedTime = order.completedAt ? new Date(order.completedAt).getTime() : new Date(order.createdAt).getTime();
    const hoursAgo = (Date.now() - completedTime) / (1000 * 60 * 60);

    if (hoursAgo < 24) {
      return {
        title: `Thank you for your order!`,
        subtitle: `Your ${order.items.map(i => i.name).join(', ')} is on its way. How can I help you today?`
      };
    }
  }

  if (cartCount > 0) {
    return {
      title: `Welcome back!`,
      subtitle: `You have ${cartCount} item${cartCount > 1 ? 's' : ''} in your cart. Ready to checkout?`
    };
  }

  return {
    title: "Welcome to Flour & Stone",
    subtitle: "I can help you find the perfect baked goods or gifts"
  };
};

const { title: welcomeTitle, subtitle: welcomeSubtitle } = getWelcomeConfig();

// Update intro card in the widget when cart changes
function updateIntroCard(): void {
  const launcherRoot = document.getElementById('launcher-root');
  if (!launcherRoot) return;

  const { title, subtitle } = getWelcomeConfig();

  // Find the intro card elements
  const introTitle = launcherRoot.querySelector('.tvw-widget-body h2');
  const introSubtitle = launcherRoot.querySelector('.tvw-widget-body p');

  if (introTitle) {
    introTitle.textContent = title;
  }
  if (introSubtitle) {
    introSubtitle.textContent = subtitle;
  }
}

// ============================================================================
// Page Context Provider
// ============================================================================

const pageContextProvider = () => {
  const elements = collectPageContext();
  const formattedContext = formatPageContext(elements);
  const order = loadOrder();
  const cart = getCart();
  const currentPage = window.location.pathname;

  return {
    page_elements: elements.slice(0, 50),
    page_element_count: elements.length,
    page_context: formattedContext,
    page_url: window.location.href,
    page_title: document.title,
    current_page: currentPage,
    timestamp: new Date().toISOString(),
    cart: cart.length > 0 ? {
      items: cart,
      total: (cart.reduce((sum, i) => sum + i.price * i.quantity, 0) / 100).toFixed(2),
      item_count: cart.reduce((sum, i) => sum + i.quantity, 0)
    } : null,
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

// ============================================================================
// Chat Storage
// ============================================================================

let savedMessages = loadBakeryChatHistory();

function loadBakeryChatHistory(): AgentWidgetMessage[] {
  try {
    const stored = localStorage.getItem(BAKERY_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data.messages)) {
        return data.messages as AgentWidgetMessage[];
      }
      if (Array.isArray(data.chatHistory)) {
        return data.chatHistory as AgentWidgetMessage[];
      }
      if (Array.isArray(data)) {
        return data as AgentWidgetMessage[];
      }
    }
  } catch (error) {
    console.error("[Bakery] Failed to load chat history:", error);
  }
  return [];
}

function loadBakeryExecutedActionIds(): string[] {
  try {
    const stored = localStorage.getItem(BAKERY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.metadata?.processedActionMessageIds) {
        return parsed.metadata.processedActionMessageIds as string[];
      }
      if (parsed.executedActionIds) {
        return parsed.executedActionIds as string[];
      }
    }
  } catch (error) {
    console.error("[Bakery] Failed to load executed action IDs:", error);
  }
  return [];
}

// Create storage adapter - simple wrapper that syncs processedActionIds
const createBakeryStorageAdapter = () => {
  const baseAdapter = createLocalStorageAdapter(BAKERY_STORAGE_KEY);

  return {
    load: () => {
      try {
        const stored = baseAdapter.load?.();
        if (!stored || typeof stored !== 'object' || 'then' in stored) {
          return null;
        }

        const parsed = stored as Record<string, unknown>;

        if (Array.isArray(parsed.messages)) {
          const widgetProcessedIds = Array.isArray((parsed.metadata as Record<string, unknown>)?.processedActionMessageIds)
            ? (parsed.metadata as Record<string, unknown>).processedActionMessageIds as string[]
            : [];
          widgetProcessedIds.forEach(id => processedActionIds.add(id));
          return stored as AgentWidgetStoredState;
        } else if (Array.isArray(parsed.chatHistory) || Array.isArray(parsed.executedActionIds)) {
          const processedIds = Array.isArray(parsed.executedActionIds)
            ? parsed.executedActionIds as string[]
            : [];
          processedIds.forEach(id => processedActionIds.add(id));
          return {
            messages: (parsed.chatHistory as any[]) || [],
            metadata: { processedActionMessageIds: processedIds }
          };
        } else if (Array.isArray(parsed)) {
          return { messages: parsed, metadata: { processedActionMessageIds: [] } };
        }

        return null;
      } catch (error) {
        console.error("[Bakery Storage] Failed to load:", error);
        return null;
      }
    },
    save: (state: AgentWidgetStoredState) => {
      try {
        baseAdapter.save?.(state);
        const widgetProcessedIds = Array.isArray(state.metadata?.processedActionMessageIds)
          ? state.metadata.processedActionMessageIds as string[]
          : [];
        widgetProcessedIds.forEach(id => processedActionIds.add(id));
      } catch (error) {
        console.error("[Bakery Storage] Failed to save:", error);
      }
    },
    clear: () => {
      try {
        baseAdapter.clear?.();
        processedActionIds.clear();
      } catch (error) {
        console.error("[Bakery Storage] Failed to clear:", error);
      }
    }
  };
};

// Order message handling (nav messages are now handled by storage adapter)
if (orderContextMessage) {
  const orderMessageExists = savedMessages.some(msg =>
    msg.role === "assistant" && msg.content === orderContextMessage
  );

  if (!orderMessageExists) {
    savedMessages = [...savedMessages, {
      id: `order-${Date.now()}`,
      role: "assistant",
      content: orderContextMessage,
      createdAt: new Date().toISOString(),
      streaming: false
    }];

    // Persist to localStorage
    try {
      const existingExecutedIds = loadBakeryExecutedActionIds();
      const storageData = {
        messages: savedMessages.map(msg => ({ ...msg, streaming: false })),
        metadata: { processedActionMessageIds: existingExecutedIds }
      };
      localStorage.setItem(BAKERY_STORAGE_KEY, JSON.stringify(storageData));
    } catch (error) {
      console.error("[Bakery] Failed to persist order message:", error);
    }
  }
}

let processedActionIds = new Set<string>(loadBakeryExecutedActionIds());

// ============================================================================
// Stream Parser
// ============================================================================

let lastRawJson: string | null = null;

const createBakeryParser = (): AgentWidgetStreamParser => {
  const baseParser = createFlexibleJsonStreamParser((parsed) => {
    if (!parsed || typeof parsed !== 'object') return null;

    if (parsed.action === 'nav_then_click') {
      // Show "Navigating..." during streaming, the on_load_text will be shown after redirect via nav flag
      return 'Navigating...';
    } else if (parsed.action === 'message') {
      return parsed.text || '';
    } else if (parsed.action === 'add_to_cart') {
      return parsed.text || 'Adding to cart...';
    } else if (parsed.action === 'scroll_then_add') {
      return parsed.text || 'Adding to cart...';
    } else if (parsed.action === 'message_and_click') {
      return parsed.text || 'Adding to cart...';
    } else if (parsed.action === 'checkout') {
      return parsed.text || 'Setting up checkout...';
    }

    return parsed.text || parsed.display_text || parsed.message || null;
  });

  return {
    processChunk: (accumulatedContent: string): AgentWidgetStreamParserResult | string | null | Promise<AgentWidgetStreamParserResult | string | null> => {
      const result = baseParser.processChunk(accumulatedContent);

      if (result instanceof Promise) {
        return result.then((resolvedResult) => {
          if (resolvedResult && typeof resolvedResult === 'object' && 'raw' in resolvedResult && resolvedResult.raw) {
            lastRawJson = resolvedResult.raw;
          }
          return resolvedResult;
        });
      }

      if (result && typeof result === 'object' && 'raw' in result && result.raw) {
        lastRawJson = result.raw;
      }

      return result;
    },
    getExtractedText: () => baseParser.getExtractedText(),
    close: () => {
      lastRawJson = null;
      return baseParser.close?.();
    }
  };
};

// ============================================================================
// Custom Checkout Handler
// ============================================================================

const bakeryCheckoutHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "checkout") return;

  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const items = payload.items as Array<{ name: string; price: number; quantity: number }> | undefined;

  if (items && Array.isArray(items)) {
    // Use the bakery checkout endpoint
    const checkoutUrl = `${window.location.origin.replace(/:\d+$/, "")}:43111/api/checkout/bakery`;

    fetch(checkoutUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && data.checkoutUrl) {
          const totalCents = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
          saveOrder({
            sessionId: data.sessionId || 'unknown',
            items,
            totalCents,
            status: 'pending',
            createdAt: new Date().toISOString(),
          });
          window.location.href = data.checkoutUrl;
        } else {
          console.error("[Bakery] Failed to create checkout session:", data.error);
          alert("Failed to create checkout. Please try again.");
        }
      })
      .catch((error) => {
        console.error("[Bakery] Checkout error:", error);
        alert("Failed to create checkout. Please try again.");
      });
  }

  return { handled: true, displayText: text };
};

// Custom add to cart handler
const addToCartHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "message_and_click") return;

  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const element = typeof payload.element === "string" ? payload.element : "";

  // Find and click the element
  setTimeout(() => {
    const el = document.querySelector(element);
    if (el && el instanceof HTMLElement) {
      el.click();
    } else {
      console.warn("[Bakery] Element not found:", element);
    }
  }, TIMING.addToCartClick);

  return { handled: true, displayText: text };
};

// Navigation handler for nav_then_click actions
const BAKERY_NAV_FLAG_KEY = "bakery-demo-nav-flag";
let isNavigating = false;

const navThenClickHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "nav_then_click") return;

  const payload = action.payload as Record<string, unknown>;
  const page = typeof payload.page === "string" ? payload.page : "";
  const onLoadText = typeof payload.on_load_text === "string" ? payload.on_load_text : "";

  if (!page) {
    console.warn("[Bakery] nav_then_click missing page");
    return { handled: true, displayText: onLoadText };
  }

  // Prevent duplicate navigation
  if (isNavigating) {
    console.warn("[Bakery] Navigation already in progress");
    return { handled: true, displayText: "Navigating..." };
  }

  // Check if we're already on this page
  const currentPath = window.location.pathname;
  const targetPath = page.startsWith("http") ? new URL(page).pathname : page;
  if (currentPath === targetPath) {
    console.log("[Bakery] Already on target page:", targetPath);
    return { handled: true, displayText: onLoadText };
  }

  isNavigating = true;

  // Save navigation flag for the target page to pick up
  const navFlag = {
    onLoadText,
    timestamp: Date.now()
  };
  localStorage.setItem(BAKERY_NAV_FLAG_KEY, JSON.stringify(navFlag));

  // Navigate to the page after a brief delay to show the "Navigating..." message
  let targetUrl = page;
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = window.location.origin + (targetUrl.startsWith("/") ? "" : "/") + targetUrl;
  }

  console.log("[Bakery] Navigating to:", targetUrl);
  setTimeout(() => {
    window.location.href = targetUrl;
  }, TIMING.navigation);

  // Show "Navigating..." before the redirect
  return { handled: true, displayText: "Navigating..." };
};

// Direct add to cart handler - works from any page without needing buttons
const directAddToCartHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "add_to_cart") return;

  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const item = payload.item as { id: string; name: string; price: number } | undefined;

  if (item && item.id && item.name && typeof item.price === "number") {
    // Add directly to cart
    addToCart({
      id: item.id,
      name: item.name,
      price: item.price
    });
    console.log("[Bakery] Added to cart directly:", item);

    // Explicitly update badge and intro card
    updateCartBadge();
    updateIntroCard();
  } else {
    console.warn("[Bakery] add_to_cart missing valid item:", payload);
  }

  return { handled: true, displayText: text };
};

// Scroll to product and add to cart handler - scrolls element into view then adds
const scrollThenAddHandler: AgentWidgetActionHandler = (action, context) => {
  if (action.type !== "scroll_then_add") return;

  const payload = action.payload as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  const item = payload.item as { id: string; name: string; price: number } | undefined;

  if (item && item.id && item.name && typeof item.price === "number") {
    // Try to find the product element on the page
    const productElement = document.querySelector(`[data-product="${item.id}"]`);

    if (productElement) {
      // Scroll the product into view with smooth animation
      productElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log("[Bakery] Scrolled to product:", item.id);
    } else {
      console.log("[Bakery] Product element not found, adding anyway:", item.id);
    }

    // Add to cart after a short delay (to let scroll complete)
    setTimeout(() => {
      addToCart({
        id: item.id,
        name: item.name,
        price: item.price
      });
      console.log("[Bakery] Added to cart after scroll:", item);

      // Update badge and intro card
      updateCartBadge();
      updateIntroCard();
    }, TIMING.scrollThenAdd);
  } else {
    console.warn("[Bakery] scroll_then_add missing valid item:", payload);
  }

  return { handled: true, displayText: text };
};

// ============================================================================
// Widget Config
// ============================================================================

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

  console.log(`[Bakery] Injecting ${idPrefix} message via onStateLoaded`);
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

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl: proxyUrl,
  persistState: true,
  clearChatHistoryStorageKey: BAKERY_STORAGE_KEY,
  streamParser: createBakeryParser,
  // Use onStateLoaded to inject navigation messages after page load
  onStateLoaded: (state) => {
    // Check for pending navigation message
    const navMessage = consumeNavigationFlag();
    if (navMessage) {
      state = injectMessage(state, navMessage, "nav");
    }
    return state;
  },
  actionHandlers: [
    defaultActionHandlers.message,
    navThenClickHandler,
    directAddToCartHandler,
    scrollThenAddHandler,
    addToCartHandler,
    bakeryCheckoutHandler
  ],
  storageAdapter: createBakeryStorageAdapter(),
  contextProviders: [pageContextProvider],
  requestMiddleware: ({ payload }) => {
    if (payload.context) {
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
    width: "min(480px, 95vw)",
    title: "Flour & Stone",
    subtitle: "How can we help you today?",
    agentIconText: "🍞"
  },
  theme: {
    ...DEFAULT_WIDGET_CONFIG.theme,
    primary: "#1C1917",
    accent: "#D4A574",
    surface: "#FAFAF9",
    muted: "#78716C"
  },
  copy: {
    ...DEFAULT_WIDGET_CONFIG.copy,
    welcomeTitle,
    welcomeSubtitle,
    inputPlaceholder: "Ask about our breads, pastries, or gifts...",
    sendButtonLabel: "Send"
  },
  voiceRecognition: {
    enabled: true,
    autoResume: "assistant"
  },
  suggestionChips: [
    "I'm looking for a gift",
    "What's your best seller?",
    "Tell me about your sourdough"
  ],
  postprocessMessage: ({ text, streaming, message }) => {
    return markdownPostprocessor(text);
  },
  debug: true
};

// ============================================================================
// Initialize Widget
// ============================================================================

const widgetController = initAgentWidget({
  target: "#launcher-root",
  useShadowDom: false,
  config
});

widgetControllerRef = widgetController;

// Listen for widget open/close events to reposition cart badge
widgetController.on('widget:opened', () => {
  isWidgetOpen = true;
  // Small delay to allow CSS transition to complete
  setTimeout(positionCartBadge, TIMING.badgeReposition);
});

widgetController.on('widget:closed', () => {
  isWidgetOpen = false;
  // Small delay to allow CSS transition to complete
  setTimeout(positionCartBadge, TIMING.badgeReposition);
});

// Clear state when chat is cleared
window.addEventListener("vanilla-agent:clear-chat", () => {
  console.log("[Bakery] Clear chat event received");
  processedActionIds.clear();
  clearOrder();
});

// Expose for debugging
(window as any).widgetController = widgetController;
(window as any).bakeryCart = { getCart, addToCart, clearCart, getCartCount };
