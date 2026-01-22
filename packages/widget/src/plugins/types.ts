import { AgentWidgetMessage, AgentWidgetConfig, LoadingIndicatorRenderContext, IdleIndicatorRenderContext } from "../types";

/**
 * Plugin interface for customizing widget components
 */
export interface AgentWidgetPlugin {
  /**
   * Unique identifier for the plugin
   */
  id: string;

  /**
   * Optional priority (higher = runs first). Default: 0
   */
  priority?: number;

  /**
   * Custom renderer for message bubbles
   * Return null to use default renderer
   */
  renderMessage?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for launcher button
   * Return null to use default renderer
   */
  renderLauncher?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onToggle: () => void;
  }) => HTMLElement | null;

  /**
   * Custom renderer for panel header
   * Return null to use default renderer
   */
  renderHeader?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onClose?: () => void;
  }) => HTMLElement | null;

  /**
   * Custom renderer for composer/input area
   * Return null to use default renderer
   */
  renderComposer?: (context: {
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
    onSubmit: (text: string) => void;
    disabled: boolean;
  }) => HTMLElement | null;

  /**
   * Custom renderer for reasoning bubbles
   * Return null to use default renderer
   */
  renderReasoning?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for tool call bubbles
   * Return null to use default renderer
   */
  renderToolCall?: (context: {
    message: AgentWidgetMessage;
    defaultRenderer: () => HTMLElement;
    config: AgentWidgetConfig;
  }) => HTMLElement | null;

  /**
   * Custom renderer for loading indicator
   * Return null to use default renderer (or config-based renderer)
   *
   * @example
   * ```typescript
   * renderLoadingIndicator: ({ location, defaultRenderer }) => {
   *   if (location === 'standalone') {
   *     const el = document.createElement('div');
   *     el.textContent = 'Thinking...';
   *     return el;
   *   }
   *   return defaultRenderer();
   * }
   * ```
   */
  renderLoadingIndicator?: (context: LoadingIndicatorRenderContext) => HTMLElement | null;

  /**
   * Custom renderer for idle state indicator.
   * Called when the widget is idle (not streaming) and has at least one message.
   * Return an HTMLElement to display, or null to hide (default).
   *
   * @example
   * ```typescript
   * renderIdleIndicator: ({ lastMessage, messageCount }) => {
   *   if (messageCount === 0) return null;
   *   if (lastMessage?.role !== 'assistant') return null;
   *   const el = document.createElement('div');
   *   el.className = 'idle-pulse';
   *   el.setAttribute('data-preserve-animation', 'true');
   *   return el;
   * }
   * ```
   */
  renderIdleIndicator?: (context: IdleIndicatorRenderContext) => HTMLElement | null;

  /**
   * Called when plugin is registered
   */
  onRegister?: () => void;

  /**
   * Called when plugin is unregistered
   */
  onUnregister?: () => void;
}








