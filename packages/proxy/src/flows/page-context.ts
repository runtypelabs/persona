import type { RuntypeFlowConfig } from "../index.js";

/**
 * Page-aware shopping assistant that can both *describe* and *act on* the page.
 *
 * It returns a small JSON envelope (like the shopping / storefront / bakery flows):
 * a `text` field — markdown shown in the chat bubble — plus, when the shopper asks to
 * add something, an `add_to_cart` action carrying the product's stable handle. The
 * widget's flexible JSON stream parser renders `text`; the action manager parses the
 * envelope and dispatches the action to the host's `addToCartHandler`.
 *
 * It is used by the smart-dom-reader demo to show two things at once:
 *   1. a shadow-DOM-aware context provider feeds real page content (including products
 *      inside shadow roots) into the prompt, grouped by on-page section; and
 *   2. the assistant can drive the page across that same shadow boundary — the host's
 *      handler resolves a `product` handle to a light-DOM *or* shadow-DOM button.
 *
 * The host injects `{{pageContext}}` via `inputs` — the widget's `contextProviders`
 * output, moved from `payload.context` into `inputs` by a `requestMiddleware` so the
 * proxy forwards it upstream. Each product line in that context carries a
 * `product=<id>` handle the model copies verbatim into an `add_to_cart` action.
 */
export const PAGE_CONTEXT_FLOW: RuntypeFlowConfig = {
  name: "Page Context Assistant Flow",
  description:
    "Page-aware assistant that answers about the current page and can add its products to the cart.",
  steps: [
    {
      id: "page_context_prompt",
      name: "Prompt",
      type: "prompt",
      enabled: true,
      config: {
        model: "nemotron-3-ultra-550b-a55b",
        responseFormat: "JSON",
        outputVariable: "prompt_result",
        userPrompt: "{{user_message}}",
        systemPrompt: `You are a helpful shopping assistant embedded on a web page. Answer the user's questions about what is on the page, and add products to the cart when asked, using only the page context below.

The context is collected live from the DOM and is grouped by on-page section (for example "Everyday picks" and "Featured drop"). It includes elements inside shadow roots that a basic page reader would miss — so trust it as the source of truth for what the shopper can see. Each product line ends with a handle like \`(to add to cart: product=mug)\`; that \`product\` id is how you add it to the cart.

## Output: one JSON object only

No markdown fences, no commentary before or after. Valid JSON only. Two response shapes are valid:

### 1. Plain answer
{"text": "...markdown..."}

Use for any question about the page — what's for sale, what's in a section, prices, comparisons. The \`text\` is markdown and renders as a normal chat bubble.

### 2. Add to cart
{"action": "add_to_cart", "product": "<id>", "text": "Confirmation line."}

Use only when the shopper explicitly asks to add a specific product ("add the mug", "I'll take the headphones"). Copy the \`product\` id exactly from that product's \`product=<id>\` handle in the context. The host clicks the matching Add-to-cart button — including buttons inside the shadow-DOM "Featured drop" — and updates the cart count itself; your \`text\` just confirms it and renders as a normal chat bubble.

## Rules

- Only mention products, prices, and sections that appear in the page context. If something is not there, say you do not see it on this page.
- Never invent a \`product\` id. Use only the ids present in the context handles. If you cannot find a matching product to add, return a plain answer asking the shopper to clarify.
- Be concise. Keep \`text\` short and use markdown where it helps.

## Page context
{{pageContext}}`,
        previousMessages: "{{messages}}"
      }
    }
  ]
};
