"use client";

import { getArcColor } from "@/lib/arc-colors";
import type { ArcFrame } from "@/lib/arc-types";

type GameBoardProps = {
  /** The latest frame(s) from the ARC API — typically the last element is the display grid */
  frames: ArcFrame[] | null;
  /** Current game state */
  state: string | null;
  /** Current score */
  score: number;
  /** Levels completed */
  levelsCompleted: number;
  /** Available actions for the current state */
  availableActions: string[];
  /** Current game ID */
  gameId: string | null;
};

export default function GameBoard({
  frames,
  state,
  score,
  levelsCompleted,
  availableActions,
  gameId,
}: GameBoardProps) {
  // Use the last frame (the display frame)
  const grid = frames && frames.length > 0 ? frames[frames.length - 1] : null;

  if (!grid || !gameId) {
    return (
      <div className="game-board-wrapper">
        <div className="empty-board">
          <div className="icon">&#x1F3AE;</div>
          <p>
            No game running yet. Ask the agent to start an ARC-AGI-3 game — try
            something like <strong>&ldquo;Play the ls20 game&rdquo;</strong>.
          </p>
        </div>
      </div>
    );
  }

  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const maxBoardSize = 512;
  const cellSize = Math.max(2, Math.floor(maxBoardSize / Math.max(rows, cols)));

  return (
    <div className="game-board-wrapper">
      {/* Status cards */}
      <div className="game-info">
        <div className="game-info-card">
          <div className="label">Game</div>
          <div className="value" style={{ fontSize: 16 }}>
            {gameId}
          </div>
        </div>
        <div className="game-info-card">
          <div className="label">Score</div>
          <div className="value">{score}</div>
        </div>
        <div className="game-info-card">
          <div className="label">Levels</div>
          <div className="value">{levelsCompleted}</div>
        </div>
        <div className="game-info-card">
          <div className="label">State</div>
          <div
            className="value"
            style={{
              fontSize: 14,
              color:
                state === "WIN"
                  ? "var(--success)"
                  : state === "GAME_OVER"
                    ? "var(--danger)"
                    : "var(--text)",
            }}
          >
            {state ?? "—"}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="game-board-container">
        <div
          className="game-board"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => (
              <div
                key={`${x}-${y}`}
                className="cell"
                style={{
                  backgroundColor: getArcColor(cell),
                  width: cellSize,
                  height: cellSize,
                }}
                title={`(${x}, ${y}) = ${cell}`}
              />
            ))
          )}
        </div>
      </div>

      {/* Available actions */}
      {availableActions.length > 0 && (
        <div className="available-actions">
          {availableActions.map((action) => (
            <span key={action} className="action-badge">
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
