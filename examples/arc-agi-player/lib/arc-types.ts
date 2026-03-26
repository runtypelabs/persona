/** A single frame from the ARC-AGI-3 API */
export type ArcFrame = number[][];

/** Game state returned by the ARC API */
export type ArcGameState = {
  guid?: string;
  state: "NOT_FINISHED" | "WIN" | "GAME_OVER" | "NOT_PLAYED";
  score: number;
  levels_completed?: number;
  available_actions?: string[];
  frame?: ArcFrame[];
};

/** Available ARC actions */
export type ArcAction =
  | "RESET"
  | "ACTION1"
  | "ACTION2"
  | "ACTION3"
  | "ACTION4"
  | "ACTION5"
  | "ACTION6"
  | "ACTION7";
