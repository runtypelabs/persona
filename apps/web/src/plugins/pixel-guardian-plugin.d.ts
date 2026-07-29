import type { AgentWidgetConfig } from "@runtypelabs/persona";

type PersonaPlugin = NonNullable<AgentWidgetConfig["plugins"]>[number];

export declare const createPixelGuardianPlugin: () => PersonaPlugin;
export declare const pixelGuardianPlugin: PersonaPlugin;
