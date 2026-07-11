import { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { PersonaArtifactCard } from "./artifact-card";
import { PersonaArtifactInline } from "./artifact-inline";

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
 * Per-component registration options
 */
export interface ComponentRegistrationOptions {
  /**
   * When false, the component directive renders bare in the thread (no
   * persona-message-bubble chrome).
   * @default true
   */
  bubbleChrome?: boolean;
}

/**
 * Component registry for managing custom components
 */
class ComponentRegistry {
  private components: Map<string, ComponentRenderer> = new Map();
  private options: Map<string, ComponentRegistrationOptions> = new Map();

  /**
   * Register a custom component
   */
  register(
    name: string,
    renderer: ComponentRenderer,
    options?: ComponentRegistrationOptions
  ): void {
    if (this.components.has(name)) {
      console.warn(`[ComponentRegistry] Component "${name}" is already registered. Overwriting.`);
    }
    this.components.set(name, renderer);
    if (options) {
      this.options.set(name, options);
    } else {
      this.options.delete(name);
    }
  }

  /**
   * Unregister a component
   */
  unregister(name: string): void {
    this.components.delete(name);
    this.options.delete(name);
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
   * Get the registration options for a component, if any were supplied
   */
  getOptions(name: string): ComponentRegistrationOptions | undefined {
    return this.options.get(name);
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
    this.options.clear();
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

// Register built-in components. The artifact card and inline block carry
// their own border and surface, so they render bare in the thread to avoid
// double-boxing.
componentRegistry.register("PersonaArtifactCard", PersonaArtifactCard, { bubbleChrome: false });
componentRegistry.register("PersonaArtifactInline", PersonaArtifactInline, { bubbleChrome: false });
