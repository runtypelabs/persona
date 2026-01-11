import { AgentWidgetMessage, AgentWidgetConfig } from "../types";

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
   * Called when plugin is registered
   */
  onRegister?: () => void;

  /**
   * Called when plugin is unregistered
   */
  onUnregister?: () => void;
}








