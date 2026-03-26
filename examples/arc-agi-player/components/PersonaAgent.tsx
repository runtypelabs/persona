"use client";

import { useEffect, useRef, useCallback } from "react";
import type { ArcGameState } from "@/lib/arc-types";

// Tool IDs for the ARC tools we created on the Runtype platform
const ARC_TOOL_IDS = [
  "arc_list_games",
  "arc_start_game",
  "arc_simple_action",
  "arc_click_action",
];

const SYSTEM_PROMPT = `You are an expert ARC-AGI-3 game player. Your goal is to play and WIN ARC-AGI-3 puzzle games by reasoning about the game state and taking strategic actions.

## How ARC-AGI-3 Works
- Games are interactive 2D grid environments with puzzle mechanics
- The grid uses colors 0-15 where each color represents a different state
- You interact through 7 possible actions:
  - ACTION1 (up), ACTION2 (down), ACTION3 (left), ACTION4 (right)
  - ACTION5 (interact/select/rotate/execute)
  - ACTION6 (click at x,y coordinates, 0-63 range)
  - ACTION7 (undo)
- Each game has different rules you must discover through experimentation
- Games have multiple levels of increasing difficulty
- Game states: NOT_FINISHED (playing), WIN (completed!), GAME_OVER (failed)

## Your Strategy
1. First, call arc_list_games to see available games (or start with the game the user requests)
2. Call arc_start_game to begin — study the initial frame carefully
3. Note which actions are available (returned in available_actions)
4. Analyze the grid patterns: look for colored objects, empty spaces, patterns, symmetry
5. Form a hypothesis about what the game wants you to do
6. Take actions methodically — try one action at a time and observe changes
7. If stuck, try ACTION5 (interact) or ACTION6 (click) on notable grid positions
8. If GAME_OVER, reset and try a different approach
9. Track what works and refine your strategy across attempts

## Important Rules
- ALWAYS check available_actions before choosing an action — only use actions that are listed
- After each action, carefully compare the new frame to the previous one
- Describe what you observe changing on the grid after each action
- Keep track of the game_id and guid — you need them for every action call
- When the frame contains multiple grids, focus on the last one (display frame)
- Be systematic: try each available action to learn what it does before committing to a strategy

## Communication
- Explain your reasoning and observations to the user as you play
- Describe what you see on the grid in natural language
- Share your hypotheses about the game mechanics
- Celebrate when you complete levels or win!`;

type PersonaAgentProps = {
  apiUrl: string;
  onGameStateUpdate: (state: ArcGameState) => void;
};

export default function PersonaAgent({
  apiUrl,
  onGameStateUpdate,
}: PersonaAgentProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controllerRef = useRef<any>(null);
  const onGameStateUpdateRef = useRef(onGameStateUpdate);
  onGameStateUpdateRef.current = onGameStateUpdate;

  const handleMessage = useCallback(
    (message: {
      toolCall?: { name?: string; args?: unknown; result?: unknown };
      tools?: Array<{ name?: string; args?: unknown; result?: unknown }>;
    }) => {
      const processToolResult = (
        name: string | undefined,
        args: unknown,
        result: unknown
      ) => {
        if (!name || !result || typeof result !== "object") return;

        const data = result as Record<string, unknown>;
        const toolArgs = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;

        if (
          name === "arc_start_game" ||
          name === "arc_simple_action" ||
          name === "arc_click_action"
        ) {
          const update: ArcGameState & { game_id?: string } = {
            guid: data.guid as string | undefined,
            state: (data.state as ArcGameState["state"]) ?? "NOT_FINISHED",
            score: (data.score as number) ?? 0,
            levels_completed: data.levels_completed as number | undefined,
            available_actions: data.available_actions as string[] | undefined,
            frame: data.frame as number[][][] | undefined,
          };

          // Extract game_id from the tool's input args
          if (toolArgs.game_id) {
            update.game_id = toolArgs.game_id as string;
          }

          onGameStateUpdateRef.current(update);
        }
      };

      // Handle single tool call
      if (message.toolCall?.result) {
        processToolResult(
          message.toolCall.name,
          message.toolCall.args,
          message.toolCall.result
        );
      }

      // Handle multiple tool calls in the tools array
      if (message.tools) {
        for (const tool of message.tools) {
          if (tool.result) {
            processToolResult(tool.name, tool.args, tool.result);
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!mountRef.current || controllerRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controller: any = null;

    import("@runtypelabs/persona").then(
      ({ createAgentExperience, DEFAULT_WIDGET_CONFIG, markdownPostprocessor }) => {
        if (!mountRef.current) return;

        controller = createAgentExperience(mountRef.current, {
          ...DEFAULT_WIDGET_CONFIG,
          apiUrl,

          agent: {
            name: "ARC-AGI Player",
            model: "claude-sonnet-4-20250514",
            systemPrompt: SYSTEM_PROMPT,
            temperature: 0.3,
            tools: {
              toolIds: ARC_TOOL_IDS,
            },
            loopConfig: {
              maxTurns: 25,
            },
          },
          agentOptions: {
            streamResponse: true,
            recordMode: "virtual",
            storeResults: false,
          },

          iterationDisplay: "separate" as "separate",

          launcher: {
            ...DEFAULT_WIDGET_CONFIG.launcher,
            width: "100%",
            enabled: false,
          },
          copy: {
            ...DEFAULT_WIDGET_CONFIG.copy,
            welcomeTitle: "ARC-AGI-3 Agent",
            welcomeSubtitle:
              "I can play ARC-AGI-3 puzzle games! Tell me which game to try, or I'll pick one for you.",
            inputPlaceholder: "e.g. 'Play the ls20 game' or 'List available games'",
          },
          suggestionChips: [
            "Play the ls20 game and try to win",
            "List the available ARC-AGI-3 games",
            "Play ft09 — explain your strategy as you go",
          ],
          postprocessMessage: ({ text }: { text: string }) =>
            markdownPostprocessor(text),
        });

        controllerRef.current = controller;

        // Listen for tool results in assistant messages
        controller.on("assistant:message", handleMessage);
        controller.on("assistant:complete", handleMessage);
      }
    );

    return () => {
      if (controller) {
        controller.off("assistant:message", handleMessage);
        controller.off("assistant:complete", handleMessage);
        controller.destroy();
        controllerRef.current = null;
      }
    };
  }, [apiUrl, handleMessage]);

  return <div ref={mountRef} style={{ height: "100%" }} />;
}
