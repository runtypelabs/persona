import { AgentWidgetConfig, AgentWidgetMessage } from "../types";

/**
 * Context provided to component renderers
 */
export interface ComponentContext {
  message: AgentWidgetMessage;
  config: AgentWidgetConfig;
  /**
   * Update component props during streaming
   */
  updateProps: (newProps: Record<string, unknown>) => void;
}

/**
 * Component renderer function signature
 */
export type ComponentRenderer = (
  props: Record<string, unknown>,
  context: ComponentContext
) => HTMLElement;

/**
 * Component registry for managing custom components
 */
class ComponentRegistry {
  private components: Map<string, ComponentRenderer> = new Map();

  /**
   * Register a custom component
   */
  register(name: string, renderer: ComponentRenderer): void {
    if (this.components.has(name)) {
      console.warn(`[ComponentRegistry] Component "${name}" is already registered. Overwriting.`);
    }
    this.components.set(name, renderer);
  }

  /**
   * Unregister a component
   */
  unregister(name: string): void {
    this.components.delete(name);
  }

  /**
   * Get a component renderer by name
   */
  get(name: string): ComponentRenderer | undefined {
    return this.components.get(name);
  }

  /**
   * Check if a component is registered
   */
  has(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * Get all registered component names
   */
  getAllNames(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Clear all registered components
   */
  clear(): void {
    this.components.clear();
  }

  /**
   * Register multiple components at once
   */
  registerAll(components: Record<string, ComponentRenderer>): void {
    Object.entries(components).forEach(([name, renderer]) => {
      this.register(name, renderer);
    });
  }
}

/**
 * Global component registry instance
 */
export const componentRegistry = new ComponentRegistry();
