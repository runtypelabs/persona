/**
 * Stripe checkout helpers using the REST API
 * This approach works on all platforms including Cloudflare Workers, Vercel Edge, etc.
 */

export interface CheckoutItem {
  name: string;
  price: number; // Price in cents
  quantity: number;
}

export interface CreateCheckoutSessionOptions {
  secretKey: string;
  items: CheckoutItem[];
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
}

/**
 * Creates a Stripe checkout session using the REST API
 * @param options - Checkout session configuration
 * @returns Checkout session response with URL and session ID
 */
export async function createCheckoutSession(
  options: CreateCheckoutSessionOptions
): Promise<CheckoutSessionResponse> {
  const { secretKey, items, successUrl, cancelUrl } = options;

  try {
    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        error: "Items array is required"
      };
    }

    for (const item of items) {
      if (!item.name || typeof item.price !== "number" || typeof item.quantity !== "number") {
        return {
          success: false,
          error: "Each item must have name (string), price (number in cents), and quantity (number)"
        };
      }
    }

    // Build line items for URL encoding
    const lineItems = items.map((item) => ({
      price_data: {
        currency: "usd",
        product_data: {
          name: item.name,
        },
        unit_amount: item.price,
      },
      quantity: item.quantity,
    }));

    // Convert line items to URL-encoded format
    const params = new URLSearchParams({
      "payment_method_types[0]": "card",
      "mode": "payment",
      "success_url": successUrl,
      "cancel_url": cancelUrl,
    });

    // Add line items to params
    lineItems.forEach((item, index) => {
      params.append(`line_items[${index}][price_data][currency]`, item.price_data.currency);
      params.append(`line_items[${index}][price_data][product_data][name]`, item.price_data.product_data.name);
      params.append(`line_items[${index}][price_data][unit_amount]`, item.price_data.unit_amount.toString());
      params.append(`line_items[${index}][quantity]`, item.quantity.toString());
    });

    // Create Stripe checkout session using REST API
    const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!stripeResponse.ok) {
      const errorData = await stripeResponse.text();
      console.error("Stripe API error:", errorData);
      return {
        success: false,
        error: "Failed to create checkout session"
      };
    }

    const session = await stripeResponse.json() as { url: string; id: string };

    return {
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    };
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create checkout session"
    };
  }
}
