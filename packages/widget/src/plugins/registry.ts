import { AgentWidgetPlugin } from "./types";

class PluginRegistry {
  private plugins: Map<string, AgentWidgetPlugin> = new Map();

  /**
   * Register a plugin
   */
  register(plugin: AgentWidgetPlugin): void {
    if (this.plugins.has(plugin.id)) {
      console.warn(`Plugin "${plugin.id}" is already registered. Overwriting.`);
    }

    this.plugins.set(plugin.id, plugin);
    plugin.onRegister?.();
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.onUnregister?.();
      this.plugins.delete(pluginId);
    }
  }

  /**
   * Get all plugins sorted by priority
   */
  getAll(): AgentWidgetPlugin[] {
    return Array.from(this.plugins.values()).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );
  }

  /**
   * Get plugins for a specific instance (from config)
   * Merges instance plugins with globally registered plugins
   */
  getForInstance(instancePlugins?: AgentWidgetPlugin[]): AgentWidgetPlugin[] {
    const allPlugins = this.getAll();

    if (!instancePlugins || instancePlugins.length === 0) {
      return allPlugins;
    }

    // Merge instance plugins with global plugins
    // Instance plugins override global plugins with the same ID
    const instanceIds = new Set(instancePlugins.map(p => p.id));
    const merged = [
      ...allPlugins.filter(p => !instanceIds.has(p.id)),
      ...instancePlugins
    ];

    return merged.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Clear all plugins
   */
  clear(): void {
    this.plugins.forEach(plugin => plugin.onUnregister?.());
    this.plugins.clear();
  }
}

export const pluginRegistry = new PluginRegistry();








