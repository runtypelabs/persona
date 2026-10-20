/**
 * Global test setup.
 *
 * Registers `marked` + `dompurify` synchronously so widget renders and the
 * synchronous markdown/sanitize helpers behave like the bundled npm build,
 * where `index.ts` imports `markdown-parsers-eager`. Without this, tests would
 * exercise the IIFE/CDN lazy-load fallback (async chunk import), and the first
 * synchronous render would escape markdown to plain text.
 */
import { afterEach } from "vitest";
import { resetTooltipTiming } from "./src/utils/tooltip";
import "./src/markdown-parsers-eager";
import "./src/icons-extra-eager";
// Likewise the SSE stream processor (`client-stream.js` chunk in the IIFE).
import "./src/client-stream-eager";
import "./src/client-history-eager";
import "./src/ui-extras-eager";
// And the session resolve paths (`session-actions.js` chunk in the IIFE).
import "./src/session-actions-eager";
// And the visitor-history shell (`history-shell.js` chunk in the IIFE).
import "./src/history-shell-eager";

// Isolated attachTooltip tests should not wait on the product 200ms default.
// Widget mounts re-apply `config.tooltip` (200 / 300) on create/update.
const silenceTooltipDelay = (): void => {
  resetTooltipTiming({ delayMs: 0, skipDelayMs: 0 });
};
silenceTooltipDelay();
afterEach(silenceTooltipDelay);

import * as composerActions from "./src/composer-actions-runtime";
import { provideComposerActions } from "./src/composer-actions-loader";
provideComposerActions(composerActions);

import * as configDiagnostics from "./src/config-diagnostics";
import { provideConfigDiagnostics } from "./src/config-diagnostics-loader";
provideConfigDiagnostics(configDiagnostics);

import * as loadingLabelRuntime from "./src/loading-label-runtime";
import { provideLoadingLabelRuntime } from "./src/loading-label-runtime-loader";
provideLoadingLabelRuntime(loadingLabelRuntime);

import * as activityUi from "./src/activity-ui";
import { provideActivityUi } from "./src/activity-ui-loader";
import { renderLucideIcon as activityIcon } from "./src/utils/icons";
import { activityDependencies } from "./src/activity-dependencies";
activityUi.initActivityUi(activityIcon, loadingLabelRuntime, activityDependencies);
provideActivityUi(activityUi);

import { initArtifactsUi } from "./src/components/artifacts-deps";
import * as artifactButtons from "./src/utils/buttons";
import { componentRegistry } from "./src/components/registry";
initArtifactsUi({ componentRegistry, buttons: artifactButtons, loadingLabels: loadingLabelRuntime });

import { initApprovalUi } from "./src/components/approval-deps";
import { createPopover, isEditableEventTarget } from "./src/plugin-kit";
initApprovalUi({ webMcpToolTitle: () => undefined, popover: { createPopover, isEditableEventTarget } });

import * as clientDispatch from "./src/client-dispatch";
import { provideClientDispatch } from "./src/client-dispatch-loader";
provideClientDispatch(clientDispatch);

import { renderIconNode } from "./src/utils/icon-node";
initApprovalUi({ webMcpToolTitle: () => undefined, icons: { render: activityIcon, node: renderIconNode } });

import * as dictationRuntime from "./src/dictation-runtime";
import { provideDictationRuntime } from "./src/dictation-runtime-loader";
provideDictationRuntime(dictationRuntime);

// Default V5 artifact rendering participates in the mount readiness barrier.
// Keep ordinary synchronous UI tests on the cached path; cold-load tests reset
// the module graph and supply controlled pending loaders explicitly.
import * as artifactsUi from "./src/artifacts-ui-entry";
import { provideArtifactsUi } from "./src/artifacts-ui-loader";
provideArtifactsUi(artifactsUi);
