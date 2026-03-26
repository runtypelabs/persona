"use client";

import { useState, useCallback } from "react";
import GameBoard from "@/components/GameBoard";
import PersonaAgent from "@/components/PersonaAgent";
import type { ArcGameState } from "@/lib/arc-types";

const API_URL =
  process.env.NEXT_PUBLIC_PERSONA_API_URL ??
  "http://localhost:43111/api/chat/dispatch";

export default function Home() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [frames, setFrames] = useState<number[][][] | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [levelsCompleted, setLevelsCompleted] = useState(0);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [actionCount, setActionCount] = useState(0);

  const handleGameStateUpdate = useCallback(
    (gameState: ArcGameState & { game_id?: string }) => {
      if (gameState.game_id) setGameId(gameState.game_id);
      if (gameState.frame) setFrames(gameState.frame);
      if (gameState.state) setState(gameState.state);
      if (gameState.score !== undefined) setScore(gameState.score);
      if (gameState.levels_completed !== undefined)
        setLevelsCompleted(gameState.levels_completed);
      if (gameState.available_actions)
        setAvailableActions(gameState.available_actions);
      setActionCount((prev) => prev + 1);
    },
    []
  );

  const statusDotClass = !state
    ? ""
    : state === "WIN"
      ? "win"
      : state === "GAME_OVER"
        ? "gameover"
        : "active";

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>
          ARC-AGI Player
          <span className="badge">Persona Agent</span>
        </h1>
        <div className="header-status">
          <span className="status-pill">
            <span className={`dot ${statusDotClass}`} />
            {!state ? "Idle" : state.replace("_", " ")}
          </span>
          {actionCount > 0 && (
            <span className="status-pill">Actions: {actionCount}</span>
          )}
        </div>
      </header>

      <div className="game-panel">
        <GameBoard
          frames={frames}
          state={state}
          score={score}
          levelsCompleted={levelsCompleted}
          availableActions={availableActions}
          gameId={gameId}
        />
      </div>

      <div className="chat-panel">
        <PersonaAgent
          apiUrl={API_URL}
          onGameStateUpdate={handleGameStateUpdate}
        />
      </div>
    </div>
  );
}
