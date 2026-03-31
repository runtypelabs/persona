"use client";

import { useEffect, useRef } from "react";
import {
  collectEnrichedPageContext,
  createFlexibleJsonStreamParser,
  createLocalStorageAdapter,
  defaultParseRules,
  formatEnrichedContext,
  initAgentWidget,
  markdownPostprocessor,
  type AgentWidgetConfig,
  type AgentWidgetInitHandle,
  type AgentWidgetMessage
} from "@runtypelabs/persona";

import { useAppState } from "@/lib/app-state";
import { parseClientAction } from "@/lib/chat/action-contract";
import { demoSourceData } from "@/lib/demo-data";
import { demoRoutes } from "@/lib/demo-routes";
import {
  getFormFieldDefinition,
  summarizeImplementationRequestForm
} from "@/lib/implementation-form";
import { personaDemoTheme } from "@/lib/persona-theme";

type ActionParser = NonNullable<AgentWidgetConfig["actionParsers"]>[number];
type ActionHandler = NonNullable<AgentWidgetConfig["actionHandlers"]>[number];
type StoredWidgetState = {
  messages?: AgentWidgetMessage[];
  metadata?: Record<string, unknown>;
};

type LocalToolRun = {
  messageId: string;
  toolId: string;
  toolName: string;
  args?: Record<string, unknown>;
  startedAt: number;
  createdAt: string;
  sequence?: number;
};

