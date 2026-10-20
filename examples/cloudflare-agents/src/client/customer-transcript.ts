import { createAgentExperience, type MessageRenderContext } from "@runtypelabs/persona";
import type { Ticket } from "../shared/tickets";

/** A local, read-only Persona instance; the copilot has its own session. */
export function mountCustomerTranscript(host: HTMLElement, ticket: Ticket, title: HTMLElement, note: HTMLElement) {
  const records = new Map(ticket.messages.map(message => [message.id, message]));
  const renderMessage = ({ message }: MessageRenderContext) => {
    const record = records.get(message.id)!;
    const article = document.createElement("article");
    article.className = `thread-message ${record.role}`;
    const avatar = document.createElement("span");
    avatar.className = `message-avatar${record.role === "support" ? " support-avatar" : ""}`;
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = record.author.split(" ").map(part => part[0]).slice(0, 2).join("");
    const content = document.createElement("div");
    content.className = "message-content";
    const heading = document.createElement("div");
    heading.className = "message-heading";
    const name = document.createElement("strong");
    name.textContent = record.author;
    const role = document.createElement("span");
    role.textContent = record.role === "support" ? "Support team" : "Customer";
    const time = document.createElement("time");
    time.textContent = record.time;
    heading.appendChild(name);
    heading.appendChild(role);
    heading.appendChild(time);
    const body = document.createElement("div");
    body.className = "message-body";
    for (const text of message.content.split("\n\n")) {
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      body.appendChild(paragraph);
    }
    content.appendChild(heading);
    content.appendChild(body);
    article.appendChild(avatar);
    article.appendChild(content);
    return article;
  };

  const transcript = createAgentExperience(host, {
    future: { v5Defaults: true },
    persistState: false,
    autoFocusInput: false,
    colorScheme: "light",
    launcher: { enabled: false },
    welcome: { variant: "none" },
    layout: {
      embedded: true,
      showHeader: false,
      showFooter: false,
      contentMaxWidth: "760px",
      messages: {
        user: { width: "full", maxWidth: "100%" },
        assistant: { width: "full", maxWidth: "100%" },
        renderUserMessage: renderMessage,
        renderAssistantMessage: renderMessage,
      },
      slots: { "transcript-top": () => title, "body-bottom": () => note },
    },
    messageActions: { enabled: false },
    features: { scrollBehavior: { mode: "none" }, scrollToBottom: { enabled: false } },
    theme: { components: { message: { gap: "20px" } } },
    initialMessages: ticket.messages.map(message => ({
      id: message.id,
      role: message.role === "customer" ? "user" : "assistant",
      content: message.body,
      // Sample records contain only display times; the renderer uses those above.
      createdAt: new Date(0).toISOString(),
    })),
  });

  // Saved chat normally opens at the latest message; a support record starts at
  // its subject. Keep the scroll local so opening it cannot move the copilot.
  const scroller = host.querySelector<HTMLElement>(".persona-widget-body");
  if (scroller) {
    scroller.scrollTop = 0;
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", "Customer conversation");
  }
  return transcript;
}
