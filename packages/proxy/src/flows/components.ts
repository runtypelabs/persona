import type { TravrseFlowConfig } from "../index.js";

/**
 * Component-aware flow for custom component rendering
 * This flow instructs the AI to respond with component directives in JSON format
 */
export const COMPONENT_FLOW: TravrseFlowConfig = {
  name: "Component Flow",
  description: "Flow configured for custom component rendering",
  steps: [
    {
      id: "component_prompt",
      name: "Component Prompt",
      type: "prompt",
      enabled: true,
      config: {
        model: "qwen/qwen3-8b",
        reasoning: false,
        responseFormat: "JSON",
        outputVariable: "prompt_result",
        userPrompt: "{{user_message}}",
        systemPrompt: `You are a helpful assistant that can both have conversations and render custom UI components.

RESPONSE FORMAT:
Always respond with valid JSON. Choose the appropriate format based on the user's request:

1. For CONVERSATIONAL questions or text responses:
   {"text": "Your response here"}

2. For VISUAL DISPLAYS or when the user asks to SHOW/DISPLAY something:
   {"component": "ComponentName", "props": {...}}

3. For BOTH explanation AND visual:
   {"text": "Your explanation here", "component": "ComponentName", "props": {...}}

Available components for visual displays:
- ProductCard: Display product information. Props: title (string), price (number), description (string, optional), image (string, optional)
- SimpleChart: Display a bar chart. Props: title (string), data (array of numbers), labels (array of strings, optional)
- StatusBadge: Display a status badge. Props: status (string: "success", "error", "warning", "info", "pending"), message (string)
- InfoCard: Display an information card. Props: title (string), content (string), icon (string, optional)

Examples:
- User asks "What is the capital of France?": {"text": "The capital of France is Paris."}
- User asks "What does that chart show?": {"text": "The chart shows sales data increasing from 100 to 200 over three months."}
- User asks "Show me a product card": {"component": "ProductCard", "props": {"title": "Laptop", "price": 999, "description": "A great laptop"}}
- User asks "Display a chart": {"component": "SimpleChart", "props": {"title": "Sales", "data": [100, 150, 200], "labels": ["Jan", "Feb", "Mar"]}}
- User asks "Show me a chart and explain it": {"text": "Here's the sales data for Q1:", "component": "SimpleChart", "props": {"title": "Q1 Sales", "data": [100, 150, 200], "labels": ["Jan", "Feb", "Mar"]}}

IMPORTANT:
- Use {"text": "..."} for questions, explanations, discussions, and general chat
- Use {"component": "...", "props": {...}} ONLY when the user explicitly wants to SEE/VIEW/DISPLAY visual content
- You can combine both: {"text": "...", "component": "...", "props": {...}} when you want to explain something AND show a visual
- Never force a component when the user just wants information`,
        previousMessages: "{{messages}}"
      }
    }
  ]
};