function stripCodeFence(value: string) {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match ? match[1] : value;
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  const start = trimmed.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  for (let index = start; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeStoredActionMessage(message: AgentWidgetMessage) {
  if (message.role !== "assistant") {
    return message;
  }

  const parseSources = [message.rawContent, message.content];

  for (const source of parseSources) {
    if (typeof source !== "string" || source.trim().length === 0) {
      continue;
    }

    const jsonText = extractJsonObject(stripCodeFence(source));
    if (!jsonText) {
      continue;
    }

    try {
      const parsed = JSON.parse(jsonText);
      const action = parseClientAction(parsed);
      if (!action) {
        continue;
      }

      return {
        ...message,
        content: action.text,
        rawContent: message.rawContent ?? jsonText
      };
    } catch {
      continue;
    }
  }

  return message;
}

function normalizeStoredState(state: StoredWidgetState): StoredWidgetState {
  if (!state.messages?.length) {
    return state;
  }

  return {
    ...state,
    messages: state.messages.map(normalizeStoredActionMessage)
  };
}

export function PersonaChat({
  onDockStateChange,
  toggleRequest = 0
}: {
  onDockStateChange?: (state: { open: boolean; ready: boolean }) => void;
  toggleRequest?: number;
}) {
  const {
    activeBackend,
    pathname,
    formState,
    submittedAt,
    localActionResult,
    navigate,
    applyFormPatch,
    submitForm,
    setLocalActionResult,
    getCapabilities
  } = useAppState();
  const widgetRef = useRef<AgentWidgetInitHandle | null>(null);
  const lastToggleRequestRef = useRef(toggleRequest);

  const stateRef = useRef({
    pathname,
    formState,
    submittedAt,
    localActionResult,
    navigate,
    applyFormPatch,
    submitForm,
    setLocalActionResult,
    getCapabilities
  });

  useEffect(() => {
    stateRef.current = {
      pathname,
      formState,
      submittedAt,
      localActionResult,
      navigate,
      applyFormPatch,
      submitForm,
      setLocalActionResult,
      getCapabilities
    };
  }, [
    pathname,
    formState,
    submittedAt,
    localActionResult,
    navigate,
    applyFormPatch,
    submitForm,
    setLocalActionResult,
    getCapabilities
  ]);

  useEffect(() => {
    if (toggleRequest === lastToggleRequestRef.current) {
      return;
    }

    lastToggleRequestRef.current = toggleRequest;
    widgetRef.current?.toggle();
  }, [toggleRequest]);

  useEffect(() => {
    let widget: AgentWidgetInitHandle | null = null;
    let localToolSequence = 0;
    let localApprovalSequence = 0;

    const emitToolStart = (
      toolName: string,
      args?: Record<string, unknown>
    ): LocalToolRun | null => {
      if (!widget) {
        return null;
      }

      const startedAt = Date.now();
      const createdAt = new Date(startedAt).toISOString();
      const toolId = `local-tool-${++localToolSequence}`;
      const messageId = `tool-${toolId}`;

      widget.injectTestMessage({
        type: "message",
        message: {
          id: messageId,
          role: "assistant",
          content: "",
          createdAt,
          streaming: true,
          variant: "tool",
          toolCall: {
            id: toolId,
            name: toolName,
            status: "running",
            args,
            startedAt
          }
        }
      });

      const insertedMessage = widget
        .getMessages()
        .find((message) => message.id === messageId);

      return {
        messageId,
        toolId,
        toolName,
        args,
        startedAt,
        createdAt,
        sequence: insertedMessage?.sequence
      };
    };

    const emitToolComplete = (run: LocalToolRun | null, result: unknown) => {
      if (!widget || !run) {
        return;
      }

      const completedAt = Date.now();

      widget.injectTestMessage({
        type: "message",
        message: {
          id: run.messageId,
          role: "assistant",
          content: "",
          createdAt: run.createdAt,
          sequence: run.sequence,
          streaming: false,
          variant: "tool",
          toolCall: {
            id: run.toolId,
            name: run.toolName,
            status: "complete",
            args: run.args,
            result,
            startedAt: run.startedAt,
            completedAt,
            durationMs: Math.max(0, completedAt - run.startedAt)
          }
        }
      });
    };

    const hasPendingSubmitApproval = () =>
      widget?.getMessages().some(
        (message) =>
          message.variant === "approval" &&
          message.approval?.toolName === "submit_form" &&
          message.approval.status === "pending"
      ) ?? false;

    const actionParser: ActionParser = ({ text }) => {
      const jsonText = extractJsonObject(stripCodeFence(text));
      if (!jsonText) {
        return null;
      }

      try {
        const parsed = JSON.parse(jsonText);
        const action = parseClientAction(parsed);
        if (!action) {
          return null;
        }

        if (action.action === "message") {
          return {
            type: action.action,
            payload: { text: action.text },
            raw: action
          };
        }

        if (action.action === "navigate_to_route") {
          return {
            type: action.action,
            payload: {
              routeId: action.routeId,
              text: action.text
            },
            raw: action
          };
        }

        if (action.action === "prefill_form") {
          return {
            type: action.action,
            payload: {
              patch: action.patch,
              text: action.text
            },
            raw: action
          };
        }

        return {
          type: action.action,
          payload: {
            text: action.text
          },
          raw: action
        };
      } catch {
        return null;
      }
    };

    const messageHandler: ActionHandler = (action) => {
      if (action.type !== "message") {
        return;
      }

      return {
        handled: true,
        displayText:
          typeof action.payload.text === "string"
            ? action.payload.text
            : "I reviewed the current page."
      };
    };

    const navigateHandler: ActionHandler = (action, context) => {
      if (action.type !== "navigate_to_route") {
        return;
      }

      const routeId =
        typeof action.payload.routeId === "string" ? action.payload.routeId : "";
      const text =
        typeof action.payload.text === "string"
          ? action.payload.text
          : "Opening the requested route.";
      const toolRun = emitToolStart("navigate_to_route", { routeId });

      void (async () => {
        const result = await stateRef.current.navigate(routeId);
        if (!result.ok) {
          emitToolComplete(toolRun, {
            ok: false,
            reason: result.reason,
            routeId
          });

          const blockedResult = {
            kind: "blocked" as const,
            summary: `Blocked route navigation: ${result.reason}.`,
            details: { routeId },
            timestamp: new Date().toISOString()
          };

          stateRef.current.setLocalActionResult(blockedResult);
          context.updateMetadata((previous) => ({
            ...previous,
            lastLocalActionResult: blockedResult
          }));
          return;
        }

        emitToolComplete(toolRun, {
          ok: true,
          pathname: result.pathname,
          routeId: result.routeId
        });

        const successResult = {
          kind: "navigate" as const,
          summary: `Navigated to ${result.pathname} via route ID ${result.routeId}.`,
          details: result,
          timestamp: new Date().toISOString()
        };

        stateRef.current.setLocalActionResult(successResult);
        context.updateMetadata((previous) => ({
          ...previous,
          lastLocalActionResult: successResult
        }));

        requestAnimationFrame(() => {
          context.triggerResubmit();
        });
      })();

      return {
        handled: true,
        displayText: text
      };
    };

    const prefillHandler: ActionHandler = (action, context) => {
      if (action.type !== "prefill_form") {
        return;
      }

      const patch =
        action.payload.patch && typeof action.payload.patch === "object"
          ? (action.payload.patch as Record<string, unknown>)
          : {};
      const requestedText =
        typeof action.payload.text === "string"
          ? action.payload.text
          : "I filled the allowlisted fields.";
      const toolRun = emitToolStart("prefill_form", patch);
      const result = stateRef.current.applyFormPatch(patch);

      emitToolComplete(toolRun, {
        ok: result.rejected.length === 0,
        applied: result.applied,
        rejected: result.rejected
      });

      if (result.rejected.length > 0) {
        const rejectionSummary = result.rejected
          .map((entry) => `${entry.fieldId}: ${entry.reason}`)
          .join("; ");

        const blockedResult = {
          kind: "blocked" as const,
          summary: `Rejected local patch changes: ${rejectionSummary}.`,
          details: { rejected: result.rejected },
          timestamp: new Date().toISOString()
        };

        stateRef.current.setLocalActionResult(blockedResult);
        context.updateMetadata((previous) => ({
          ...previous,
          lastLocalActionResult: blockedResult
        }));

        return {
          handled: true,
          displayText: `I couldn't apply part of that patch: ${rejectionSummary}`
        };
      }

      const successResult = {
        kind: "prefill" as const,
        summary: `Applied allowlisted fields: ${result.applied
          .map((entry) => getFormFieldDefinition(entry.fieldId).label)
          .join(", ")}.`,
        details: { applied: result.applied },
        timestamp: new Date().toISOString()
      };

      stateRef.current.setLocalActionResult(successResult);
      context.updateMetadata((previous) => ({
        ...previous,
        lastLocalActionResult: successResult
      }));

      requestAnimationFrame(() => {
        context.triggerResubmit();
      });

      return {
        handled: true,
        displayText: requestedText
      };
    };

    const submitHandler: ActionHandler = (action, context) => {
      if (action.type !== "submit_form") {
        return;
      }

      const requestedText =
        typeof action.payload.text === "string"
          ? action.payload.text
          : "I’m requesting form submission.";

      if (stateRef.current.pathname !== demoRoutes.demo_form.path) {
        const blockedResult = {
          kind: "blocked" as const,
          summary: "submit_form is only available on /demo-form.",
          details: {
            pathname: stateRef.current.pathname
          },
          timestamp: new Date().toISOString()
        };

        stateRef.current.setLocalActionResult(blockedResult);
        context.updateMetadata((previous) => ({
          ...previous,
          lastLocalActionResult: blockedResult
        }));

        return {
          handled: true,
          displayText: "I can only submit from the demo form route."
        };
      }

      if (hasPendingSubmitApproval()) {
        return {
          handled: true,
          displayText: "A submit approval request is already waiting in chat."
        };
      }

      const summary = summarizeImplementationRequestForm(
        stateRef.current.formState,
        stateRef.current.submittedAt
      );
      const approvalId = `local-submit-${++localApprovalSequence}`;
      const toolRun = emitToolStart("submit_form", {
        pagePath: stateRef.current.pathname,
        approvalRequired: true
      });

      emitToolComplete(toolRun, {
        status: "approval_required",
        readyToSubmit: summary.readyToSubmit,
        missingManualFieldLabels: summary.missingManualFieldLabels
      });

      const pendingResult = {
        kind: "blocked" as const,
        summary:
          "submit_form is waiting on the built-in approval step before local state can change.",
        details: {
          approvalId,
          readyToSubmit: summary.readyToSubmit,
          missingManualFieldLabels: summary.missingManualFieldLabels
        },
        timestamp: new Date().toISOString()
      };

      stateRef.current.setLocalActionResult(pendingResult);
      context.updateMetadata((previous) => ({
        ...previous,
        lastLocalActionResult: pendingResult
      }));

      widget?.injectTestMessage({
        type: "message",
        message: {
          id: `approval-${approvalId}`,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: false,
          variant: "approval",
          approval: {
            id: approvalId,
            status: "pending",
            agentId: "persona-demo",
            executionId: `submit-form-${Date.now()}`,
            toolName: "submit_form",
            toolType: "local",
            description:
              "Submitting the demo form changes local app state. Approve to run the local submit tool.",
            parameters: {
              pagePath: stateRef.current.pathname,
              readyToSubmit: summary.readyToSubmit,
              missingManualFieldLabels: summary.missingManualFieldLabels
            }
          }
        }
      });

      return {
        handled: true,
        displayText: requestedText
      };
    };

    widget = initAgentWidget({
      target: "#workspace-dock-target",
      config: {
        apiUrl: "/api/chat/dispatch",
        streamParser: createFlexibleJsonStreamParser,
        storageAdapter: createLocalStorageAdapter("persona-demo-state"),
        persistState: {
          storage: "local",
          keyPrefix: "persona-demo-",
          persist: {
            openState: true,
            focusInput: true,
            voiceState: false
          }
        },
        onStateLoaded: (state) => normalizeStoredState(state),
        features: {
          showToolCalls: true
        },
        approval: {
          title: "Approval Required",
          approveLabel: "Approve submit",
          denyLabel: "Deny submit",
          onDecision: async (data, decision) => {
            if (!widget) {
              return;
            }

            if (decision === "approved") {
              const toolRun = emitToolStart("submit_form", {
                approvalId: data.approvalId,
                decision
              });
              const result = stateRef.current.submitForm();

              emitToolComplete(toolRun, {
                ok: result.ok,
                ...(result.ok
                  ? { submittedAt: result.submittedAt }
                  : {
                      reason: result.reason,
                      missingFieldIds: result.missingFieldIds ?? []
                    })
              });

              if (result.ok) {
                const successResult = {
                  kind: "submit" as const,
                  summary: `Submitted the demo form at ${result.submittedAt}.`,
                  details: result,
                  timestamp: new Date().toISOString()
                };

                stateRef.current.setLocalActionResult(successResult);
                widget.injectAssistantMessage({
                  content:
                    "Submission approved. The local submit tool ran successfully and the form is now marked as submitted."
                });
                return;
              }

              const blockedResult = {
                kind: "blocked" as const,
                summary: `Submission stayed blocked: ${result.reason}`,
                details: result,
                timestamp: new Date().toISOString()
              };

              stateRef.current.setLocalActionResult(blockedResult);
              widget.injectAssistantMessage({
                content:
                  result.missingFieldIds && result.missingFieldIds.length > 0
                    ? `Approval was granted, but submission still failed because these manual fields are incomplete: ${result.missingFieldIds.join(", ")}.`
                    : `Approval was granted, but submission still failed: ${result.reason}`
              });
              return;
            }

            const deniedResult = {
              kind: "blocked" as const,
              summary: "Submission approval was denied. The form remains unchanged.",
              details: {
                decision,
                approvalId: data.approvalId
              },
              timestamp: new Date().toISOString()
            };

            stateRef.current.setLocalActionResult(deniedResult);
            widget.injectAssistantMessage({
              content:
                "Submission was not approved. The form remains unchanged and you can keep editing it."
            });
          }
        },
        launcher: {
          enabled: true,
          mountMode: "docked",
          autoExpand: false,
          fullHeight: true,
          mobileBreakpoint: 1120,
          title: "Persona",
          subtitle:
            activeBackend === "ai-gateway"
              ? "Route-aware assistant using Vercel AI Gateway"
              : "Route-aware assistant using a Runtype virtual flow",
          dock: {
            side: "right",
            width: "440px",
            reveal: "emerge",
            animate: true
          }
        },
        theme: personaDemoTheme,
        copy: {
          welcomeTitle: "Persona inside an existing Next.js app",
          welcomeSubtitle:
            "Ask me to open the demo form, fill it from the visible source data, or submit it with approval.",
          inputPlaceholder: "Try: open the demo form and fill it from this page"
        },
        suggestionChips: [
          "Open the demo form",
          "Fill the form from the visible source data",
          "Submit the form"
        ],
        contextProviders: [
          async () => {
            const pageElements = collectEnrichedPageContext({
              options: {
                mode: "structured",
                maxElements: 40,
                maxTextLength: 160,
                visibleOnly: true,
                excludeSelector:
                  "[data-persona-ignore='true'], .persona-host, [data-persona-root='true'], [data-persona-dock-role='panel']"
              },
              rules: defaultParseRules
            });

            const currentFormSummary = summarizeImplementationRequestForm(
              stateRef.current.formState,
              stateRef.current.submittedAt
            );
            const capabilities = stateRef.current.getCapabilities(
              stateRef.current.pathname
            );

            return {
              backend: activeBackend,
              pageTitle: document.title,
              pagePath: stateRef.current.pathname,
              pageContext: formatEnrichedContext(pageElements),
              sourceData: demoSourceData,
              sourceDataJson: JSON.stringify(demoSourceData, null, 2),
              formSummary: currentFormSummary,
              formSummaryJson: JSON.stringify(currentFormSummary, null, 2),
              capabilities,
              capabilitiesJson: JSON.stringify(capabilities, null, 2),
              lastLocalActionResult: stateRef.current.localActionResult,
              lastLocalActionResultJson: JSON.stringify(
                stateRef.current.localActionResult ?? {},
                null,
                2
              )
            };
          }
        ],
        requestMiddleware: ({ payload }) => {
          if (!payload.context) {
            return payload;
          }

          return {
            ...payload,
            inputs: {
              ...(payload.inputs ?? {}),
              ...payload.context
            },
            metadata: {
              ...(payload.metadata ?? {}),
              ...payload.context
            },
            context: undefined
          };
        },
        actionParsers: [actionParser],
        actionHandlers: [
          messageHandler,
          navigateHandler,
          prefillHandler,
          submitHandler
        ],
        postprocessMessage: ({ text }) => markdownPostprocessor(text),
        debug: process.env.NODE_ENV === "development"
      }
    });
    widgetRef.current = widget;

    const syncDockState = () => {
      if (!widget) {
        return;
      }

      onDockStateChange?.({
        open: widget.getState().open,
        ready: true
      });
    };

    syncDockState();

    const unsubscribeOpened = widget.on("widget:opened", syncDockState);
    const unsubscribeClosed = widget.on("widget:closed", syncDockState);

    return () => {
      unsubscribeOpened();
      unsubscribeClosed();
      widgetRef.current = null;
      onDockStateChange?.({
        open: false,
        ready: false
      });
      widget.destroy();
    };
  }, [activeBackend, onDockStateChange]);

  return null;
}
