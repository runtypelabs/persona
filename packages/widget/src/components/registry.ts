import type { AgentWidgetConfig, AgentWidgetComponentRenderContext, AgentWidgetComponentRenderer } from "../types";

/**
 * Context provided to component renderers
 */
export type ComponentContext = AgentWidgetComponentRenderContext;

/**
 * Component renderer function signature
 */
export type ComponentRenderer = AgentWidgetComponentRenderer;

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
  #options: Map<string, ComponentRegistrationOptions> = new Map();

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
      this.#options.set(name, options);
    } else {
      this.#options.delete(name);
    }
  }

  /**
   * Unregister a component
   */
  unregister(name: string): void {
    this.components.delete(name);
    this.#options.delete(name);
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
    return this.#options.get(name);
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
    this.#options.clear();
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
 * Global component registry instance.
 *
 * The built-in artifact components (`PersonaArtifactCard` /
 * `PersonaArtifactInline`) are NOT registered at import time anymore: their
 * renderers live in the lazy artifacts-ui chunk and are registered by its
 * adoption step (`artifacts-ui-loader.ts`), with host registrations under the
 * same names still winning. `component-middleware` suppresses the
 * missing-component warning for those two names and kicks the chunk load
 * instead.
 */
export const componentRegistry = new ComponentRegistry();

/** Widget configuration is instance-owned; explicit global registrations are fallback. */
export function resolveComponentRenderer(config: AgentWidgetConfig, name: string): ComponentRenderer | undefined {
  return config.components && Object.prototype.hasOwnProperty.call(config.components, name)
    ? config.components[name] : componentRegistry.get(name);
}

export function resolveComponentOptions(config: AgentWidgetConfig, name: string): ComponentRegistrationOptions | undefined {
  return config.components && Object.prototype.hasOwnProperty.call(config.components, name)
    ? undefined : componentRegistry.getOptions(name);
}
