import "@runtypelabs/persona/widget.css";
import {
  DEFAULT_WIDGET_CONFIG,
  initAgentWidget,
  type AgentWidgetConfig,
  type AgentWidgetController,
} from "@runtypelabs/persona";

/**
 * Internal fixture page for the Playwright full-duplex voice suite (see
 * e2e/specs/voice-*.spec.ts) and the live GPT-Live harness (e2e/live/).
 *
 * Mounts a clientToken widget whose chat traffic goes to `apiUrl` (route
 * intercepted by the deterministic suite, a real Runtype API in the live
 * harness) and whose `runtype` voice provider dials `voiceHost`. Not
 * registered in examples-nav.
 */

const params = new URLSearchParams(window.location.search);
const apiUrl = params.get("apiUrl") ?? "/e2e-api";
const clientToken = params.get("clientToken") ?? "ct_e2e_voice";
const agentId = params.get("agentId") ?? "agent_e2e_voice";
const voiceHost = params.get("voiceHost") ?? apiUrl;
const callContext = params.get("callContext") ?? undefined;
const clientDelegation = params.get("clientDelegation") === "0" ? false : undefined;

const host = document.getElementById("e2e-host") as HTMLElement;
const status = document.getElementById("e2e-status") as HTMLElement;

const config: AgentWidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  apiUrl,
  clientToken,
  agentId,
  persistState: false,
  suggestionChips: [],
  launcher: { ...DEFAULT_WIDGET_CONFIG.launcher, enabled: false, width: "100%" },
  // A welcome hero would sit between the tests and the transcript.
  welcome: { variant: "none" },
  copy: { ...DEFAULT_WIDGET_CONFIG.copy, inputPlaceholder: "Send a message…" },
  voiceRecognition: {
    enabled: true,
    provider: {
      type: "runtype",
      runtype: {
        agentId,
        host: voiceHost,
        ...(clientDelegation === false ? { clientDelegation } : {}),
        ...(callContext ? { callContext } : {}),
      },
    },
  },
};

const controller: AgentWidgetController = initAgentWidget({
  target: host,
  useShadowDom: false,
  config,
});

status.textContent = `ready voiceHost=${voiceHost}`;

Object.assign(window as unknown as Record<string, unknown>, {
  __personaE2E: { controller },
});
