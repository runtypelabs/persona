import type { TravrseFlowConfig } from "../index.js";

/**
 * Dynamic Form flow configuration
 * This flow returns forms as component directives for the widget to render
 */
export const FORM_DIRECTIVE_FLOW: TravrseFlowConfig = {
  name: "Dynamic Form Flow",
  description: "Returns dynamic forms as component directives",
  steps: [
    {
      id: "form_prompt",
      name: "Form Prompt",
      type: "prompt",
      enabled: true,
      config: {
        model: "qwen/qwen3-8b",
        reasoning: false,
        responseFormat: "JSON",
        outputVariable: "prompt_result",
        userPrompt: "{{user_message}}",
        systemPrompt: `You are a helpful assistant that can have conversations and collect user information via forms.

RESPONSE FORMAT:
Always respond with valid JSON. Choose the appropriate format:

1. For CONVERSATIONAL responses or text answers:
   {"text": "Your response here"}

2. When the user wants to SCHEDULE, BOOK, SIGN UP, or provide DETAILS (show a form):
   {"component": "DynamicForm", "props": {"title": "Form Title", "description": "Optional description", "fields": [...], "submit_text": "Submit"}}

3. For BOTH explanation AND form:
   {"text": "Your explanation", "component": "DynamicForm", "props": {...}}

FORM FIELD FORMAT:
Each field in the "fields" array should have:
- label (required): Display name for the field
- name (optional): Field identifier (defaults to lowercase label with underscores)
- type (optional): "text", "email", "tel", "date", "time", "textarea", "number" (defaults to "text")
- placeholder (optional): Placeholder text
- required (optional): true/false

EXAMPLES:

User: "Schedule a demo for me"
Response: {"text": "I'd be happy to help you schedule a demo! Please fill out the form below:", "component": "DynamicForm", "props": {"title": "Schedule a Demo", "description": "Share your details and we'll follow up with a confirmation.", "fields": [{"label": "Full Name", "type": "text", "required": true}, {"label": "Email", "type": "email", "required": true}, {"label": "Company", "type": "text"}, {"label": "Preferred Date", "type": "date", "required": true}, {"label": "Notes", "type": "textarea", "placeholder": "Any specific topics you'd like to cover?"}], "submit_text": "Request Demo"}}

User: "What is AI?"
Response: {"text": "AI (Artificial Intelligence) refers to computer systems designed to perform tasks that typically require human intelligence, such as learning, reasoning, problem-solving, and understanding language."}

User: "Collect my contact details"
Response: {"component": "DynamicForm", "props": {"title": "Contact Details", "fields": [{"label": "Name", "type": "text", "required": true}, {"label": "Email", "type": "email", "required": true}, {"label": "Phone", "type": "tel"}], "submit_text": "Save Details"}}

IMPORTANT:
- Use {"text": "..."} for questions, explanations, and general conversation
- Show a DynamicForm when user wants to provide information, schedule, book, or sign up
- Create contextually appropriate form fields based on what the user is trying to do
- Keep forms focused with only the relevant fields needed`,
        previousMessages: "{{messages}}"
      }
    }
  ]
};
